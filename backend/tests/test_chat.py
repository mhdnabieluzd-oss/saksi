"""Chat: citation validation, language detection and persistence, with the model faked."""

from __future__ import annotations

import pytest

from saksi import chat, custody, llm, store
from saksi.ingest.ingest import create_case_from_files
from saksi.ingest.scenario import ensure_scenario


@pytest.fixture
def case():
    return create_case_from_files(ensure_scenario(), "chat case", True)


def test_made_up_citation_is_dropped_and_replaced_in_text(case, monkeypatch) -> None:
    real = store.load_events(case.id)[0].id

    def fake(system, user, schema_name, schema, model=None, max_tokens=3000):
        assert schema_name == "answer_question"
        return {
            "answer": f"The first event is [{real}]. A made-up record [EV-99999] says otherwise.",
            "citations": [{"event_id": "EV-99999"}, {"event_id": real}],
            "verified_points": [], "hypotheses": [], "uncertainty": "",
        }, llm.Usage(model="fake/model")

    monkeypatch.setattr(llm, "complete_json", fake)
    message = chat.answer(case.id, "What happened first?")

    assert message.unknown_citations == ["EV-99999"]
    assert [c.event_id for c in message.citations] == [real]
    assert "EV-99999" not in message.content
    assert "[citation removed]" in message.content
    assert f"[{real}]" in message.content
    assert message.lang == "en"
    assert message.ledger_seq is not None
    assert [m.role for m in chat.history(case.id)] == ["user", "assistant"]
    chain = custody.verify(case.id)
    assert chain.ok, chain.reason


def test_malay_question_is_detected_and_answered_in_malay(case, monkeypatch) -> None:
    seen: dict[str, str] = {}

    def fake(system, user, schema_name, schema, model=None, max_tokens=3000):
        seen["system"] = system
        return {"answer": "Tiada bukti.", "citations": []}, llm.Usage(model="fake/model")

    monkeypatch.setattr(llm, "complete_json", fake)
    message = chat.answer(case.id, "Bila penyerang mula masuk?")
    assert message.lang == "ms"
    assert "Bahasa Melayu" in seen["system"]


def test_language_heuristic() -> None:
    assert chat.detect_malay("Bila penyerang mula masuk?")
    assert chat.detect_malay("Ringkaskan serangan ini")
    assert not chat.detect_malay("Which account was compromised and how?")
    assert not chat.detect_malay("What data left the network?")


def test_llm_error_propagates_and_saves_nothing(case, monkeypatch) -> None:
    def fake(*args, **kwargs):
        raise llm.LlmError("down")

    monkeypatch.setattr(llm, "complete_json", fake)
    with pytest.raises(llm.LlmError):
        chat.answer(case.id, "Anything?")
    assert chat.history(case.id) == []
