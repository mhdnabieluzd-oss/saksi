"""Thread-safe per-case event bus: persisted AgentEvents, live agent and run status, WebSocket fan-out.

Worker threads publish with `call_soon_threadsafe`, so asyncio queues are only touched on their own loop.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any

from saksi import store
from saksi.config import now_iso
from saksi.models import AgentEvent, AgentName, AgentStatus, RunStatus

AGENT_NAMES: tuple[AgentName, ...] = ("triage", "investigator", "verifier", "reporter")

_LOCK = threading.RLock()
_SEQ: dict[str, int] = {}                 # per case directory: last agent event seq handed out
_RUNS: dict[str, RunStatus] = {}          # per case directory: latest run status
_SUBS: dict[str, list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = {}


def _key(case_id: str) -> str:
    return str(store.case_dir(case_id))


def history(case_id: str, after: int = 0) -> list[AgentEvent]:
    """Return stored agent events with seq greater than `after`, in order."""
    path = store.case_dir(case_id) / "agent_events.jsonl"
    with _LOCK:
        if not path.exists():
            return []
        lines = [line for line in path.read_text(encoding="utf-8").split("\n") if line]
    return [event for event in (AgentEvent.model_validate_json(line) for line in lines) if event.seq > after]


def publish(case_id: str, message: dict[str, Any]) -> None:
    """Deliver a message to every subscriber of the case. Safe to call from any thread."""
    with _LOCK:
        subscribers = list(_SUBS.get(_key(case_id), []))
    for loop, queue in subscribers:
        try:
            loop.call_soon_threadsafe(queue.put_nowait, message)
        except RuntimeError:  # the subscriber's loop has closed
            pass


def subscribe(case_id: str) -> asyncio.Queue:
    """Register a queue for the case on the running event loop and return it."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    with _LOCK:
        _SUBS.setdefault(_key(case_id), []).append((loop, queue))
    return queue


def unsubscribe(case_id: str, queue: asyncio.Queue) -> None:
    with _LOCK:
        subscribers = _SUBS.get(_key(case_id), [])
        subscribers[:] = [(loop, q) for loop, q in subscribers if q is not queue]


def emit(case_id: str, agent: AgentName, kind: str, message: str, tool: str | None = None,
         args: dict[str, Any] | None = None, evidence_ids: list[str] | None = None,
         ledger_seq: int | None = None, code: str | None = None, ref: str | None = None) -> AgentEvent:
    """Persist one AgentEvent with the next per-case seq and publish it as agent_event."""
    with _LOCK:
        key = _key(case_id)
        if key not in _SEQ:
            _SEQ[key] = max((event.seq for event in history(case_id)), default=0)
        _SEQ[key] += 1
        event = AgentEvent(seq=_SEQ[key], ts=now_iso(), case_id=case_id, agent=agent, kind=kind,
                           message=message, tool=tool, args=args, evidence_ids=list(evidence_ids or []),
                           ledger_seq=ledger_seq, code=code, ref=ref)
        with (store.case_dir(case_id) / "agent_events.jsonl").open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(event.model_dump_json() + "\n")
    publish(case_id, {"type": "agent_event", "data": event.model_dump(mode="json")})
    return event


def _default_run(case_id: str) -> RunStatus:
    return RunStatus(case_id=case_id, agents=[AgentStatus(name=name) for name in AGENT_NAMES])


def load_run(case_id: str) -> RunStatus:
    """Return the run status from memory, else run.json, else an idle default."""
    with _LOCK:
        cached = _RUNS.get(_key(case_id))
        if cached is not None:
            return cached.model_copy(deep=True)
        stored = store.load_json(case_id, "run.json")
    return RunStatus.model_validate(stored) if stored is not None else _default_run(case_id)


def _remember(case_id: str, run: RunStatus) -> None:
    with _LOCK:
        store.save_json(case_id, "run.json", run)
        _RUNS[_key(case_id)] = run.model_copy(deep=True)


def set_run(case_id: str, run: RunStatus) -> None:
    """Persist the run status and publish it as run_status."""
    _remember(case_id, run)
    publish(case_id, {"type": "run_status", "data": run.model_dump(mode="json")})


def set_agent(case_id: str, status: AgentStatus) -> None:
    """Persist one agent's status inside the run and publish it as agent_status."""
    with _LOCK:
        run = load_run(case_id)
        run.agents = [status if agent.name == status.name else agent for agent in run.agents]
        _remember(case_id, run)
    publish(case_id, {"type": "agent_status", "data": status.model_dump(mode="json")})
