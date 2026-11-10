"""Contract tests for the UI redesign backend fixes (WP-S)."""

from __future__ import annotations

from saksi import benchmark, graphs, planner, responses, store, tool_registry
from saksi.tests.test_upgrade import _make_completed_case, client


def test_s1_reject_returns_200_and_checks_hash() -> None:
    case_id = _make_completed_case()
    prop = responses.load_proposals(case_id)[0]
    url = f"/api/cases/{case_id}/response-proposals/{prop.id}/reject"

    bad = client.post(url, json={"analyst": "Tester", "payload_hash": "0" * 64, "note": "x"})
    assert bad.status_code == 400

    ok = client.post(url, json={"analyst": "Tester", "payload_hash": prop.payload_hash, "note": "no"})
    assert ok.status_code == 200
    assert ok.json()["status"] == "rejected"


def test_s3_s4_s5_approve_execute_live_lab_and_rollback_contracts() -> None:
    case_id = _make_completed_case()
    prop = responses.load_proposals(case_id)[0]
    base = f"/api/cases/{case_id}/response-proposals/{prop.id}"

    # Approve with simulation scope first -> live_lab must be rejected
    res = client.post(
        f"{base}/approve",
        json={"analyst": "Tester", "payload_hash": prop.payload_hash, "note": "", "mode": "simulation"},
    )
    assert res.status_code == 200
    assert res.json()["approved_mode"] == "simulation"

    live_denied = client.post(
        f"{base}/execute",
        json={
            "analyst": "Tester",
            "payload_hash": prop.payload_hash,
            "mode": "live_lab",
            "confirm_target": prop.target,
            "environment": "LAB-LOCAL",
        },
    )
    assert live_denied.status_code in (400, 409)

    # Test second proposal with live_lab scope, target confirmation, and rollback
    prop2 = responses.load_proposals(case_id)[1]
    base2 = f"/api/cases/{case_id}/response-proposals/{prop2.id}"
    app2 = client.post(
        f"{base2}/approve",
        json={"analyst": "Tester", "payload_hash": prop2.payload_hash, "note": "lab ok", "mode": "live_lab"},
    )
    assert app2.status_code == 200

    # Wrong confirm_target rejected
    bad_target = client.post(
        f"{base2}/execute",
        json={
            "analyst": "Tester",
            "payload_hash": prop2.payload_hash,
            "mode": "live_lab",
            "confirm_target": "WRONG-HOST",
            "environment": "LAB-LOCAL",
        },
    )
    assert bad_target.status_code == 400

    # Correct confirm_target and LAB-LOCAL succeeds with honest wording
    exec_ok = client.post(
        f"{base2}/execute",
        json={
            "analyst": "Tester",
            "payload_hash": prop2.payload_hash,
            "mode": "live_lab",
            "confirm_target": prop2.target,
            "environment": "LAB-LOCAL",
        },
    )
    assert exec_ok.status_code == 200
    assert "LAB-LOCAL" in (exec_ok.json()["execution_result"] or "")

    # Rollback checks payload_hash and updates status
    rb_bad = client.post(
        f"{base2}/rollback",
        json={"analyst": "Tester", "payload_hash": "f" * 64, "note": "undo"},
    )
    assert rb_bad.status_code == 400

    rb_ok = client.post(
        f"{base2}/rollback",
        json={"analyst": "Tester", "payload_hash": prop2.payload_hash, "note": "undo"},
    )
    assert rb_ok.status_code == 200
    assert rb_ok.json()["status"] == "rolled_back"


