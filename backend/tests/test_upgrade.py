"""Unit and API integration tests for SAKSI Autonomous Upgrade (Features A, B, C)."""

from __future__ import annotations

import os
from fastapi.testclient import TestClient

from saksi import benchmark, custody, pipeline, planner, responses, tool_registry
from saksi.api import app
from saksi.ingest.ingest import create_case_from_files
from saksi.ingest.scenario import ensure_scenario

client = TestClient(app)


def _make_completed_case() -> str:
    os.environ["OPENROUTER_API_KEY"] = ""
    os.environ["SAKSI_OPENROUTER_API_KEY"] = ""
    paths = ensure_scenario("hq-breach")
    summary = create_case_from_files(paths, "HQ breach at Markas Logistik (simulated)", scenario=True)
    pipeline.run_sync(summary.id)
    return summary.id


def test_tool_registry_allow_and_deny() -> None:
    case_id = _make_completed_case()
    tools = tool_registry.list_tools()
    assert len(tools) >= 8
    names = {t.name for t in tools}
    assert {"list_signals", "search_events", "get_events", "pivot", "get_host_timeline", "related_auth_events"} <= names

    # Valid tool request
    args = {"query": "powershell", "limit": 999}
    ok, reason, tool_def = tool_registry.validate_tool_request(
        case_id,
        "search_events",
        args,
        seen_calls=set(),
    )
    assert ok is True
    assert "allowed" in reason
    assert tool_def is not None
    assert args["limit"] == 25  # clamped to max_results

    # Unregistered tool request is denied and logged to custody
    before_len = len(custody.entries(case_id))
    ok_bad, reason_bad, _ = tool_registry.validate_tool_request(
        case_id,
        "exec_shell",
        {"cmd": "whoami"},
        seen_calls=set(),
    )
    assert ok_bad is False
    assert "not in Tool Registry" in reason_bad
    after_entries = custody.entries(case_id)
    assert len(after_entries) == before_len + 1
    assert after_entries[-1].kind == "TOOL_BLOCKED"


def test_investigation_plan_synthesis_and_api() -> None:
    case_id = _make_completed_case()
    # Trigger a dynamic re-plan step via API
    res_block = client.post(
        f"/api/cases/{case_id}/tool-requests",
        json={"tool_name": "exec_shell", "arguments": {"cmd": "netsh"}},
    )
    assert res_block.status_code == 200
    assert res_block.json()["allowed"] is False

    plans = planner.load_plans(case_id)
    assert len(plans) >= 1

    res = client.get(f"/api/cases/{case_id}/plans")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1

    res_latest = client.get(f"/api/cases/{case_id}/plan")
    assert res_latest.status_code == 200
    assert res_latest.json()["case_id"] == case_id


def test_response_proposal_approval_hash_gate_and_rollback() -> None:
    case_id = _make_completed_case()
    proposals = responses.load_proposals(case_id)
    assert len(proposals) >= 3
    target_prop = proposals[0]

    # Cannot execute before approval
    res_unapproved = client.post(
        f"/api/cases/{case_id}/response-proposals/{target_prop.id}/execute",
        json={"analyst": "Tester", "payload_hash": target_prop.payload_hash, "mode": "simulation"},
    )
    assert res_unapproved.status_code == 400
    assert "approval is required" in res_unapproved.json()["detail"].lower()

    # Cannot approve with tampered payload_hash
    res_bad_hash = client.post(
        f"/api/cases/{case_id}/response-proposals/{target_prop.id}/approve",
        json={"analyst": "Tester", "payload_hash": "0" * 64, "note": "tampered"},
    )
    assert res_bad_hash.status_code == 400
    assert "payload hash mismatch" in res_bad_hash.json()["detail"].lower()

    # Approve with valid payload_hash
    res_approve = client.post(
        f"/api/cases/{case_id}/response-proposals/{target_prop.id}/approve",
        json={"analyst": "Tester", "payload_hash": target_prop.payload_hash, "note": "Verified IOC"},
    )
    assert res_approve.status_code == 200
    assert res_approve.json()["status"] == "approved"

    # Execute in simulation mode
    res_exec = client.post(
        f"/api/cases/{case_id}/response-proposals/{target_prop.id}/execute",
        json={"analyst": "Tester", "payload_hash": target_prop.payload_hash, "mode": "simulation"},
    )
    assert res_exec.status_code == 200
    exec_body = res_exec.json()
    assert exec_body["status"] == "simulated"
    assert "SIMULATED — NO SYSTEM ACTION TAKEN" in exec_body["execution_result"]

    # Rollback
    res_rb = client.post(
        f"/api/cases/{case_id}/response-proposals/{target_prop.id}/rollback",
        json={"analyst": "Tester", "payload_hash": target_prop.payload_hash, "note": "Test complete"},
    )
    assert res_rb.status_code == 200
    assert res_rb.json()["status"] == "rolled_back"


def test_benchmark_harness_and_api() -> None:
    case_id = _make_completed_case()
    auto_run = benchmark.evaluate_case(case_id, workflow="autonomous_planner")
    base_run = benchmark.evaluate_case(case_id, workflow="fixed_baseline")
    assert auto_run.metrics.f1 >= base_run.metrics.f1
    assert auto_run.metrics.evidence_grounding_precision == 1.0

    res = client.get("/api/benchmarks/runs")
    assert res.status_code == 200
    assert len(res.json()) >= 2
