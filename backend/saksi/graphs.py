"""Deterministic attack graph and story built from verified or unverified findings."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from saksi.detect import ip_host_map
from saksi.models import Event, Finding, Graph, GraphEdge, GraphNode, Severity, Story, StoryStep

MAX_NODES = 60
EXFIL_BYTES = 50_000_000
SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]
PATH_RE = re.compile(r'[A-Za-z]:\\[^\s"\']+')
SHARE_RE = re.compile(r"\\\\[^\\\s]*\\([A-Za-z0-9$]+)")
NO_TIME = datetime.max.replace(tzinfo=timezone.utc)
HOST_TOKEN_RE = re.compile(r"[A-Z0-9][A-Z0-9-]*")


def finding_severity(finding: Finding) -> Severity:
    tactic = finding.tactic
    if tactic in ("Exfiltration", "Credential Access", "Impact"):
        return "critical"
    if tactic in ("Lateral Movement", "Execution", "Persistence", "Privilege Escalation",
                  "Defense Evasion", "Collection", "Initial Access"):
        return "high"
    return "medium"


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _event_key(e: Event) -> tuple:
    return (_parse(e.ts), e.id)


def _endpoint(ip: str, ip_host: dict[str, str]) -> str:
    host = ip_host.get(ip)
    return f"host:{host}" if host else f"ip:{ip}"


def _proc(name: str, host: Optional[str]) -> str:
    return f"process:{name.lower()}@{(host or 'UNKNOWN').upper()}"


def _edge_candidates(e: Event, ip_host: dict[str, str], known_hosts: set[str]) -> list[tuple[str, str, str]]:
    """(source, target, label) edges one event contributes."""
    host = e.host.upper() if e.host else None
    user_node = f"user:{e.user}" if e.user else None
    out: list[tuple[str, str, str]] = []

    if e.event_type == "http_request" and e.src_ip and e.dst_ip:
        method = "GET"
        try:
            method = str(json.loads(e.raw).get("method", method)).upper()
        except (ValueError, TypeError, AttributeError):
            if e.message:
                method = e.message.split()[0].upper()
        target = f"host:{host}" if host else _endpoint(e.dst_ip, ip_host)
        status = f" {e.status_code}" if e.status_code is not None else ""
        out.append((f"ip:{e.src_ip}", target, f"HTTP {method}{status}"))

    elif e.event_type == "process_create" and e.parent_process and e.process:
        out.append((_proc(e.parent_process, host), _proc(e.process, host), "spawned"))

    elif e.event_type == "process_access" and e.process and host and "lsass.exe" in e.message.lower():
        out.append((_proc(e.process, host), _proc("lsass.exe", host), "read memory"))

    elif e.event_type in ("logon", "explicit_logon") and host:
        target = f"host:{host}"
        source = None
        if e.event_type == "logon" and e.src_ip:
            source = _endpoint(e.src_ip, ip_host)
        elif e.event_type == "explicit_logon":
            source = target
            target_name = next((t for t in HOST_TOKEN_RE.findall(e.message.upper())
                                if t in known_hosts and t != host), None)
            target = f"host:{target_name}" if target_name else None
        if source and target:
            out.append((source, target, f"logon as {e.user or 'unknown'}"))
        if user_node and target:
            out.append((user_node, target, "authenticated"))

    elif e.event_type == "share_access" and user_node and host:
        match = SHARE_RE.search(e.message)
        out.append((user_node, f"host:{host}", f"accessed {match.group(1) if match else 'share'}"))

    elif e.event_type == "service_install" and host and e.process:
        out.append((f"host:{host}", _proc(e.process, host), "service installed"))

    elif e.event_type in ("network_flow", "network_connect") and e.dst_ip:
        source = _endpoint(e.src_ip, ip_host) if e.src_ip else (f"host:{host}" if host else None)
        if source:
            if e.bytes_out is not None and e.bytes_out >= EXFIL_BYTES:
                label = f"exfiltration {round(e.bytes_out / 1_000_000)} MB"
            else:
                label = "connection"
            out.append((source, f"ip:{e.dst_ip}", label))

    elif e.event_type == "file_create" and e.process:
        path_match = PATH_RE.search(e.message)
        path = path_match.group(0) if path_match else e.message.strip()
        if path:
            out.append((_proc(e.process, host), f"file:{path}", "created"))

    return out


def build_graph(events: list[Event], findings: list[Finding]) -> Graph:
    active = [f for f in findings if f.status != "rejected"]
    verified_eids = {eid for f in active if f.status == "verified" for eid in f.evidence_ids}
    cited = {eid for f in active for eid in f.evidence_ids}
    cited_events = sorted((e for e in events if e.id in cited), key=_event_key)
    by_id = {e.id: e for e in events}
    ip_host = ip_host_map(events)
    known_hosts = {e.host.upper() for e in events if e.host}

    merged: dict[tuple[str, str, str], dict] = {}
    for e in cited_events:
        for key in _edge_candidates(e, ip_host, known_hosts):
            slot = merged.setdefault(key, {"event_ids": [], "ts": e.ts})
            slot["event_ids"].append(e.id)

    # Node bookkeeping
    node_events: dict[str, set[str]] = defaultdict(set)
    degree: dict[str, int] = defaultdict(int)
    for (src, tgt, _label), slot in merged.items():
        for node in (src, tgt):
            node_events[node].update(slot["event_ids"])
            degree[node] += 1

    def risk_of(events_for_node: set[str]) -> str:
        sev = [finding_severity(f) for f in active if set(f.evidence_ids) & events_for_node]
        return max(sev, key=SEVERITY_ORDER.index) if sev else "none"

    risk_rank = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    nodes = {nid: risk_of(evs) for nid, evs in node_events.items()}
    total_nodes = len(nodes)
    keep = sorted(nodes, key=lambda n: (-risk_rank[nodes[n]], -degree[n], n))[:MAX_NODES]
    kept = set(keep)

    def _edge_provenance(label: str, eids: list[str]) -> str:
        if not any(eid in verified_eids for eid in eids):
            return "inferred"
        if label.startswith("logon as"):
            return "inferred"
        if label in ("authenticated", "connection"):
            return "contextual"
        return "observed"

    edge_rows = [(slot["ts"], src, tgt, label, slot["event_ids"])
                 for (src, tgt, label), slot in merged.items() if src in kept and tgt in kept]
    edge_rows.sort(key=lambda r: (_parse(r[0]), r[1], r[2], r[3]))
    edges = []
    for i, (ts, src, tgt, label, eids) in enumerate(edge_rows, start=1):
        sorted_eids = sorted(set(eids), key=lambda x: _event_key(by_id[x]))
        last_ts = by_id[sorted_eids[-1]].ts if sorted_eids else ts
        edges.append(GraphEdge(
            id=f"E-{i:03d}", source=src, target=tgt, label=label, ts=ts,
            last_ts=last_ts,
            event_ids=sorted_eids,
            evidence_ids=sorted_eids,
            provenance=_edge_provenance(label, eids),  # type: ignore[arg-type]
            directed=True,
            relation=label.split()[0].lower() if label else "linked",
        ))

    graph_nodes = []
    for nid in sorted(kept, key=lambda n: (-risk_rank[nodes[n]], n)):
        evs = sorted(node_events[nid], key=lambda x: _event_key(by_id[x]))
        times = [by_id[x].ts for x in evs]
        kind_part, label_part = nid.split(":", 1)
        attrs: dict[str, str] = {}
        if kind_part == "process" and "@" in label_part:
            proc_name, proc_host = label_part.split("@", 1)
            attrs = {"process": proc_name, "host": proc_host}
        elif kind_part == "host" and label_part in ip_host.values():
            matched_ips = [ip for ip, h in ip_host.items() if h == label_part]
            if matched_ips:
                attrs["ip"] = matched_ips[0]
        first_seen_ts = min(times, key=_parse) if times else None
        last_seen_ts = max(times, key=_parse) if times else None
        graph_nodes.append(GraphNode(
            id=nid, kind=kind_part, label=label_part, risk=nodes[nid],  # type: ignore[arg-type]
            first_seen=first_seen_ts,
            last_seen=last_seen_ts,
            first_ts=first_seen_ts,
            last_ts=last_seen_ts,
            degree=degree[nid],
            event_ids=evs,
            finding_ids=[f.id for f in active if set(f.evidence_ids) & node_events[nid]],
            attributes=attrs,
        ))
    return Graph(
        nodes=graph_nodes,
        edges=edges,
        total_nodes=total_nodes,
        truncated=total_nodes > len(graph_nodes),
    )


def build_story(case_id: str, findings: list[Finding], graph: Graph, events: list[Event]) -> Story:
    by_id = {e.id: e for e in events}
    active = [f for f in findings if f.status != "rejected"]

    def earliest(f: Finding) -> Optional[str]:
        stamps = [by_id[i].ts for i in f.evidence_ids if i in by_id]
        return min(stamps, key=_parse) if stamps else f.first_seen

    ordered = sorted(active, key=lambda f: (_parse(earliest(f)) if earliest(f) else NO_TIME, f.id))
    steps: list[StoryStep] = []
    for order, f in enumerate(ordered, start=1):
        event_ids = list(dict.fromkeys(f.evidence_ids))
        ev_set = set(event_ids)
        node_ids = [n.id for n in graph.nodes if set(n.event_ids) & ev_set]
        edge_ids = []
        for edge in graph.edges:
            if set(edge.event_ids) & ev_set:
                edge_ids.append(edge.id)
                if edge.step is None:
                    edge.step = order
        steps.append(StoryStep(
            order=order, ts=earliest(f) or "", title=f.title, description=f.summary,
            tactic=f.tactic, technique_id=f.technique_id, finding_id=f.id,
            event_ids=event_ids, node_ids=node_ids, edge_ids=edge_ids,
        ))

    severities = [finding_severity(f) for f in active]
    severity = max(severities, key=SEVERITY_ORDER.index) if severities else "info"
    if steps:
        times = [_parse(s.ts) for s in steps if s.ts]
        chain = " -> ".join(dict.fromkeys(s.tactic for s in steps))
        plural = "" if len(steps) == 1 else "s"
        summary = (f"{len(steps)} attack step{plural} between {min(times):%H:%M} and "
                   f"{max(times):%H:%M} UTC: {chain}") if times else \
                  f"{len(steps)} attack step{plural}: {chain}"
    else:
        summary = "No attack steps: no findings for this case."
    return Story(case_id=case_id, summary=summary, severity=severity, steps=steps)
