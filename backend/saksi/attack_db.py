"""MITRE ATT&CK Enterprise technique lookup, backed by the bundled saksi/data/attack_enterprise.json.

Build the JSON with scripts/build_attack_db.py.
"""

from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Any

_DATA_FILE = Path(__file__).resolve().parent / "data" / "attack_enterprise.json"


@functools.cache
def _techniques() -> dict[str, dict[str, Any]]:
    return json.loads(_DATA_FILE.read_text(encoding="utf-8"))


def get(tid: str) -> dict[str, Any] | None:
    """Return {"id", "name", "tactics"} for a technique id such as "T1190", or None when unknown."""
    entry = _techniques().get(tid)
    return {"id": tid, **entry} if entry else None


def exists(tid: str) -> bool:
    """Return True when the technique id is in the Enterprise matrix (non-revoked, non-deprecated)."""
    return tid in _techniques()


def tactics_for(tid: str) -> list[str]:
    """Return the ATT&CK tactic display names for a technique, or [] when unknown."""
    entry = _techniques().get(tid)
    return list(entry["tactics"]) if entry else []


def name(tid: str) -> str | None:
    """Return the technique name, or None when unknown."""
    entry = _techniques().get(tid)
    return entry["name"] if entry else None


def tactics() -> list[str]:
    """Return every tactic display name used by the Enterprise matrix, sorted."""
    return sorted({tactic for entry in _techniques().values() for tactic in entry["tactics"]})
