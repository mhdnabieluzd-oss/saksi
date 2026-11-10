"""HTTP layer: data-layer routes against real storage, agent routes against fakes, uploads, errors, WebSocket."""

from __future__ import annotations

import asyncio
import sys
import types
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from saksi import api
from saksi.models import AgentEvent, Finding, LlmHealth, RunStatus
from saksi.tests.sample_report import sample_report

CSV_BODY = b"timestamp,user,host,message\n2026-11-03T10:00:00Z,alice,WS-01,logon ok\n"


@pytest.fixture
def client() -> TestClient:
    return TestClient(api.app)


@pytest.fixture
def fakes(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """Install fake agent-layer modules in sys.modules so the routes can be tested before those modules exist."""
    state = SimpleNamespace(busy=False, reports={}, chat_error=None, llm_ok=True, unsubscribed=[])

    def start_run(case_id: str) -> RunStatus:
        if state.busy:
            raise RuntimeError("already running")
        state.busy = True
        return RunStatus(case_id=case_id, state="running", agents=[])

    def get_run(case_id: str) -> RunStatus:
        return RunStatus(case_id=case_id, state="running" if state.busy else "idle", agents=[])

    def history(case_id: str, after: int = 0) -> list[AgentEvent]:
        if after >= 1:
            return []
        return [AgentEvent(seq=1, ts="2026-11-08T09:00:00Z", case_id=case_id, agent="triage",
                           kind="action", message="Scanning web access logs")]

    def unsubscribe(case_id: str, queue: asyncio.Queue) -> None:
        state.unsubscribed.append(case_id)

    def answer(case_id: str, question: str) -> Any:
        if state.chat_error is not None:
            raise state.chat_error()
        return {"id": "m1", "role": "assistant", "content": f"Answer to: {question}", "lang": "en",
                "ts": "2026-11-08T09:00:00Z"}

    def generate_report(case_id: str, lang: str, classification: str) -> Any:
        report = sample_report(lang, classification).model_copy(update={"case_id": case_id})
        state.reports[(case_id, lang)] = report
        return report

    class LlmError(Exception):
        pass

    state.LlmError = LlmError

    def health() -> LlmHealth:
        if state.llm_ok:
            return LlmHealth(ok=True, model="anthropic/claude-haiku-5.5", latency_ms=12)
        return LlmHealth(ok=False, model="anthropic/claude-haiku-5.5", detail="offline")

    def self_test(case_id: str) -> Finding:
        return Finding(id="F-TEST-001", title="Bogus claim", summary="x", tactic="Execution",
                       technique_id="T0000", technique_name="Fake", evidence_ids=[],
                       status="rejected", origin="self_test")

    modules: dict[str, Any] = {
        "saksi.pipeline": types.SimpleNamespace(start_run=start_run, get_run=get_run),
        "saksi.bus": types.SimpleNamespace(history=history, subscribe=lambda case_id: asyncio.Queue(),
                                           unsubscribe=unsubscribe),
        "saksi.chat": types.SimpleNamespace(history=lambda case_id: [], answer=answer),
        "saksi.llm": types.SimpleNamespace(LlmError=LlmError, health=health),
        "saksi.agents": types.ModuleType("saksi.agents"),
        "saksi.agents.reporter": types.SimpleNamespace(
            generate_report=generate_report,
            load_report=lambda case_id, lang: state.reports.get((case_id, lang))),
        "saksi.agents.verifier": types.SimpleNamespace(self_test=self_test),
    }
    for name, module in modules.items():
        monkeypatch.setitem(sys.modules, name, module)
    return state


def _scenario(client: TestClient) -> dict[str, Any]:
    response = client.post("/api/cases/scenario", json={})
    assert response.status_code == 200, response.text
    return response.json()


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "version": "1.0"}


