"""Deterministic detection rules over normalised events.

`run_rules` returns one Signal per rule hit group. Matched events are flagged
"suspicious" and receive the signal id in `signal_ids`, both updated in place.
"""
from __future__ import annotations

import ipaddress
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Callable, Iterable, Optional
from urllib.parse import parse_qs, parse_qsl

from saksi.models import Event, Signal

MAX_EVENT_IDS = 60
EXFIL_BYTES = 50_000_000
RFC1918 = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]

WEB_SERVER_PARENTS = {"w3wp.exe", "httpd.exe", "nginx.exe", "php-cgi.exe", "tomcat.exe", "java.exe"}
SHELL_CHILDREN = {"cmd.exe", "powershell.exe", "pwsh.exe", "whoami.exe", "net.exe", "net1.exe",
                  "ipconfig.exe", "systeminfo.exe", "rundll32.exe"}
SHELL_EXTS = (".aspx", ".php", ".jsp", ".jspx")
BENIGN_LSASS_SOURCES = {"msmpeng.exe", "mssense.exe", "csrss.exe", "wininit.exe", "services.exe",
                        "lsm.exe", "lsaiso.exe", "wmiprvse.exe", "svchost.exe"}
SQLI_MARKERS = ("' or 1=1", "%27", "union select", "sleep(", "xp_cmdshell")
SQLI_COMMENT = re.compile(r"'.*--")
B64_ARG = re.compile(r"(?:^|\s)-e\s+[A-Za-z0-9+/]{8,}={0,2}(?:\s|$)", re.IGNORECASE)
ARCHIVERS = {"7z.exe", "7za.exe", "rar.exe", "winrar.exe", "makecab.exe"}
SHARE_NAMES = ("admin$", "c$", "ipc$")
BRUTE_THRESHOLD = 10
SCAN_THRESHOLD = 20


def _ts(e: Event) -> datetime:
    return datetime.fromisoformat(e.ts.replace("Z", "+00:00"))


def _raw_json(e: Event) -> dict:
    try:
        data = json.loads(e.raw)
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _is_external(ip: Optional[str]) -> bool:
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not any(addr in net for net in RFC1918)


def ip_host_map(events: list[Event]) -> dict[str, str]:
    """ip -> HOST learned from http_request (dst_ip -> host) and sysmon events (src_ip -> host)."""
    mapping: dict[str, str] = {}
    for e in sorted(events, key=_ts):
        if e.event_type == "http_request" and e.dst_ip and e.host:
            mapping.setdefault(e.dst_ip, e.host.upper())
        elif e.source == "sysmon" and e.host and e.src_ip:
            mapping.setdefault(e.src_ip, e.host.upper())
    return mapping


def _burst(events: list[Event], minutes: int, threshold: int) -> Optional[list[Event]]:
    """All events in the earliest `minutes` window that holds >= threshold events, or None."""
    ordered = sorted(events, key=_ts)
    span = timedelta(minutes=minutes)
    start = 0
    for end in range(len(ordered)):
        while _ts(ordered[end]) - _ts(ordered[start]) > span:
            start += 1
        if end - start + 1 >= threshold:
            limit = _ts(ordered[start]) + span
            return [e for e in ordered[start:] if _ts(e) <= limit]
    return None


def _group(events: Iterable[Event], key: Callable[[Event], Optional[str]]) -> dict[str, list[Event]]:
    groups: dict[str, list[Event]] = defaultdict(list)
    for e in events:
        k = key(e)
        if k is not None:
            groups[k].append(e)
    return groups


# ---------------------------------------------------------------- rules
# Each rule returns a list of hit groups: (title, severity_override or None, matched events).

def _rule_web_scan(events: list[Event], _ctx) -> list[tuple]:
    hits = []
    external = [e for e in events if e.event_type == "http_request" and e.status_code == 404
                and _is_external(e.src_ip)]
    for src, group in sorted(_group(external, lambda e: e.src_ip).items()):
        window = _burst(group, 10, SCAN_THRESHOLD)
        if window:
            hits.append((f"Web scanning from {src} ({len(window)} x 404 within 10 min)", None, window))
    return hits


