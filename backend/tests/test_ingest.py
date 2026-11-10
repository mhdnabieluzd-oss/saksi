"""Scenario determinism, ingestion of the hq-breach case and generic normalisation of the sample datasets."""

from __future__ import annotations

import json

from saksi import attack_db, custody, store
from saksi.config import BASE_DIR
from saksi.ingest.ingest import create_case_from_files
from saksi.ingest.scenario import INJECTION_UA, answer_key_path, build_hq_breach, ensure_scenario


def test_scenario_files_are_byte_identical_across_generations() -> None:
    assert build_hq_breach() == build_hq_breach()


def test_every_answer_key_pair_is_valid_in_attack_db() -> None:
    key = json.loads(answer_key_path().read_text(encoding="utf-8"))
    assert key
    for entry in key:
        assert attack_db.exists(entry["technique_id"]), entry["technique_id"]
        assert entry["tactic"] in attack_db.tactics_for(entry["technique_id"]), entry


def test_hq_breach_case_has_sorted_sequential_verified_events() -> None:
    case = create_case_from_files(ensure_scenario(), "HQ breach (simulated)", True)
    events = store.load_events(case.id)

    assert 1900 <= len(events) <= 2300
    assert case.event_count == len(events)
    assert [event.id for event in events] == [f"EV-{number:05d}" for number in range(1, len(events) + 1)]
    assert all(earlier.ts <= later.ts for earlier, later in zip(events, events[1:]))
    assert all(custody.event_integrity(event).match for event in events)
    assert custody.verify(case.id).ok is True


def test_naming_conventions_hold() -> None:
    case = create_case_from_files(ensure_scenario(), "conventions", True)
    for event in store.load_events(case.id):
        for process in (event.process, event.parent_process):
            if process:
                assert process == process.lower()
                assert "\\" not in process and "/" not in process
        if event.host:
            assert event.host == event.host.upper()


def test_injection_text_appears_in_exactly_one_event() -> None:
    case = create_case_from_files(ensure_scenario(), "injection", True)
    events = store.load_events(case.id)
    assert sum(INJECTION_UA in event.raw for event in events) == 1


def test_generic_sample_and_cloudwatch_csv_ingest(tmp_path) -> None:
    siem_path = tmp_path / "sample_siem_log.json"
    siem_path.write_text(
        json.dumps([
            {"timestamp": "2026-11-08T09:00:00Z", "host": "WS-01", "user": "alice", "message": "logon ok", "severity": "info"},
            {"timestamp": "2026-11-08T09:01:00Z", "host": "WS-01", "user": "alice", "message": "failed logon", "severity": "medium"},
        ]),
        encoding="utf-8",
    )
    csv_path = tmp_path / "CloudWatch_Traffic_Web_Attack.csv"
    csv_path.write_text(
        "time,src_ip,dst_ip,bytes_in,bytes_out,response.code,protocol,detection_types\n"
        "2026-11-08T09:00:00Z,203.0.113.66,10.10.2.15,512,2048,200,HTTPS,waf_rule\n",
        encoding="utf-8",
    )
    siem = create_case_from_files([siem_path], "sample siem", False)
    csv_case = create_case_from_files([csv_path], "cloudwatch", False)

    assert siem.event_count > 0
    assert csv_case.event_count > 0
    assert {source.kind for source in siem.sources + csv_case.sources} == {"generic"}
    assert custody.verify(siem.id).ok is True
    assert custody.verify(csv_case.id).ok is True