def test_settings_round_trip(client: TestClient) -> None:
    default = client.get("/api/settings").json()
    assert default["default_classification"] == "SULIT"

    body = {**default, "analyst_name": "Nabiel", "default_classification": "RAHSIA"}
    assert client.put("/api/settings", json=body).status_code == 200
    assert client.get("/api/settings").json() == body


def test_settings_rejects_unknown_classification(client: TestClient) -> None:
    body = {**client.get("/api/settings").json(), "default_classification": "TOP SECRET"}
    assert client.put("/api/settings", json=body).status_code == 422


def test_scenario_case_list_and_detail(client: TestClient) -> None:
    case = _scenario(client)
    assert case["id"].startswith("CASE-") and case["scenario"] is True
    assert 1900 <= case["event_count"] <= 2300

    assert [item["id"] for item in client.get("/api/cases").json()] == [case["id"]]

    detail = client.get(f"/api/cases/{case['id']}").json()
    assert detail["summary"]["id"] == case["id"]
    assert sum(detail["stats"]["by_source"].values()) == case["event_count"]
    assert detail["stats"]["time_start"] is not None
    assert detail["scope"] == ""
    assert detail["signals"] == [] and detail["findings"] == [] and detail["shield_alerts"] == []


def test_unknown_case_is_404(client: TestClient) -> None:
    response = client.get("/api/cases/CASE-2026-9999")
    assert response.status_code == 404
    assert response.json() == {"detail": "Case CASE-2026-9999 not found"}
    assert client.get("/api/cases/not-a-case").status_code == 404
    assert client.get("/api/cases/CASE-2026-9999/ledger").status_code == 404


def test_events_filter_and_paginate(client: TestClient) -> None:
    case_id = _scenario(client)["id"]
    url = f"/api/cases/{case_id}/events"

    page_one = client.get(url, params={"limit": 10, "offset": 0}).json()
    page_two = client.get(url, params={"limit": 10, "offset": 10}).json()
    assert page_one["total"] > 20
    assert len(page_one["items"]) == 10
    assert {item["id"] for item in page_one["items"]}.isdisjoint({item["id"] for item in page_two["items"]})

    hits = client.get(url, params={"q": "web-portal-01", "limit": 500}).json()
    assert hits["total"] > 0
    assert all("web-portal-01" in (item["raw"] + item["message"] + (item["host"] or "")).lower()
               for item in hits["items"])

    by_source = client.get(url, params={"source": "web", "limit": 500}).json()
    assert by_source["items"] and all(item["source"] == "web" for item in by_source["items"])

    assert client.get(url, params={"flag": "quarantined"}).json()["total"] == 0
    assert client.get(url, params={"limit": 501}).status_code == 422


def test_event_detail_integrity_and_custody(client: TestClient) -> None:
    case_id = _scenario(client)["id"]
    event = client.get(f"/api/cases/{case_id}/events", params={"limit": 1}).json()["items"][0]

    detail = client.get(f"/api/cases/{case_id}/events/{event['id']}").json()
    assert detail["event"]["id"] == event["id"]
    assert detail["integrity"]["match"] is True
    assert detail["integrity"]["stored_hash"] == detail["integrity"]["computed_hash"]
    assert detail["related_finding_ids"] == []
    kinds = [entry["kind"] for entry in detail["custody"]]
    assert "EVENTS_NORMALISED" in kinds and "EVIDENCE_INGESTED" in kinds

    missing = client.get(f"/api/cases/{case_id}/events/EV-99999")
    assert missing.status_code == 404


def test_ledger_verify_tamper_restore(client: TestClient) -> None:
    case_id = _scenario(client)["id"]
    base = f"/api/cases/{case_id}/ledger"

    entries = client.get(base).json()
    assert [entry["kind"] for entry in entries][0] == "CASE_CREATED"
    assert client.get(f"{base}/verify").json()["ok"] is True

    tampered = client.post(f"{base}/tamper").json()
    assert tampered["ok"] is False
    assert tampered["broken_at"] is not None
    assert tampered["tampered_simulation"] is True

    restored = client.post(f"{base}/restore").json()
    assert restored["ok"] is True
    assert restored["tampered_simulation"] is False


