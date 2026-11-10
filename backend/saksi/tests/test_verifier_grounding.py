"""Verifier grounding: entities are removed when ungrounded, tactics are corrected to the technique's tactic,
and the hard rejections still apply."""

from __future__ import annotations

from saksi.agents.investigator import _Toolbox
from saksi.agents.verifier import _failure, _hard_checks
from saksi.detect import ip_host_map
from saksi.models import Event, Finding


def _event(eid: str, **fields) -> Event:
    base = {"id": eid, "ts": "2026-11-03T01:00:00Z", "source": "web", "source_file": "x.jsonl",
            "event_type": "http_request", "message": "GET /", "raw": "{}", "sha256": "0" * 64}
    return Event(**{**base, **fields})


WEB = _event("EV-00001", host="WEB-PORTAL-01", src_ip="203.0.113.66", dst_ip="10.10.1.10",
             message="GET /login.aspx -> 500")
FLOW = _event("EV-00002", event_type="network_flow", source="siem", host=None, src_ip="10.10.3.20",
              dst_ip="198.51.100.77", message="session to 198.51.100.77:443 bytes 412MB")
FS_SYSMON = _event("EV-00003", source="sysmon", event_type="process_create", host="FS-LOGISTIK-01",
                   src_ip="10.10.3.20", process="cmd.exe", message="cmd")
EVENTS = [WEB, FLOW, FS_SYSMON]
BY_ID = {e.id: e for e in EVENTS}
IP_HOST = ip_host_map(EVENTS)


def _finding(**overrides) -> Finding:
    base = {"id": "F-001", "title": "t", "summary": "s", "tactic": "Initial Access", "technique_id": "T1190",
            "technique_name": "", "evidence_ids": ["EV-00001"], "entities": []}
    return Finding(**{**base, **overrides})


def _check(checks, name):
    return next(c for c in checks if c.name == name)


def test_ungrounded_entity_is_removed_and_check_passes() -> None:
    finding = _finding(entities=["LOGISTIK\\svc_web", "WEB-PORTAL-01"])
    checks, _cited, _resolved, kept = _hard_checks(finding, BY_ID, IP_HOST)
    check = _check(checks, "entities_in_evidence")
    assert check.passed is True
    assert check.detail == "Removed 1 entity not found in the cited evidence: LOGISTIK\\svc_web"
    assert kept == ["WEB-PORTAL-01"]
    assert _failure(checks) is None


def test_host_is_grounded_by_its_ip_in_cited_events() -> None:
    finding = _finding(technique_id="T1041", tactic="Exfiltration", evidence_ids=["EV-00002"],
                       entities=["FS-LOGISTIK-01"])
    checks, _cited, _resolved, kept = _hard_checks(finding, BY_ID, IP_HOST)
    assert kept == ["FS-LOGISTIK-01"]
    assert _check(checks, "entities_in_evidence").detail == "all entities appear in cited evidence"


def test_ip_is_grounded_by_its_host_in_cited_events() -> None:
    finding = _finding(evidence_ids=["EV-00003"], technique_id="T1059.001", tactic="Execution",
                       entities=["10.10.3.20"])
    checks, _cited, _resolved, kept = _hard_checks(finding, BY_ID, IP_HOST)
    assert kept == ["10.10.3.20"]
    assert _failure(checks) is None


def test_no_grounded_entity_is_a_hard_failure() -> None:
    finding = _finding(entities=["LOGISTIK\\svc_web"])
    checks, _cited, _resolved, kept = _hard_checks(finding, BY_ID, IP_HOST)
    failure = _failure(checks)
    assert failure is not None and failure.name == "entities_in_evidence"
    assert "none of the entities" in failure.detail
    assert kept == []


def test_wrong_tactic_is_corrected_to_the_technique_tactic() -> None:
    finding = _finding(technique_id="T1569.002", tactic="Lateral Movement", evidence_ids=["EV-00003"],
                       entities=[])
    checks, _cited, resolved, _kept = _hard_checks(finding, BY_ID, IP_HOST)
    check = _check(checks, "tactic_consistent")
    assert check.passed is True
    assert check.detail == "Tactic corrected from Lateral Movement to Execution (the tactic of T1569.002)"
    assert resolved == "Execution"


def test_unknown_technique_is_still_a_hard_failure() -> None:
    checks, _cited, _resolved, _kept = _hard_checks(_finding(technique_id="T1999.999"), BY_ID, IP_HOST)
    assert _failure(checks).name == "technique_valid"


def test_missing_evidence_is_still_a_hard_failure() -> None:
    checks, _cited, _resolved, _kept = _hard_checks(_finding(evidence_ids=["EV-99999"]), BY_ID, IP_HOST)
    assert _failure(checks).name == "evidence_exists"


def test_quarantined_only_evidence_is_still_a_hard_failure() -> None:
    quarantined = _event("EV-00009", host="WEB-PORTAL-01", flags=["quarantined"])
    by_id = {**BY_ID, quarantined.id: quarantined}
    checks, _cited, _resolved, _kept = _hard_checks(_finding(evidence_ids=["EV-00009"]), by_id, IP_HOST)
    assert _failure(checks).name == "not_quarantined_only"


def test_lookup_technique_returns_name_and_tactics() -> None:
    text, summary = _Toolbox(EVENTS, []).lookup_technique({"technique_id": "T1569.002"})
    assert "Execution" in text
    assert "T1569.002" in summary
    unknown, _ = _Toolbox(EVENTS, []).lookup_technique({"technique_id": "T1999.999"})
    assert "not in ATT&CK" in unknown