def _rule_web_sqli(events: list[Event], _ctx) -> list[tuple]:
    matched = []
    for e in events:
        if e.event_type != "http_request" or not e.url:
            continue
        url = e.url.lower()
        if any(m in url for m in SQLI_MARKERS) or SQLI_COMMENT.search(url):
            matched.append(e)
    hits = []
    for src, group in sorted(_group(matched, lambda e: e.src_ip or "unknown").items()):
        hits.append((f"SQL injection attempts from {src} ({len(group)} requests)", None, group))
    return hits


def _url_path(e: Event) -> str:
    return (e.url or "").split("?", 1)[0]


def _basename(path: str) -> str:
    return path.rsplit("/", 1)[-1].lower()


def _query(e: Event) -> str:
    return (e.url or "").split("?", 1)[1] if "?" in (e.url or "") else ""


def _shell_names(e: Event) -> set[str]:
    """Upload POST path basename, plus any decoded query value naming a server script."""
    names = {_basename(_url_path(e))}
    for _key, value in parse_qsl(_query(e), keep_blank_values=True):
        if value.lower().endswith(SHELL_EXTS):
            names.add(_basename(value))
    return names


def _rule_web_shell(events: list[Event], _ctx) -> list[tuple]:
    uploads = [e for e in events if e.event_type == "http_request"
               and _raw_json(e).get("method", "").upper() == "POST"
               and "upload" in _url_path(e).lower()
               and _url_path(e).lower().endswith(SHELL_EXTS)
               and e.status_code in (200, 201)]
    by_name: dict[str, list[Event]] = defaultdict(list)
    for e in uploads:
        for name in _shell_names(e):
            by_name[name].append(e)
    hits = []
    for name, group in sorted(by_name.items()):
        first = min(_ts(e) for e in group)
        cmd_calls = [e for e in events if e.event_type == "http_request" and _ts(e) > first
                     and _basename(_url_path(e)) == name and "cmd" in parse_qs(_query(e), keep_blank_values=True)]
        if cmd_calls:
            matched = sorted({e.id: e for e in group + cmd_calls}.values(), key=_ts)
            hits.append((f"Web shell {name} uploaded and used with cmd=", None, matched))
    return hits


def _rule_webserver_shell_spawn(events: list[Event], _ctx) -> list[tuple]:
    matched = [e for e in events if e.event_type == "process_create"
               and (e.parent_process or "").lower() in WEB_SERVER_PARENTS
               and (e.process or "").lower() in SHELL_CHILDREN]
    hits = []
    for host, group in sorted(_group(matched, lambda e: e.host or "unknown").items()):
        hits.append((f"Web server process spawned shell activity on {host}", None, group))
    return hits


def _rule_ps_encoded(events: list[Event], _ctx) -> list[tuple]:
    def encoded(e: Event) -> bool:
        cl = (e.command_line or "").lower()
        return ("-enc" in cl or "frombase64string" in cl
                or bool(B64_ARG.search(e.command_line or "")))

    matched = [e for e in events if e.event_type == "process_create"
               and (e.process or "").lower() in ("powershell.exe", "pwsh.exe") and encoded(e)]
    hits = []
    for host, group in sorted(_group(matched, lambda e: e.host or "unknown").items()):
        hits.append((f"Encoded PowerShell on {host}", None, group))
    return hits


def _rule_lsass_dump(events: list[Event], _ctx) -> list[tuple]:
    def dumps(e: Event) -> bool:
        if e.event_type == "process_access":
            return "lsass.exe" in e.message.lower() and (e.process or "").lower() not in BENIGN_LSASS_SOURCES
        if e.event_type == "process_create":
            cl = (e.command_line or "").lower()
            return ("comsvcs.dll" in cl and "minidump" in cl) or ("procdump" in cl and "lsass" in cl) \
                or "sekurlsa" in cl
        return False

    matched = [e for e in events if dumps(e)]
    hits = []
    for host, group in sorted(_group(matched, lambda e: e.host or "unknown").items()):
        hits.append((f"LSASS memory access on {host}", None, group))
    return hits