def test_upload_rejects_bad_extension_and_too_many_files(client: TestClient) -> None:
    bad = client.post("/api/cases/upload",
                      files=[("files", ("payload.exe", b"MZ", "application/octet-stream"))],
                      data={"title": "x"})
    assert bad.status_code == 400
    assert "payload.exe" in bad.json()["detail"]

    four = [("files", (f"log{index}.csv", CSV_BODY, "text/csv")) for index in range(4)]
    assert client.post("/api/cases/upload", files=four, data={"title": "x"}).status_code == 400
    assert client.post("/api/cases/upload", files=[], data={"title": "x"}).status_code in (400, 422)


def test_upload_small_csv_creates_case_and_strips_path(client: TestClient) -> None:
    response = client.post("/api/cases/upload",
                           files=[("files", ("../../evil/access.csv", CSV_BODY, "text/csv"))],
                           data={"title": "Analyst upload"})
    assert response.status_code == 200, response.text
    case = response.json()
    assert case["title"] == "Analyst upload"
    assert case["scenario"] is False
    assert [source["name"] for source in case["sources"]] == ["access.csv"]
    assert case["event_count"] >= 1


def test_upload_too_large_is_413(client: TestClient) -> None:
    oversized = b"a" * (api.MAX_UPLOAD_BYTES + 1)
    response = client.post("/api/cases/upload", files=[("files", ("big.csv", oversized, "text/csv"))],
                           data={"title": "big"})
    assert response.status_code == 413


def test_overview_shape_with_healthy_llm(client: TestClient, fakes: SimpleNamespace) -> None:
    case = _scenario(client)
    overview = client.get("/api/overview").json()

    assert overview["cases_total"] == 1
    assert overview["active_investigations"] == 1  # the new case is not yet investigated
    assert overview["critical_incidents"] == 0
    assert overview["evidence_total"] == case["event_count"]
    assert overview["evidence_verified"] == overview["evidence_total"]
    assert overview["recent_cases"][0]["id"] == case["id"]
    assert overview["agents_configured"] == 4
    assert overview["agents_available"] == 4
    assert overview["llm"]["ok"] is True
    assert isinstance(overview["ml_dsa_ready"], bool)
    assert isinstance(overview["recent_agent_events"], list)


def test_overview_reports_llm_unavailable_when_module_missing(client: TestClient,
                                                              monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "saksi.llm", None)  # import raises ImportError
    overview = client.get("/api/overview").json()
    assert overview["llm"]["ok"] is False
    assert overview["llm"]["detail"] == "LLM module unavailable"
    assert overview["agents_available"] == 0


def test_run_flow_and_conflict(client: TestClient, fakes: SimpleNamespace) -> None:
    case_id = _scenario(client)["id"]
    started = client.post(f"/api/cases/{case_id}/run")
    assert started.status_code == 200
    assert started.json()["state"] == "running"

    assert client.post(f"/api/cases/{case_id}/run").status_code == 409
    assert client.get(f"/api/cases/{case_id}/run").json()["case_id"] == case_id

    events = client.get(f"/api/cases/{case_id}/agents/events").json()
    assert events[0]["message"] == "Scanning web access logs"


