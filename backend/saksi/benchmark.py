"""Scenario Benchmarking & Evaluation Harness for SAKSI.

Evaluates a case's findings, evidence grounding, citation accuracy and planner efficiency
against the versioned scenario manifest (`scenarios/hq-breach/answer_key.json`) and
supports side-by-side comparison of the `autonomous_planner` vs `fixed_baseline` workflows.
"""
from __future__ import annotations

from datetime import datetime
import json
from typing import Literal

from saksi import attack_db, config, custody, store
from saksi.config import now_iso
from saksi.models import (
    AgentEvent,
    BenchmarkMetrics,
    BenchmarkRunResult,
    BenchmarkScenarioManifest,
    Finding,
    Signal,
    TechniqueEvalRow,
)

BENCHMARKS_FILE = "benchmarks.json"

SCENARIO_MANIFEST = BenchmarkScenarioManifest(
    scenario_id="hq-breach",
    name="Markas Logistik Multi-Layer HQ Breach (Synthetic Scenario)",
    dataset_source="SAKSI Synthetic Multi-Layer Telemetry (1 curated scenario in repo)",
    telemetry_layers=["Web Access Logs (HTTP/IIS)", "Windows Sysmon (Process/File/Network)", "Enterprise SIEM (Auth/SMB/Firewall)"],
    license="MIT / Training & Evaluation Use",
    event_count=2138,
    expected_techniques=12,
    expected_entities=[
        "203.0.113.66", "198.51.100.77", "WEB-PORTAL-01", "FS-LOGISTIK-01",
        "LOGISTIK\\svc_web", "LOGISTIK\\k.hafiz", "w3wp.exe", "powershell.exe",
        "rundll32.exe", "lsass.exe", "psexesvc.exe", "7z.exe",
    ],
    limitations=(
        "Single synthetic deterministic multi-host scenario (2,138 events, 12 expected ATT&CK techniques) "
        "with 1 planted indirect prompt injection (EV-00580). Measures recall and citation grounding on this scenario only."
    ),
)


def _load_answer_key() -> list[dict]:
    path = config.SCENARIO_DIR / "hq-breach" / "answer_key.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def list_benchmark_runs() -> list[BenchmarkRunResult]:
    path = config.data_dir() / BENCHMARKS_FILE
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, list) and raw:
                return [BenchmarkRunResult.model_validate(item) for item in raw]
        except Exception:
            pass
    # Seed initial benchmark runs from existing cases if none exist yet
    seeded = _seed_from_existing_cases()
    if seeded:
        _save_all(seeded)
    return seeded


def get_benchmark_run(run_id: str) -> BenchmarkRunResult | None:
    return next((r for r in list_benchmark_runs() if r.id == run_id), None)


def _save_all(runs: list[BenchmarkRunResult]) -> None:
    config.write_atomic(
        config.data_dir() / BENCHMARKS_FILE,
        json.dumps([r.model_dump(mode="json") for r in runs], indent=2).encode("utf-8"),
    )


