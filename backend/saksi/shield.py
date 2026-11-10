"""Indirect prompt-injection screening for log records.

`scan` quarantines events whose text tries to manipulate an LLM reading them.
`redact_for_llm` builds the compact, quarantine-aware dict that prompts receive.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Iterator

from saksi.models import Event, ShieldAlert

EXCERPT_MAX = 300
PROMPT_TEXT_MAX = 300
RAW_MAX = 600
QUARANTINE_TEXT = "[QUARANTINED: suspected prompt injection, see {alert}]"

PATTERNS = [re.compile(p, re.IGNORECASE) for p in (
    r"ignore (all )?(the )?(previous|prior|above) instructions",
    r"disregard (all )?(the )?(previous|prior|above)",
    r"you are (now )?(a|an) ",
    r"system prompt",
    r"do not (mention|report|flag|include)",
    r"report (this|it|the activity) as (benign|authori[sz]ed|normal|legitimate)",
    r"mark (this|it) as (benign|safe|clean)",
    r"</?(system|assistant|instructions?)>",
    r"begin (new )?instructions",
)]


def _json_strings(value: Any) -> Iterator[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _json_strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from _json_strings(v)


def _candidates(e: Event) -> list[str]:
    """Free-text fields first, then every string value inside raw (or the raw text itself)."""
    texts = [t for t in (e.message, e.url, e.command_line) if t]
    try:
        texts.extend(_json_strings(json.loads(e.raw)))
    except (ValueError, TypeError):
        texts.append(e.raw)
    return texts


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def scan(events: list[Event]) -> list[ShieldAlert]:
    """One alert per injected event (first matching pattern). Flags events in place."""
    alerts: list[ShieldAlert] = []
    for e in events:
        hit = next(((text, pat) for text in _candidates(e) for pat in PATTERNS if pat.search(text)), None)
        if hit is None:
            continue
        text, pat = hit
        alert_id = f"AIS-{len(alerts) + 1:03d}"
        alerts.append(ShieldAlert(
            id=alert_id, event_id=e.id, pattern=pat.pattern, excerpt=text[:EXCERPT_MAX],
            detected_at=_now(),
        ))
        for flag in ("prompt_injection", "quarantined", f"shield:{alert_id}"):
            if flag not in e.flags:
                e.flags.append(flag)
    return alerts


def _cap(value: str | None, limit: int) -> str | None:
    return value[:limit] if value is not None else None


def redact_for_llm(event: Event) -> dict:
    quarantined = "quarantined" in event.flags
    alert = next((f.split(":", 1)[1] for f in event.flags if f.startswith("shield:")), "unknown")
    marker = QUARANTINE_TEXT.format(alert=alert)
    return {
        "id": event.id,
        "ts": event.ts,
        "source": event.source,
        "event_type": event.event_type,
        "severity": event.severity,
        "host": event.host,
        "user": event.user,
        "src_ip": event.src_ip,
        "dst_ip": event.dst_ip,
        "process": event.process,
        "parent_process": event.parent_process,
        "command_line": marker if quarantined else _cap(event.command_line, PROMPT_TEXT_MAX),
        "url": marker if quarantined else _cap(event.url, PROMPT_TEXT_MAX),
        "status_code": event.status_code,
        "bytes_out": event.bytes_out,
        "message": marker if quarantined else _cap(event.message, PROMPT_TEXT_MAX),
        "raw": marker if quarantined else _cap(event.raw, RAW_MAX),
    }