def test_agent_routes_are_503_when_module_missing(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    case_id = _scenario(client)["id"]
    monkeypatch.setitem(sys.modules, "saksi.pipeline", None)
    response = client.get(f"/api/cases/{case_id}/run")
    assert response.status_code == 503
    assert "Traceback" not in response.text


def test_chat_answers_and_maps_llm_failure_to_503(client: TestClient, fakes: SimpleNamespace) -> None:
    case_id = _scenario(client)["id"]
    answered = client.post(f"/api/cases/{case_id}/chat", json={"question": "What happened?"})
    assert answered.status_code == 200
    assert answered.json()["content"] == "Answer to: What happened?"

    assert client.post(f"/api/cases/{case_id}/chat", json={"question": "   "}).status_code == 400

    fakes.chat_error = fakes.LlmError
    failed = client.post(f"/api/cases/{case_id}/chat", json={"question": "again"})
    assert failed.status_code == 503
    assert failed.json() == {"detail": "The AI model did not respond. Try again in a moment."}


def test_report_generate_fetch_pdf_and_verify(client: TestClient, fakes: SimpleNamespace) -> None:
    case_id = _scenario(client)["id"]
    assert client.get(f"/api/cases/{case_id}/report").status_code == 404
    assert client.get(f"/api/cases/{case_id}/report.pdf").status_code == 404

    generated = client.post(f"/api/cases/{case_id}/report", json={"lang": "ms", "classification": "RAHSIA"})
    assert generated.status_code == 200
    report = generated.json()
    assert report["lang"] == "ms" and report["classification"] == "RAHSIA"

    fetched = client.get(f"/api/cases/{case_id}/report", params={"lang": "ms"})
    assert fetched.status_code == 200
    assert client.get(f"/api/cases/{case_id}/report").status_code == 404  # English not generated

    pdf = client.get(f"/api/cases/{case_id}/report.pdf", params={"lang": "ms"})
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["content-disposition"] == f'attachment; filename="SAKSI_{case_id}_ms.pdf"'
    assert pdf.content.startswith(b"%PDF")

    match = client.get("/api/verify/report", params={"case_id": case_id, "hash": report["report_hash"]})
    assert match.json() == {"case_id": case_id, "report_hash": report["report_hash"], "match": True, "lang": "ms"}
    miss = client.get("/api/verify/report", params={"case_id": case_id, "hash": "0" * 64}).json()
    assert miss["match"] is False and miss["lang"] is None


def test_report_generation_failure_is_503(client: TestClient, fakes: SimpleNamespace,
                                          monkeypatch: pytest.MonkeyPatch) -> None:
    case_id = _scenario(client)["id"]

    def failing(*args: Any) -> Any:
        raise fakes.LlmError("upstream timeout with a secret detail")

    monkeypatch.setattr(sys.modules["saksi.agents.reporter"], "generate_report", failing)
    response = client.post(f"/api/cases/{case_id}/report", json={})
    assert response.status_code == 503
    assert "secret" not in response.text


def test_verifier_self_test(client: TestClient, fakes: SimpleNamespace) -> None:
    case_id = _scenario(client)["id"]
    finding = client.post(f"/api/cases/{case_id}/selftest/verifier").json()
    assert finding["id"] == "F-TEST-001"
    assert finding["origin"] == "self_test"


def test_missing_graph_and_story_are_404_with_help(client: TestClient) -> None:
    case_id = _scenario(client)["id"]
    for name in ("graph", "story"):
        response = client.get(f"/api/cases/{case_id}/{name}")
        assert response.status_code == 404
        assert "Run the investigation first" in response.json()["detail"]


def test_unknown_api_path_is_json_404_not_spa(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert "detail" in response.json()


def test_websocket_sends_run_status_then_history(client: TestClient, fakes: SimpleNamespace) -> None:
    case_id = _scenario(client)["id"]
    with client.websocket_connect(f"/ws/cases/{case_id}") as socket:
        first = socket.receive_json()
        assert first["type"] == "run_status"
        assert first["data"]["case_id"] == case_id
        second = socket.receive_json()
        assert second["type"] == "agent_event"
        assert second["data"]["message"] == "Scanning web access logs"
    assert case_id in fakes.unsubscribed


def test_websocket_unknown_case_closes_4404(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/ws/cases/CASE-2026-9999") as socket:
            socket.receive_json()
    assert closed.value.code == 4404


@pytest.mark.skipif(not (api.DIST_DIR / "index.html").exists(), reason="web/dist is not built")
def test_spa_fallback_serves_index_for_app_paths(client: TestClient) -> None:
    response = client.get("/cases/CASE-2026-0001")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
