"""Agent pipeline on the real hq-breach scenario, with the LLM faked. Every prompt the model would see is captured."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from saksi import custody, llm, store
from saksi.agents import pipeline, reporter, verifier
from saksi.ingest.ingest import create_case_from_files
from saksi.ingest.scenario import INJECTION_UA, ensure_scenario
from saksi.models import CaseSummary, Finding, Report, Signal

FAKE_MODEL = "fake/model"


class Captured:
    """Every string sent to the model, plus every tool result handed to it."""

    def __init__(self) -> None:
        self.texts: list[str] = []


def _signals(case_id: str) -> list[Signal]:
    return [Signal.model_validate(s) for s in store.load_json(case_id, "signals.json", [])]


def _find(events: list[Any], predicate) -> str:
    return next(e.id for e in events if predicate(e))


def _fake_findings(case_id: str) -> dict[str, Any]:
    events = store.load_events(case_id)
    signals = _signals(case_id)
    quarantined = _find(events, lambda e: "quarantined" in e.flags)
    encoded = next(s for s in signals if s.rule_id == "PS-ENCODED").event_ids[0]
    real = next(e.id for e in events if "suspicious" in e.flags and "quarantined" not in e.flags)
    findings = [{"title": s.title, "summary": f"{s.rule_id}: {s.title}.", "tactic": s.tactic,
                 "technique_id": s.technique_id, "evidence_ids": s.event_ids[:5], "entities": [],
                 "confidence": "high"} for s in signals]
    findings += [
        {"title": "Encoded PowerShell hides the payload", "summary": "Base64 encoded command line.",
         "tactic": "Defense Evasion", "technique_id": "T1027", "evidence_ids": [encoded], "entities": []},
        {"title": "Invented technique", "summary": "Made-up claim.", "tactic": "Execution",
         "technique_id": "T1999.999", "evidence_ids": [real], "entities": []},
        {"title": "Claim based only on injected text", "summary": "Uses the quarantined record.",
         "tactic": "Initial Access", "technique_id": "T1190", "evidence_ids": [quarantined], "entities": []},
    ]
    return {"findings": findings}


def _install_fakes(monkeypatch: pytest.MonkeyPatch, case_id: str, captured: Captured,
                   fail: bool = False) -> None:
    def fake_complete(system: str, user: str, schema_name: str, schema: dict, model=None, max_tokens=3000):
        captured.texts += [system, user]
        if fail:
            raise llm.LlmError("fake outage")
        usage = llm.Usage(model=FAKE_MODEL, prompt_tokens=7, completion_tokens=3)
        if schema_name == "submit_scope":
            return {"scope": "Web intrusion chain into the HQ network.", "priority": "critical",
                    "focus_entities": ["LOGISTIK\\k.hafiz"]}, usage
        if schema_name == "submit_verdicts":
            ids = re.findall(r'"finding_id":"(F-\d{3})"', user)
            return {"verdicts": [{"finding_id": i, "verdict": "supported", "reason": "events show it"}
                                 for i in ids]}, usage
        if schema_name == "submit_report":
            return {
                "title": "HQ breach report", "bluf": "Account compromised. Data left the network.",
                "executive_summary": "Summary.", "incident_overview": "Overview.",
                "timeline": [{"ts": "2026-11-03T01:19:12Z", "description": "SQL injection",
                              "evidence_ids": [_find(store.load_events(case_id), lambda e: True), "EV-99999"]}],
                "affected_systems": ["FS-LOGISTIK-01"], "interpretations": ["Possible lateral movement."],
                "risk_level": "critical", "risk_and_impact": "Confidential data exposed.",
                "decisions_needed": ["Approve containment."], "recommended_actions": ["Reset credentials."],
            }, usage
        raise AssertionError(f"unexpected schema {schema_name}")

    def fake_run_tools(system, messages, tools, handlers, max_rounds=10, final_tool="submit_findings",
                       on_step=None, model=None):
        captured.texts += [system] + [m["content"] for m in messages]
        if fail:
            raise llm.LlmError("fake outage")
        usage = llm.Usage(model=FAKE_MODEL, prompt_tokens=100, completion_tokens=50)
        steps = [
            ("list_signals", {}),
            ("pivot", {"entity": "LOGISTIK\\k.hafiz", "limit": 10}),
            ("search_events", {"query": "Ignore all previous"}),
            ("get_events", {"ids": [_find(store.load_events(case_id), lambda e: "quarantined" in e.flags)]}),
        ]
        on_step({"kind": "llm_call", "round": 1, "usage": usage, "input": messages, "output": {"role": "assistant"},
                 "tool_calls": len(steps)})
        for name, args in steps:
            on_step({"kind": "tool_call", "tool": name, "args": args})
            result, summary = handlers[name](args)
            captured.texts.append(result)
            on_step({"kind": "tool_result", "tool": name, "args": args, "result": result, "summary": summary})
        final = _fake_findings(case_id)
        on_step({"kind": "tool_result", "tool": final_tool, "args": final, "result": {"accepted": True},
                 "summary": "submitted"})
        return llm.ToolRunResult(final_args=final, rounds=1, usage=[usage])

    monkeypatch.setattr(llm, "complete_json", fake_complete)
    monkeypatch.setattr(llm, "run_tools", fake_run_tools)


@pytest.fixture
def case(data_dir: Path) -> CaseSummary:
    return create_case_from_files(ensure_scenario(), "HQ breach (simulated)", True)


def _findings(case_id: str) -> list[Finding]:
    return [Finding.model_validate(f) for f in store.load_json(case_id, "findings.json", [])]


def test_run_completes_with_verified_and_rejected_findings(case, monkeypatch) -> None:
    captured = Captured()
    _install_fakes(monkeypatch, case.id, captured)
    run = pipeline.run_sync(case.id)

    assert run.state == "completed"
    assert {a.name: a.state for a in run.agents} == {
        "triage": "completed", "investigator": "completed", "verifier": "completed", "reporter": "completed"}
    findings = _findings(case.id)
    verified = [f for f in findings if f.status == "verified"]
    assert len(verified) >= 8
    assert store.load_case(case.id).status == "completed"


def test_invalid_technique_is_rejected_and_defense_evasion_normalised(case, monkeypatch) -> None:
    _install_fakes(monkeypatch, case.id, Captured())
    pipeline.run_sync(case.id)
    findings = _findings(case.id)

    bogus = next(f for f in findings if f.technique_id == "T1999.999")
    assert bogus.status == "rejected"
    assert bogus.verification is not None
    assert "does not exist" in bogus.verification.verdict_reason

    evasion = next(f for f in findings if f.technique_id == "T1027")
    tactic_check = next(c for c in evasion.verification.checks if c.name == "tactic_consistent")
    assert tactic_check.passed is True
    assert evasion.tactic == "Stealth"
    assert evasion.status == "verified"


def test_quarantined_only_claim_is_rejected(case, monkeypatch) -> None:
    _install_fakes(monkeypatch, case.id, Captured())
    pipeline.run_sync(case.id)
    injected = next(f for f in _findings(case.id) if f.title == "Claim based only on injected text")
    assert injected.status == "rejected"
    check = next(c for c in injected.verification.checks if c.name == "not_quarantined_only")
    assert check.passed is False


def test_graph_and_story_exclude_rejected_and_quarantined(case, monkeypatch) -> None:
    _install_fakes(monkeypatch, case.id, Captured())
    pipeline.run_sync(case.id)
    rejected_ids = {f.id for f in _findings(case.id) if f.status == "rejected"}
    graph = store.load_json(case.id, "graph.json")
    story = store.load_json(case.id, "story.json")
    quarantined = {e.id for e in store.load_events(case.id) if "quarantined" in e.flags}

    assert graph["nodes"] and graph["edges"]
    assert story["steps"]
    for node in graph["nodes"]:
        assert not set(node["finding_ids"]) & rejected_ids
        assert not set(node["event_ids"]) & quarantined
    assert not {s["finding_id"] for s in story["steps"]} & rejected_ids


def test_en_report_contains_only_verified_findings(case, monkeypatch) -> None:
    _install_fakes(monkeypatch, case.id, Captured())
    pipeline.run_sync(case.id)
    report = reporter.load_report(case.id, "en")
    assert isinstance(report, Report)
    verified_ids = {f.id for f in _findings(case.id) if f.status == "verified"}
    assert {f.finding_id for f in report.verified_findings} <= verified_ids
    assert report.verified_findings
    assert all(e.startswith("EV-") and e != "EV-99999" for f in report.verified_findings for e in f.evidence_ids)
    assert [item.evidence_ids for item in report.timeline][0] != ["EV-99999"]
    assert report.report_hash == custody.canonical_hash(report.model_dump(mode="json", exclude={"report_hash"}))


def test_ledger_chain_and_seal_are_valid(case, monkeypatch) -> None:
    _install_fakes(monkeypatch, case.id, Captured())
    pipeline.run_sync(case.id)
    status = custody.verify(case.id)
    assert status.ok, status.reason
    assert status.signature.valid is True
    kinds = {entry.kind for entry in custody.entries(case.id)}
    assert {"AGENT_STEP", "SHIELD_ALERT", "FINDING_VERIFIED", "FINDING_REJECTED", "REPORT_GENERATED", "SEAL"} <= kinds


def test_agent_events_increase_and_link_to_ledger(case, monkeypatch) -> None:
    from saksi import bus
    _install_fakes(monkeypatch, case.id, Captured())
    pipeline.run_sync(case.id)
    events = bus.history(case.id)
    seqs = [e.seq for e in events]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
    ledger = {entry.seq: entry for entry in custody.entries(case.id)}
    linked = [e for e in events if e.ledger_seq is not None]
    assert linked
    assert all(ledger[e.ledger_seq].kind in {"AGENT_STEP", "SHIELD_ALERT", "FINDING_VERIFIED", "FINDING_REJECTED"}
               for e in linked)
    assert any(ledger[e.ledger_seq].kind == "AGENT_STEP" and e.tool for e in linked)


def test_injected_user_agent_never_reaches_the_model(case, monkeypatch) -> None:
    captured = Captured()
    _install_fakes(monkeypatch, case.id, captured)
    pipeline.run_sync(case.id)
    blob = "\n".join(t if isinstance(t, str) else json.dumps(t, default=str) for t in captured.texts)
    assert INJECTION_UA not in blob
    assert "Ignore all previous instructions" not in blob
    assert "<log_data>" in blob


def test_llm_failure_still_completes_with_rule_based_findings(case, monkeypatch) -> None:
    _install_fakes(monkeypatch, case.id, Captured(), fail=True)
    run = pipeline.run_sync(case.id)
    assert run.state == "completed"
    findings = _findings(case.id)
    assert findings
    assert {f.origin for f in findings} == {"triage_fallback"}
    assert all(f.status in ("verified", "rejected") for f in findings)
    report = reporter.load_report(case.id, "en")
    assert report.model == "template"


def test_self_test_is_rejected_and_leaves_graph_and_story_unchanged(case, monkeypatch) -> None:
    _install_fakes(monkeypatch, case.id, Captured())
    pipeline.run_sync(case.id)
    graph_before = (store.case_dir(case.id) / "graph.json").read_text(encoding="utf-8")
    story_before = (store.case_dir(case.id) / "story.json").read_text(encoding="utf-8")

    finding = verifier.self_test(case.id)

    assert finding.id == "F-TEST-001"
    assert finding.origin == "self_test"
    assert finding.status == "rejected"
    assert (store.case_dir(case.id) / "graph.json").read_text(encoding="utf-8") == graph_before
    assert (store.case_dir(case.id) / "story.json").read_text(encoding="utf-8") == story_before
    assert any(entry.kind == "VERIFIER_SELF_TEST" for entry in custody.entries(case.id))