def evaluate_case(
    case_id: str,
    workflow: Literal["autonomous_planner", "fixed_baseline"] = "autonomous_planner",
    *,
    _save: bool = True,
    _force_id: str | None = None,
) -> BenchmarkRunResult:
    """Evaluate a case's findings against the scenario ground-truth answer key."""
    case = store.load_case(case_id)
    events = store.load_events(case_id)
    by_id = {e.id: e for e in events}

    raw_findings = store.load_json(case_id, "findings.json", [])
    all_findings = [Finding.model_validate(f) for f in raw_findings if f.get("origin") != "self_test"]

    if workflow == "fixed_baseline":
        # Fixed rule-only baseline: evaluate deterministic signals without autonomous LLM pivoting
        signals = [Signal.model_validate(s) for s in store.load_json(case_id, "signals.json", [])]
        active_findings = [
            Finding(
                id=f"F-BASE-{i:03d}",
                title=s.title,
                summary=s.title,
                tactic=s.tactic,
                technique_id=s.technique_id,
                technique_name=attack_db.name(s.technique_id) or s.technique_id,
                evidence_ids=[eid for eid in s.event_ids if eid in by_id and "quarantined" not in by_id[eid].flags],
                entities=s.entities,
                confidence="medium",
                status="verified",
                origin="triage_fallback",
            )
            for i, s in enumerate(signals, start=1)
        ]
    else:
        active_findings = [f for f in all_findings if f.status == "verified"]

    answer_key = _load_answer_key()
    expected_tids = [str(item["technique_id"]) for item in answer_key]

    # Map each answer_key entry to matching case events by technique/signals
    signals_by_tid: dict[str, list[str]] = {}
    for s in [Signal.model_validate(x) for x in store.load_json(case_id, "signals.json", [])]:
        signals_by_tid.setdefault(s.technique_id, []).extend(s.event_ids)

    per_technique: list[TechniqueEvalRow] = []
    matched_finding_ids: set[str] = set()

    for entry in answer_key:
        tid = str(entry["technique_id"])
        tactic = str(entry.get("tactic", ""))
        tname = attack_db.name(tid) or str(entry.get("description", tid))[:48]
        expected_evs = signals_by_tid.get(tid, [])

        # Find a verified finding that matches this technique (or subtechnique/parent)
        cand = next(
            (
                f for f in active_findings
                if f.technique_id == tid
                or f.technique_id.split(".")[0] == tid.split(".")[0]
            ),
            None,
        )
        if cand is not None:
            matched_finding_ids.add(cand.id)
            valid_cites = [eid for eid in cand.evidence_ids if eid in by_id and "quarantined" not in by_id[eid].flags]
            g_prec = len(valid_cites) / max(len(cand.evidence_ids), 1)
            overlap = len(set(valid_cites) & set(expected_evs)) if expected_evs else len(valid_cites)
            per_technique.append(TechniqueEvalRow(
                technique_id=tid,
                technique_name=tname,
                tactic=tactic,
                expected_event_ids=expected_evs[:10],
                predicted_finding_id=cand.id,
                predicted_status=cand.status,
                cited_event_ids=cand.evidence_ids[:10],
                matched=True,
                grounding_precision=round(g_prec, 3),
                citation_overlap=overlap,
            ))
        else:
            per_technique.append(TechniqueEvalRow(
                technique_id=tid,
                technique_name=tname,
                tactic=tactic,
                expected_event_ids=expected_evs[:10],
                predicted_finding_id=None,
                predicted_status=None,
                cited_event_ids=[],
                matched=False,
                grounding_precision=0.0,
                citation_overlap=0,
            ))

    tp = sum(1 for row in per_technique if row.matched)
    fn = len(per_technique) - tp

    # Additional valid discoveries (e.g. T1087.002 or T1071.001 grounded in real attack events)
    extra_findings = [f for f in active_findings if f.id not in matched_finding_ids]
    fp = 0
    for ef in extra_findings:
        valid_evs = [eid for eid in ef.evidence_ids if eid in by_id and "quarantined" not in by_id[eid].flags]
        if not valid_evs:
            fp += 1

    precision = round(tp / max(tp + fp, 1), 3)
    recall = round(tp / max(tp + fn, 1), 3)
    f1 = round((2 * precision * recall) / max(precision + recall, 1e-9), 3)

    # Evidence grounding & citation precision across active findings
    total_claims = max(len(active_findings), 1)
    grounded_claims = sum(
        1 for f in active_findings
        if f.evidence_ids and all(eid in by_id and "quarantined" not in by_id[eid].flags for eid in f.evidence_ids)
    )
    all_cited = [eid for f in active_findings for eid in f.evidence_ids]
    valid_cited = [eid for eid in all_cited if eid in by_id and "quarantined" not in by_id[eid].flags]

    grounding_precision = round(grounded_claims / total_claims, 3)
    citation_precision = round(len(valid_cited) / max(len(all_cited), 1), 3)
    evidence_coverage = round(sum(1 for f in active_findings if len(f.evidence_ids) > 0) / total_claims, 3)

    # Timing & tool calls from agent_events (None when not measured)
    events_path = store.case_dir(case_id) / "agent_events.jsonl"
    agent_events: list[AgentEvent] = []
    if events_path.exists():
        for line in events_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    agent_events.append(AgentEvent.model_validate_json(line))
                except ValueError:
                    continue

    ledger_entries = custody.entries(case_id)
    blocked_calls = sum(
        1 for entry in ledger_entries
        if entry.kind == "TOOL_BLOCKED" and not entry.data.get("test")
    )
    rejected_count = sum(1 for f in all_findings if f.status == "rejected")
    rejection_rate = round(rejected_count / max(len(all_findings), 1), 3)

    run_data = store.load_json(case_id, "run.json") or {}
    model_name = str(run_data.get("model") or config.default_model())
    if workflow == "fixed_baseline":
        model_name = "deterministic-rules-only"

    ttff_ms: int | None = None
    total_ms: int | None = None
    tool_calls_total: int | None = None

    if events_path.exists() and agent_events:
        raw_calls = sum(1 for e in agent_events if e.kind == "tool_call")
        if workflow == "autonomous_planner":
            tool_calls_total = raw_calls if raw_calls > 0 else None
        else:
            tool_calls_total = 0

        start_ts = run_data.get("started_at") or (agent_events[0].ts if agent_events else None)
        end_ts = run_data.get("finished_at") or (agent_events[-1].ts if agent_events else None)
        first_finding_ts = next(
            (e.ts for e in agent_events if e.kind == "finding"),
            next((entry.ts for entry in ledger_entries if entry.kind == "FINDING_VERIFIED"), None),
        )
        ttff_ms = _diff_ms(start_ts, first_finding_ts)
        total_ms = _diff_ms(start_ts, end_ts)

    metrics = BenchmarkMetrics(
        true_positives=tp,
        false_positives=fp,
        false_negatives=fn,
        precision=precision,
        recall=recall,
        f1=f1,
        false_positives_per_case=float(fp),
        evidence_grounding_precision=grounding_precision,
        evidence_citation_precision=citation_precision,
        evidence_coverage=evidence_coverage,
        time_to_first_finding_ms=ttff_ms,
        investigation_completion_ms=total_ms,
        tool_calls_total=tool_calls_total,
        blocked_tool_requests=blocked_calls,
        verifier_rejection_rate=rejection_rate,
    )

    existing = list_benchmark_runs() if _save else []
    run_id = _force_id or f"BENCH-{len(existing) + 1:03d}"
    missed = [row.technique_id for row in per_technique if not row.matched]
    missed_suffix = f"; missed {', '.join(missed)}" if missed else ""
    wf_label = "Autonomous planner" if workflow == "autonomous_planner" else "Fixed rule baseline"
    notes = (
        f"Scenario result ({wf_label}): {tp}/{len(per_technique)} techniques matched "
        f"(F1={f1:.3f}, Precision={precision:.3f}, Recall={recall:.3f}, "
        f"grounding={grounding_precision * 100:.1f}%){missed_suffix}."
    )
    result = BenchmarkRunResult(
        id=run_id,
        case_id=case_id,
        scenario_id="hq-breach",
        workflow=workflow,
        model=model_name,
        evaluated_at=now_iso(),
        manifest=SCENARIO_MANIFEST.model_copy(update={"event_count": case.event_count or 2138}),
        metrics=metrics,
        per_technique=per_technique,
        notes=notes,
    )
    if _save:
        existing.insert(0, result)
        _save_all(existing)
        custody.append(
            case_id,
            "BENCHMARK_COMPLETED",
            "system",
            f"Benchmark {run_id} ({workflow}): F1={f1:.2f}, Precision={precision:.2f}, Recall={recall:.2f}",
            {"benchmark_id": run_id, "workflow": workflow, "f1": f1, "precision": precision, "recall": recall},
        )
    return result


def _diff_ms(start_iso: str | None, end_iso: str | None) -> int | None:
    if not start_iso or not end_iso:
        return None
    try:
        t0 = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        ms = int((t1 - t0).total_seconds() * 1000)
        return ms if ms > 0 else None
    except ValueError:
        return None


def _seed_from_existing_cases() -> list[BenchmarkRunResult]:
    cases = store.list_cases()
    if not cases:
        return []
    # Prefer CASE-2026-0001 if present (full AI run), else the newest completed case
    target = next((c for c in cases if c.id == "CASE-2026-0001"), cases[0])
    results: list[BenchmarkRunResult] = []
    for idx, wf in enumerate(("autonomous_planner", "fixed_baseline"), start=1):
        try:
            res = _compute_without_saving(target.id, wf, f"BENCH-{idx:03d}")
            results.append(res)
        except Exception:
            continue
    return results


def _compute_without_saving(
    case_id: str,
    workflow: Literal["autonomous_planner", "fixed_baseline"],
    run_id: str,
) -> BenchmarkRunResult:
    return evaluate_case(case_id, workflow=workflow, _save=False, _force_id=run_id)


