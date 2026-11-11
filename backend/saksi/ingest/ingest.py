"""Create a case from raw evidence: copy, hash, normalise, merge-sort, persist and write the ledger."""

from __future__ import annotations

import hashlib
import shutil
from collections import Counter
from pathlib import Path

from saksi import custody, store
from saksi.config import now_iso
from saksi.ingest.normalize import detect_kind, normalize_file
from saksi.models import CaseStats, CaseSummary, Event, Severity, SourceFile

_SEVERITIES: tuple[Severity, ...] = ("info", "low", "medium", "high", "critical")


def create_case_from_files(paths: list[Path], title: str, scenario: bool) -> CaseSummary:
    """Create a new case from `paths`. On failure the partially written case directory is removed."""
    case_id = store.new_case_id()
    try:
        return _ingest(case_id, paths, title, scenario)
    except BaseException:
        shutil.rmtree(store.case_dir(case_id), ignore_errors=True)
        raise


def case_stats(events: list[Event]) -> CaseStats:
    """Count events by source and severity (all severities are present, zero when unused) and give the time span."""
    by_source = Counter(event.source for event in events)
    by_severity = {severity: 0 for severity in _SEVERITIES}
    for event in events:
        by_severity[event.severity] += 1
    return CaseStats(
        by_source=dict(by_source),
        by_severity=by_severity,
        time_start=min((event.ts for event in events), default=None),
        time_end=max((event.ts for event in events), default=None),
    )


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ingest(case_id: str, paths: list[Path], title: str, scenario: bool) -> CaseSummary:
    names = [path.name for path in paths]
    if len(set(names)) != len(names):
        raise ValueError("Evidence file names must be unique.")
    created_at = now_iso()
    custody.append(case_id, "CASE_CREATED", "system", f"Case created: {title}",
                   {"title": title, "scenario": scenario, "files": len(paths)})

    evidence_dir = store.case_dir(case_id) / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    sources: list[SourceFile] = []
    events: list[Event] = []
    for original in paths:
        evidence = evidence_dir / original.name
        shutil.copyfile(original, evidence)
        found, skipped = normalize_file(evidence)
        source = SourceFile(
            name=evidence.name,
            kind=detect_kind(evidence),
            sha256=_sha256_file(evidence),
            size_bytes=evidence.stat().st_size,
            event_count=len(found),
        )
        if not found:
            raise ValueError(
                f"No events could be read from {evidence.name} ({skipped} line(s) skipped). Supported: JSON, "
                "JSONL, CSV with a timestamp column, Sysmon XML (one <Event> per line), nginx/Apache access "
                "and error logs.")
        sources.append(source)
        events.extend(found)
        custody.append(case_id, "EVIDENCE_INGESTED", "system",
                       f"Evidence ingested: {source.name} ({source.kind}, {source.event_count} events)",
                       {**source.model_dump(mode="json"), "skipped": skipped})

    events.sort(key=lambda event: event.ts)  # stable: ties keep file order
    for index, event in enumerate(events, start=1):
        event.id = f"EV-{index:05d}"

    summary = CaseSummary(id=case_id, title=title, created_at=created_at, scenario=scenario,
                          sources=sources, event_count=len(events))
    store.save_events(case_id, events)
    store.save_case(summary)
    custody.append(case_id, "EVENTS_NORMALISED", "system", f"{len(events)} events normalised",
                   {
                       "event_count": len(events),
                       "merkle_root": custody.merkle_root([event.sha256 for event in events]),
                       "first_id": events[0].id if events else None,
                       "last_id": events[-1].id if events else None,
                   })
    return summary