def test_s7_h1_h2_h3_h4_honesty_and_scrubbing() -> None:
    case_id = _make_completed_case()

    # S7: scrub_args redacts secret-looking keys and tokens
    scrubbed = tool_registry.scrub_args({"api_key": "sk-secret123", "host": "WS-01", "note": "Bearer eyJ123456789"})
    assert str(scrubbed["api_key"]).lower() == "[redacted]"
    assert "[redacted]" in str(scrubbed["note"]).lower()

    # Self-test tool block is tagged as test=True and excluded from benchmark blocked_tool_requests
    gate_res = client.post(
        f"/api/cases/{case_id}/tool-requests",
        json={"tool_name": "exec_shell", "arguments": {"cmd": "whoami"}, "analyst": "analyst:self_test", "test": True},
    )
    assert gate_res.status_code == 200
    assert gate_res.json()["allowed"] is False

    # H1: benchmark evaluation does not fabricate timings when unmeasured and excludes self-test blocks
    run_eval = benchmark.evaluate_case(case_id, workflow="autonomous_planner")
    assert run_eval.metrics.blocked_tool_requests == 0

    # H2: overview supports include_llm=false without probing LLM
    ov = client.get("/api/overview?include_llm=false").json()
    assert ov["llm_checked"] is False
    assert ov["agents_available"] is None

    # H3: graph includes total_nodes and truncated
    g = client.get(f"/api/cases/{case_id}/graph").json()
    assert g["total_nodes"] is not None
    assert g["truncated"] is False

    # H4: reconstructed plan sets reconstructed=True when reconstructed
    plans = client.get(f"/api/cases/{case_id}/plans").json()
    assert len(plans) >= 1
    assert "reconstructed" in plans[0]


def test_investigator_no_response_imports() -> None:
    import ast
    from pathlib import Path
    from saksi.agents import investigator

    source = Path(investigator.__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    forbidden_modules = {"responses", "saksi.responses", "saksi.response", "policy_gate", "adapters"}
    forbidden_names = {"approve_proposal", "execute_proposal", "rollback_proposal", "reject_proposal"}

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                assert alias.name not in forbidden_modules
        elif isinstance(node, ast.ImportFrom):
            assert (node.module or "") not in forbidden_modules
            for alias in node.names:
                assert alias.name not in forbidden_names
        elif isinstance(node, ast.Name):
            assert node.id not in forbidden_names
        elif isinstance(node, ast.Attribute):
            assert node.attr not in forbidden_names


def test_self_test_tool_block_does_not_mutate_plan_versions() -> None:
    case_id = _make_completed_case()
    plans_before = client.get(f"/api/cases/{case_id}/plans").json()
    res = client.post(
        f"/api/cases/{case_id}/tool-requests",
        json={"tool_name": "exec_shell", "arguments": {"cmd": "id"}, "analyst": "Tester", "test": True},
    )
    assert res.status_code == 200
    assert res.json()["allowed"] is False
    plans_after = client.get(f"/api/cases/{case_id}/plans").json()
    assert len(plans_after) == len(plans_before)
    assert plans_after[-1]["version"] == plans_before[-1]["version"]


def test_basis_invalidation_when_cited_finding_changes() -> None:
    case_id = _make_completed_case()
    prop = responses.load_proposals(case_id)[0]
    base = f"/api/cases/{case_id}/response-proposals/{prop.id}"

    app = client.post(
        f"{base}/approve",
        json={"analyst": "Tester", "payload_hash": prop.payload_hash, "note": "ok", "mode": "simulation"},
    )
    assert app.status_code == 200

    # Tamper with a cited finding status to simulate basis invalidation
    findings = store.load_json(case_id, "findings.json", [])
    cited_fid = prop.finding_ids[0]
    for f in findings:
        if f.get("id") == cited_fid:
            f["status"] = "rejected"
    store.save_json(case_id, "findings.json", findings)

    exec_res = client.post(
        f"{base}/execute",
        json={"analyst": "Tester", "payload_hash": prop.payload_hash, "mode": "simulation"},
    )
    assert exec_res.status_code == 400
    updated_prop = next(p for p in responses.load_proposals(case_id) if p.id == prop.id)
    assert updated_prop.status == "invalidated"
    assert updated_prop.invalidated_reason is not None