def _rule_explicit_cred(events: list[Event], ctx) -> list[tuple]:
    explicit = [e for e in events if e.event_type == "explicit_logon"]
    network_logons = []
    for e in events:
        msg = e.message.lower()
        if e.event_type != "logon" or not ("logontype 3" in msg or "logontype 9" in msg):
            continue
        src_host = ctx["ip_host"].get(e.src_ip or "")
        if not src_host or src_host in ctx["dcs"]:
            continue
        for dump in ctx["lsass_events"].get(src_host, []):
            if abs(_ts(e) - _ts(dump)) <= timedelta(hours=2):
                network_logons.append(e)
                break
    matched = sorted(explicit + network_logons, key=_ts)
    if not matched:
        return []
    return [(f"Explicit credential use ({len(matched)} logon events)", None, matched)]


def _rule_admin_share(events: list[Event], ctx) -> list[tuple]:
    matched = [e for e in events if e.event_type == "share_access"
               and any(s in e.message.lower() for s in SHARE_NAMES)
               and ctx["ip_host"].get(e.src_ip or "") not in ctx["dcs"]]
    hits = []
    for src, group in sorted(_group(matched, lambda e: e.src_ip or "unknown").items()):
        hits.append((f"Administrative share access from {src}", None, group))
    return hits


def _rule_psexec(events: list[Event], _ctx) -> list[tuple]:
    def psexec(e: Event) -> bool:
        if e.event_type == "service_install":
            return "psexesvc" in (e.process or "").lower() or "psexesvc" in e.message.lower()
        return e.event_type == "process_create" and (e.process or "").lower() == "psexesvc.exe"

    matched = [e for e in events if psexec(e)]
    hits = []
    for host, group in sorted(_group(matched, lambda e: e.host or "unknown").items()):
        hits.append((f"PsExec service activity on {host}", None, group))
    return hits


def _rule_archive_staging(events: list[Event], _ctx) -> list[tuple]:
    def staging(e: Event) -> bool:
        cl = (e.command_line or "").lower()
        return e.event_type == "process_create" and (e.process or "").lower() in ARCHIVERS \
            and (" a " in f" {cl} " or "-a" in cl)

    matched = [e for e in events if staging(e)]
    hits = []
    for host, group in sorted(_group(matched, lambda e: e.host or "unknown").items()):
        with_password = any("-p" in (e.command_line or "").lower() for e in group)
        sev = "critical" if with_password else None
        hits.append((f"Archive staging on {host}", sev, group))
    return hits


def _rule_exfil_volume(events: list[Event], _ctx) -> list[tuple]:
    matched = [e for e in events if e.event_type in ("network_flow", "network_connect")
               and e.bytes_out is not None and e.bytes_out >= EXFIL_BYTES and _is_external(e.dst_ip)]
    hits = []
    for dst, group in sorted(_group(matched, lambda e: e.dst_ip).items()):
        total_mb = sum(e.bytes_out or 0 for e in group) // 1_000_000
        hits.append((f"Large outbound transfer to {dst} (~{total_mb} MB)", None, group))
    return hits


def _rule_brute_force(events: list[Event], _ctx) -> list[tuple]:
    failures = [e for e in events if e.event_type == "logon_failure"]
    hits = []
    for dim, key in (("user", lambda e: e.user), ("source", lambda e: e.src_ip)):
        for k, group in sorted(_group(failures, key).items()):
            window = _burst(group, 5, BRUTE_THRESHOLD)
            if window:
                hits.append((f"Brute force against {dim} {k} ({len(window)} failures in 5 min)", None, window))
    return hits


SIEM_TAG_MAX_TECHNIQUES = 12
SIEM_TAG_SAMPLE = 12


def _siem_tagged_hits(events: list[Event]) -> list[tuple]:
    """Alerts the source SIEM already tagged with an ATT&CK technique (generic CSV/JSON feeds).

    One hit per technique, ranked by how many high/critical records carry it. Each hit keeps a small
    sample of its records (critical first) so signals stay readable; the title carries the full count.
    Returns (title, severity, sample, technique_id, tactic) tuples.
    """
    tagged = [e for e in events if e.tag_technique and e.severity in ("high", "critical")]
    ranked = sorted(_group(tagged, lambda e: e.tag_technique).items(), key=lambda kv: (-len(kv[1]), kv[0]))
    hits = []
    for technique, group in ranked[:SIEM_TAG_MAX_TECHNIQUES]:
        tactic = next((e.tag_tactic for e in group if e.tag_tactic), "Unknown")
        sample = sorted(group, key=lambda e: (e.severity != "critical", _ts(e)))[:SIEM_TAG_SAMPLE]
        severity = "critical" if any(e.severity == "critical" for e in group) else "high"
        hits.append((f"SIEM-tagged {technique} ({tactic}): {len(group)} high/critical alerts",
                     severity, sample, technique, tactic))
    return hits


