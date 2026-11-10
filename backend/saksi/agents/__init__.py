"""Shared helpers for the four SAKSI agents: status updates, ledgered steps and prompt data wrapping.

Agents: triage (shield, rules, scope), investigator (LLM tool loop), verifier (checks, graph, story),
reporter (report and seal). `pipeline` runs them in order.
"""

from __future__ import annotations

import json
from typing import Any

from saksi import bus, custody
from saksi.config import now_iso
from saksi.llm import Usage, redact_secrets
from saksi.models import AgentEvent, AgentStatus

AGENT_NAMES = bus.AGENT_NAMES
FINISHED_STATES = ("completed", "failed", "requires_review")
ERROR_MAX = 160


def log_data(value: Any) -> str:
    """Wrap untrusted log-derived data in <log_data> tags. '<' and '>' are escaped so content cannot close the tag."""
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    text = text.replace("<", "\\u003c").replace(">", "\\u003e")
    return f"<log_data>\n{text}\n</log_data>"


def error_text(exc: BaseException) -> str:
    """A one-line error for the UI and the run status: no stack trace, no secrets."""
    return redact_secrets(f"{type(exc).__name__}: {exc}")[:ERROR_MAX]


def update(case_id: str, agent: str, *, state: str | None = None, task: str | None = None,
           progress: int | None = None, summary: str | None = None) -> AgentStatus:
    """Change one agent's status and publish it. Timestamps follow the state changes."""
    current = next(item for item in bus.load_run(case_id).agents if item.name == agent)
    changes: dict[str, Any] = {}
    if state is not None:
        changes["state"] = state
        if state == "running":
            changes.update(started_at=now_iso(), finished_at=None, progress=0)
        if state in FINISHED_STATES:
            changes["finished_at"] = now_iso()
    if task is not None:
        changes["current_task"] = task
    if progress is not None:
        changes["progress"] = progress
    if summary is not None:
        changes["output_summary"] = summary
    status = current.model_copy(update=changes)
    bus.set_agent(case_id, status)
    return status


def event(case_id: str, agent: str, kind: str, message: str, *, evidence_ids: list[str] | None = None,
          ledger_seq: int | None = None, tool: str | None = None, args: dict[str, Any] | None = None,
          code: str | None = None, ref: str | None = None) -> AgentEvent:
    return bus.emit(case_id, agent, kind, message, tool=tool, args=args,
                    evidence_ids=evidence_ids, ledger_seq=ledger_seq, code=code, ref=ref)


def step(case_id: str, agent: str, message: str, *, action: str, usage: Usage | None = None,
         tool: str | None = None, args: dict[str, Any] | None = None, input_obj: Any = None,
         output_obj: Any = None, kind: str = "action", evidence_ids: list[str] | None = None) -> AgentEvent:
    """Append an AGENT_STEP ledger entry for one model call or tool call, then publish the matching event.

    The ledger stores hashes of the input and output, never the text itself.
    """
    data = {
        "action": action,
        "tool": tool,
        "model": usage.model if usage else None,
        "input_sha256": custody.canonical_hash(input_obj) if input_obj is not None else None,
        "output_sha256": custody.canonical_hash(output_obj) if output_obj is not None else None,
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
    }
    entry = custody.append(case_id, "AGENT_STEP", agent, message, data)
    return event(case_id, agent, kind, message, evidence_ids=evidence_ids, ledger_seq=entry.seq,
                 tool=tool, args=args)


def dump_list(items: list[Any]) -> list[dict[str, Any]]:
    """Dump pydantic models to JSON-mode dicts so store.save_json can write the list."""
    return [item.model_dump(mode="json") for item in items]
