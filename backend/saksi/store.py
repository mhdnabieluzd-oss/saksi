"""Case persistence under data/cases/<case_id>/ with per-case locks and atomic writes."""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from saksi.config import data_dir, write_atomic
from saksi.models import CaseSummary, Event

_CASE_ID = re.compile(r"CASE-(\d{4})-(\d{4})")
_ALLOC_LOCK = threading.Lock()
_LOCKS_GUARD = threading.Lock()
_CASE_LOCKS: dict[str, threading.RLock] = {}


def _cases_root() -> Path:
    return data_dir() / "cases"


def case_dir(case_id: str) -> Path:
    """Return data/cases/<case_id>. Raises KeyError for ids that are not CASE-YYYY-NNNN."""
    if not _CASE_ID.fullmatch(case_id):
        raise KeyError(case_id)
    return _cases_root() / case_id


def case_lock(case_id: str) -> threading.RLock:
    """Return the re-entrant lock that guards every write to one case (re-entrant so custody can nest calls)."""
    with _LOCKS_GUARD:
        return _CASE_LOCKS.setdefault(case_id, threading.RLock())


def new_case_id() -> str:
    """Allocate the next CASE-<year>-NNNN id and reserve its directory so concurrent callers never collide."""
    year = datetime.now(timezone.utc).year
    pattern = re.compile(rf"CASE-{year}-(\d{{4}})")
    with _ALLOC_LOCK:
        root = _cases_root()
        root.mkdir(parents=True, exist_ok=True)
        taken = [int(match[1]) for entry in root.iterdir() if (match := pattern.fullmatch(entry.name))]
        case_id = f"CASE-{year}-{max(taken, default=0) + 1:04d}"
        case_dir(case_id).mkdir()
    return case_id


def _safe_name(name: str) -> str:
    if Path(name).name != name or name in {"", ".", ".."}:
        raise ValueError(f"Invalid case file name: {name!r}")
    return name


def save_case(summary: CaseSummary) -> None:
    """Atomically write case.json for the case."""
    with case_lock(summary.id):
        write_atomic(case_dir(summary.id) / "case.json", summary.model_dump_json(indent=2).encode("utf-8"))


def load_case(case_id: str) -> CaseSummary:
    """Return the case summary. Raises KeyError when the case does not exist."""
    path = case_dir(case_id) / "case.json"
    if not path.exists():
        raise KeyError(case_id)
    return CaseSummary.model_validate_json(path.read_text(encoding="utf-8"))


def list_cases() -> list[CaseSummary]:
    """Return every case, newest first."""
    root = _cases_root()
    if not root.is_dir():
        return []
    cases = [load_case(entry.name) for entry in root.iterdir()
             if _CASE_ID.fullmatch(entry.name) and (entry / "case.json").exists()]
    return sorted(cases, key=lambda case: (case.created_at, case.id), reverse=True)


def save_events(case_id: str, events: list[Event]) -> None:
    """Atomically write events.jsonl, one Event per line."""
    text = "".join(event.model_dump_json() + "\n" for event in events)
    with case_lock(case_id):
        write_atomic(case_dir(case_id) / "events.jsonl", text.encode("utf-8"))


def load_events(case_id: str) -> list[Event]:
    """Return the case's events in stored order. Raises KeyError for unknown cases; [] when none were saved."""
    directory = case_dir(case_id)
    if not directory.is_dir():
        raise KeyError(case_id)
    path = directory / "events.jsonl"
    with case_lock(case_id):
        if not path.exists():
            return []
        # Split on "\n" only: JSON may contain U+2028, which str.splitlines would break on.
        return [Event.model_validate_json(line) for line in path.read_text(encoding="utf-8").split("\n") if line]


def save_json(case_id: str, name: str, obj: BaseModel | Any) -> None:
    """Atomically write a JSON document (pydantic models are dumped in JSON mode) into the case directory."""
    payload = obj.model_dump(mode="json") if isinstance(obj, BaseModel) else obj
    text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    with case_lock(case_id):
        write_atomic(case_dir(case_id) / _safe_name(name), text.encode("utf-8"))


def load_json(case_id: str, name: str, default: Any = None) -> Any:
    """Return a JSON document from the case directory, or `default` when the file does not exist."""
    path = case_dir(case_id) / _safe_name(name)
    with case_lock(case_id):
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
