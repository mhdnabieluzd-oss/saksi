"""Pipeline: triage -> investigator -> verifier -> reporter, in a background thread or synchronously."""

from __future__ import annotations

import threading
from typing import Callable

from saksi import bus, config, store
from saksi.agents import error_text, investigator, reporter, triage, update, verifier
from saksi.config import now_iso
from saksi.graphs import finding_severity, SEVERITY_ORDER
from saksi.models import AgentStatus, CaseSummary, Finding, RunStatus, Severity

STEPS: tuple[tuple[str, Callable[[str], None]], ...] = (
    ("triage", triage.run),
    ("investigator", investigator.run),
    ("verifier", verifier.run),
    ("reporter", reporter.run),
)
OUTPUT_FILES = ("findings.json", "graph.json", "story.json", "report_en.json", "report_ms.json", "plan.json", "plans.json", "responses.json")

_GUARD = threading.Lock()
_ACTIVE: set[str] = set()
_PAUSED: dict[str, threading.Event] = {}
_STOPPED: set[str] = set()


def pause_run(case_id: str) -> RunStatus:
    with _GUARD:
        ev = _PAUSED.get(case_id)
        if ev is not None:
            ev.clear()
    run = bus.load_run(case_id)
    if run.state == "running":
        run.state = "paused"
        bus.set_run(case_id, run)
        bus.emit(case_id, "investigator", "status", "Investigation run paused by analyst")
    return run


def resume_run(case_id: str) -> RunStatus:
    with _GUARD:
        ev = _PAUSED.get(case_id)
        if ev is not None:
            ev.set()
    run = bus.load_run(case_id)
    if run.state == "paused":
        run.state = "running"
        bus.set_run(case_id, run)
        bus.emit(case_id, "investigator", "status", "Investigation run resumed by analyst")
    return run


def stop_run(case_id: str) -> RunStatus:
    with _GUARD:
        _STOPPED.add(case_id)
        ev = _PAUSED.get(case_id)
        if ev is not None:
            ev.set()
    run = bus.load_run(case_id)
    if run.state in ("running", "paused"):
        run.state = "stopped"
        run.finished_at = now_iso()
        bus.set_run(case_id, run)
        bus.emit(case_id, "investigator", "warning", "Investigation run stopped by analyst")
    return run


def start_run(case_id: str) -> RunStatus:
    """Start the pipeline in a daemon thread. Raises RuntimeError when the case is already running."""
    _claim(case_id)
    try:
        _begin(case_id)
    except BaseException:
        _release(case_id)
        raise
    threading.Thread(target=_background, args=(case_id,), daemon=True, name=f"saksi-run-{case_id}").start()
    return bus.load_run(case_id)


def run_sync(case_id: str) -> RunStatus:
    """Run the whole pipeline in the calling thread. Used by tests and the smoke script."""
    _claim(case_id)
    try:
        _begin(case_id)
        _work(case_id)
    finally:
        _release(case_id)
    return bus.load_run(case_id)


def get_run(case_id: str) -> RunStatus:
    """Return the current run status: memory, then run.json, then idle."""
    return bus.load_run(case_id)


def _claim(case_id: str) -> None:
    with _GUARD:
        if case_id in _ACTIVE:
            raise RuntimeError(f"A run is already in progress for {case_id}.")
        _ACTIVE.add(case_id)
        _STOPPED.discard(case_id)
        ev = threading.Event()
        ev.set()
        _PAUSED[case_id] = ev


def _release(case_id: str) -> None:
    with _GUARD:
        _ACTIVE.discard(case_id)
        _PAUSED.pop(case_id, None)
        _STOPPED.discard(case_id)


def _background(case_id: str) -> None:
    try:
        _work(case_id)
    finally:
        _release(case_id)


def _begin(case_id: str) -> None:
    """Reset run state, clear outputs of an earlier run, and mark the case running."""
    from saksi import custody

    case = store.load_case(case_id)
    raw_props = store.load_json(case_id, "responses.json", [])
    if isinstance(raw_props, list):
        for item in raw_props:
            if isinstance(item, dict) and item.get("status") in ("approved", "succeeded"):
                custody.append(
                    case_id,
                    "RESPONSE_INVALIDATED",
                    "system",
                    f"Invalidated {item.get('action_type')} on {item.get('target')} ({item.get('id')}): case re-run",
                    {
                        "proposal_id": item.get("id"),
                        "action_type": item.get("action_type"),
                        "target": item.get("target"),
                        "payload_hash": item.get("payload_hash"),
                        "reason": "case re-run",
                    },
                )
    if case.status in ("completed", "failed") or (store.case_dir(case_id) / "responses.json").exists():
        for name in OUTPUT_FILES:
            (store.case_dir(case_id) / name).unlink(missing_ok=True)
    model = config.load_settings().model
    bus.set_run(case_id, RunStatus(
        case_id=case_id, state="running", started_at=now_iso(), model=model,
        agents=[AgentStatus(name=name, state="queued") for name in bus.AGENT_NAMES],
    ))
    case.status = "running"
    store.save_case(case)


def _work(case_id: str) -> None:
    for name, step in STEPS:
        with _GUARD:
            ev = _PAUSED.get(case_id)
        if ev is not None:
            ev.wait()
        with _GUARD:
            if case_id in _STOPPED:
                return
        try:
            step(case_id)
        except Exception as exc:  # any agent failure ends the run with a short, secret-free error
            _fail(case_id, name, exc)
            return
    _complete(case_id)


def _fail(case_id: str, agent: str, exc: BaseException) -> None:
    message = error_text(exc)
    update(case_id, agent, state="failed", task=None, summary=message)
    bus.emit(case_id, agent, "error", f"{agent} failed: {message}")
    run = bus.load_run(case_id)
    run.state, run.finished_at, run.error = "failed", now_iso(), f"{agent} failed: {message}"
    bus.set_run(case_id, run)
    case = store.load_case(case_id)
    case.status = "failed"
    store.save_case(case)


def _complete(case_id: str) -> None:
    findings = [Finding.model_validate(item) for item in store.load_json(case_id, "findings.json", [])]
    active = [f for f in findings if f.origin != "self_test"]
    verified = [f for f in active if f.status == "verified"]
    severity: Severity | None = max((finding_severity(f) for f in verified),
                                    key=SEVERITY_ORDER.index, default=None)
    shield_alerts = store.load_json(case_id, "shield.json", [])
    case: CaseSummary = store.load_case(case_id)
    case.status = "completed"
    case.severity = severity
    case.finding_count = len(active)
    case.verified_count = len(verified)
    case.shield_alert_count = len(shield_alerts)
    store.save_case(case)
    try:
        from saksi import responses
        responses.load_proposals(case_id)
    except Exception:
        pass
    run = bus.load_run(case_id)
    run.state, run.finished_at, run.error = "completed", now_iso(), None
    bus.set_run(case_id, run)