RULES: list[tuple[str, str, str, str, Callable]] = [
    ("WEB-SCAN", "T1595.002", "Reconnaissance", "medium", _rule_web_scan),
    ("WEB-SQLI", "T1190", "Initial Access", "high", _rule_web_sqli),
    ("WEB-SHELL", "T1505.003", "Persistence", "critical", _rule_web_shell),
    ("WEBSERVER-SHELL-SPAWN", "T1059.003", "Execution", "high", _rule_webserver_shell_spawn),
    ("PS-ENCODED", "T1059.001", "Execution", "high", _rule_ps_encoded),
    ("LSASS-DUMP", "T1003.001", "Credential Access", "critical", _rule_lsass_dump),
    ("EXPLICIT-CRED", "T1078", "Privilege Escalation", "high", _rule_explicit_cred),
    ("ADMIN-SHARE", "T1021.002", "Lateral Movement", "high", _rule_admin_share),
    ("PSEXEC", "T1569.002", "Execution", "high", _rule_psexec),
    ("ARCHIVE-STAGING", "T1560.001", "Collection", "high", _rule_archive_staging),
    ("EXFIL-VOLUME", "T1041", "Exfiltration", "critical", _rule_exfil_volume),
    ("BRUTE-FORCE", "T1110", "Credential Access", "medium", _rule_brute_force),
]


def _entities(events: list[Event]) -> list[str]:
    ips = {v for e in events for v in (e.src_ip, e.dst_ip) if v}
    hosts = {e.host for e in events if e.host}
    users = {e.user for e in events if e.user}
    procs = {p for e in events for p in (e.process, e.parent_process) if p}
    return sorted(ips) + sorted(hosts) + sorted(users) + sorted(procs)


def run_rules(events: list[Event]) -> list[Signal]:
    """Run every rule over `events`; returns signals and updates matched events in place."""
    ip_host = ip_host_map(events)
    dcs = {e.host.upper() for e in events if e.host and e.host.upper().startswith("DC-")}
    lsass: dict[str, list[Event]] = defaultdict(list)
    ctx_base = {"ip_host": ip_host, "dcs": dcs, "lsass_events": lsass}

    # LSASS hits feed EXPLICIT-CRED, so compute them first.
    raw_hits: list[tuple] = []
    for rule_id, technique, tactic, severity, fn in RULES:
        if rule_id == "LSASS-DUMP":
            for title, sev, matched in fn(events, ctx_base):
                lsass[(matched[0].host or "").upper()].extend(matched)
                raw_hits.append((rule_id, technique, tactic, severity, title, sev, matched))
    for rule_id, technique, tactic, severity, fn in RULES:
        if rule_id == "LSASS-DUMP":
            continue
        for title, sev, matched in fn(events, ctx_base):
            raw_hits.append((rule_id, technique, tactic, severity, title, sev, matched))

    for title, sev, matched, technique, tactic in _siem_tagged_hits(events):
        raw_hits.append(("SIEM-TAGGED", technique, tactic, "high", title, sev, matched))

    raw_hits.sort(key=lambda h: (min(_ts(e) for e in h[6]), h[0], h[4]))
    signals: list[Signal] = []
    for n, (rule_id, technique, tactic, severity, title, sev, matched) in enumerate(raw_hits, start=1):
        sig_id = f"SIG-{n:03d}"
        ordered = sorted(matched, key=_ts)
        signals.append(Signal(
            id=sig_id, rule_id=rule_id, title=title, technique_id=technique, tactic=tactic,
            severity=sev or severity, event_ids=[e.id for e in ordered[:MAX_EVENT_IDS]],
            entities=_entities(ordered),
        ))
        for e in ordered:
            if "suspicious" not in e.flags:
                e.flags.append("suspicious")
            if sig_id not in e.signal_ids:
                e.signal_ids.append(sig_id)
    return signals
