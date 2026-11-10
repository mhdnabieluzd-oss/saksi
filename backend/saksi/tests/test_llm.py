"""LLM client: forced JSON retry, the tool loop's error handling and the health probe, with the HTTP seam faked."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from saksi import llm


def _response(content: str | None = None, calls: list[tuple[str, str]] | None = None) -> Any:
    tool_calls = [SimpleNamespace(id=f"call-{i}", function=SimpleNamespace(name=name, arguments=args))
                  for i, (name, args) in enumerate(calls or [])] or None
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)],
                           usage=SimpleNamespace(prompt_tokens=11, completion_tokens=4))


def test_complete_json_retries_once_on_bad_arguments(monkeypatch) -> None:
    replies = iter([_response(calls=[("submit", "{not json")]), _response(calls=[("submit", '{"ok": true}')])])
    monkeypatch.setattr(llm, "_chat", lambda **kwargs: next(replies))
    args, usage = llm.complete_json("sys", "user", "submit", {"type": "object"}, model="m")
    assert args == {"ok": True}
    assert usage.prompt_tokens == 22


def test_complete_json_raises_after_two_failures(monkeypatch) -> None:
    monkeypatch.setattr(llm, "_chat", lambda **kwargs: _response(content="just text"))
    with pytest.raises(llm.LlmError):
        llm.complete_json("sys", "user", "submit", {"type": "object"}, model="m")


def test_run_tools_reports_unknown_tool_to_model_and_stops_on_final(monkeypatch) -> None:
    sent: list[list[dict]] = []
    replies = iter([
        _response(calls=[("no_such_tool", "{}"), ("echo", '{"word": "hi"}')]),
        _response(calls=[("submit_findings", '{"findings": []}')]),
    ])

    def fake_chat(**kwargs):
        sent.append(kwargs["messages"])
        return next(replies)

    monkeypatch.setattr(llm, "_chat", fake_chat)
    steps: list[dict] = []
    result = llm.run_tools("sys", [{"role": "user", "content": "go"}], [],
                           {"echo": lambda args: ({"said": args["word"]}, "1 word")},
                           max_rounds=5, on_step=steps.append)

    assert result.final_args == {"findings": []}
    assert result.rounds == 2
    tool_messages = [m for m in sent[1] if m.get("role") == "tool"]
    assert "unknown tool" in tool_messages[0]["content"]
    assert json.loads(tool_messages[1]["content"]) == {"said": "hi"}
    kinds = [s["kind"] for s in steps]
    assert kinds.count("llm_call") == 2
    assert "tool_call" in kinds and "tool_result" in kinds


def test_run_tools_truncates_large_results(monkeypatch) -> None:
    replies = iter([_response(calls=[("big", "{}")]), _response(calls=[("submit_findings", '{"findings": []}')])])
    sent: list[list[dict]] = []

    def fake_chat(**kwargs):
        sent.append(kwargs["messages"])
        return next(replies)

    monkeypatch.setattr(llm, "_chat", fake_chat)
    llm.run_tools("sys", [{"role": "user", "content": "go"}], [], {"big": lambda args: ("x" * 20000, "big")},
                  max_rounds=4)
    tool_text = next(m["content"] for m in sent[1] if m.get("role") == "tool")
    assert len(tool_text) <= llm.TOOL_RESULT_MAX + len("...[truncated]")


def test_health_without_key_is_not_ok_and_never_calls_model(monkeypatch) -> None:
    monkeypatch.delenv("SAKSI_OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setattr(llm, "_chat", lambda **kwargs: pytest.fail("model must not be called"))
    monkeypatch.setattr(llm, "_health", None)
    health = llm.health()
    assert health.ok is False
    assert "API key" in health.detail
