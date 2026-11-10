import json
from datetime import datetime, timedelta, timezone

from saksi.graphs import build_graph, build_story, finding_severity
from saksi.models import Event, Finding

BASE = datetime(2026, 11, 3, 1, 0, 0, tzinfo=timezone.utc)
ATTACKER = "203.0.113.66"


def at(seconds: float) -> str:
    return (BASE + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


def ev(eid: str, sec: float, event_type: str, **kw) -> Event:
    raw = kw.pop("raw", "{}")
    kw.setdefault("source", "generic")
    kw.setdefault("message", "")
    return Event(id=eid, ts=at(sec), source_file="test.log", event_type=event_type,
                 raw=raw, sha256="0" * 64, **kw)


def fnd(fid: str, tactic: str, evidence: list[str], status: str = "verified",
        technique: str = "T0000") -> Finding:
    return Finding(id=fid, title=f"{tactic} step", summary=f"{tactic} summary", tactic=tactic,
                   technique_id=technique, technique_name=tactic, evidence_ids=evidence, status=status)


def scenario():
    post = json.dumps({"method": "POST"})
    events = [
        ev("EV-1", 0, "http_request", raw=post, src_ip=ATTACKER, dst_ip="10.10.1.10",
           host="WEB-PORTAL-01", url="/upload/img_upd.aspx", status_code=200,
           message="POST /upload/img_upd.aspx -> 200"),
        ev("EV-2", 60, "http_request", raw=json.dumps({"method": "GET"}), src_ip=ATTACKER,
           dst_ip="10.10.1.10", host="WEB-PORTAL-01", url="/x", status_code=200),
        ev("EV-3", 120, "process_create", host="WEB-PORTAL-01", parent_process="w3wp.exe",
           process="cmd.exe", message="spawned"),
        ev("EV-4", 180, "process_create", host="WEB-PORTAL-01", parent_process="cmd.exe",
           process="powershell.exe", message="spawned"),
        ev("EV-5", 240, "process_access", host="WEB-PORTAL-01", process="rundll32.exe",
           message="rundll32.exe -> lsass.exe GrantedAccess 0x1fffff"),
        ev("EV-6", 300, "logon", host="FS-LOGISTIK-01", user="LOGISTIK\\k.hafiz", src_ip="10.10.1.10",
           message="LogonType 3"),
        ev("EV-7", 400, "network_flow", src_ip="10.10.3.20", dst_ip="198.51.100.77",
           bytes_out=412_000_000, message="dst port 443"),
        ev("EV-8", 30, "process_create", host="WS-01", parent_process="explorer.exe",
           process="notepad.exe", message="noise"),
        ev("EV-9", 90, "http_request", raw=post, src_ip=ATTACKER, dst_ip="10.10.1.10",
           host="WEB-PORTAL-01", url="/upload/img_upd.aspx", status_code=200),
    ]
    findings = [
        fnd("F-004", "Exfiltration", ["EV-7"], technique="T1041"),
        fnd("F-003", "Credential Access", ["EV-5"], technique="T1003.001"),
        fnd("F-002", "Execution", ["EV-3", "EV-4"], technique="T1059.003"),
        fnd("F-001", "Persistence", ["EV-1", "EV-2", "EV-9"], technique="T1505.003"),
        fnd("F-006", "Defense Evasion", ["EV-6"], technique="T1078"),
        fnd("F-005", "Discovery", ["EV-8"], status="rejected", technique="T1057"),
    ]
    return events, findings


def edge_by_label(graph, label):
    return [e for e in graph.edges if e.label == label]


def test_finding_severity_by_tactic():
    assert finding_severity(fnd("F", "Exfiltration", [])) == "critical"
    assert finding_severity(fnd("F", "Credential Access", [])) == "critical"
    assert finding_severity(fnd("F", "Lateral Movement", [])) == "high"
    assert finding_severity(fnd("F", "Initial Access", [])) == "high"
    assert finding_severity(fnd("F", "Reconnaissance", [])) == "medium"
    assert finding_severity(fnd("F", "Something Else", [])) == "medium"


def test_ip_resolves_to_host_and_internal_ip_has_no_node():
    events, findings = scenario()
    graph = build_graph(events, findings)
    ids = {n.id for n in graph.nodes}
    assert "host:WEB-PORTAL-01" in ids
    assert f"ip:{ATTACKER}" in ids
    assert "ip:10.10.1.10" not in ids
    post = edge_by_label(graph, "HTTP POST 200")
    assert len(post) == 1 and post[0].source == f"ip:{ATTACKER}" and post[0].target == "host:WEB-PORTAL-01"
    logon = edge_by_label(graph, "logon as LOGISTIK\\k.hafiz")
    assert logon and logon[0].source == "host:WEB-PORTAL-01" and logon[0].target == "host:FS-LOGISTIK-01"


def test_edges_merge_duplicates_and_keep_earliest_ts():
    events, findings = scenario()
    graph = build_graph(events, findings)
    post = edge_by_label(graph, "HTTP POST 200")[0]
    assert post.event_ids == ["EV-1", "EV-9"]
    assert post.ts == at(0)


def test_edge_labels_per_event_type():
    events, findings = scenario()
    graph = build_graph(events, findings)
    labels = {e.label for e in graph.edges}
    assert {"spawned", "read memory", "authenticated", "exfiltration 412 MB",
            "HTTP GET 200"} <= labels
    spawned = edge_by_label(graph, "spawned")
    assert {(e.source, e.target) for e in spawned} == {
        ("process:w3wp.exe@WEB-PORTAL-01", "process:cmd.exe@WEB-PORTAL-01"),
        ("process:cmd.exe@WEB-PORTAL-01", "process:powershell.exe@WEB-PORTAL-01"),
    }
    assert edge_by_label(graph, "read memory")[0].target == "process:lsass.exe@WEB-PORTAL-01"


def test_rejected_findings_excluded_from_graph():
    events, findings = scenario()
    graph = build_graph(events, findings)
    assert "process:notepad.exe@WS-01" not in {n.id for n in graph.nodes}
    assert all("EV-8" not in e.event_ids for e in graph.edges)


def test_edge_ids_sequential_by_timestamp():
    events, findings = scenario()
    graph = build_graph(events, findings)
    assert [e.id for e in graph.edges] == [f"E-{i:03d}" for i in range(1, len(graph.edges) + 1)]
    stamps = [e.ts for e in graph.edges]
    assert stamps == sorted(stamps)


def test_node_risk_and_evidence_filled():
    events, findings = scenario()
    graph = build_graph(events, findings)
    nodes = {n.id: n for n in graph.nodes}
    assert nodes["process:lsass.exe@WEB-PORTAL-01"].risk == "critical"
    assert nodes["process:lsass.exe@WEB-PORTAL-01"].finding_ids == ["F-003"]
    assert nodes[f"ip:{ATTACKER}"].risk == "high"
    assert nodes[f"ip:{ATTACKER}"].first_seen == at(0)
    assert nodes[f"ip:{ATTACKER}"].last_seen == at(90)
    assert nodes["ip:198.51.100.77"].risk == "critical"


def test_graph_capped_at_sixty_nodes():
    flows = [ev(f"EV-{i:03d}", i, "network_connect", src_ip="10.10.3.20",
                dst_ip=f"198.51.100.{i}", bytes_out=100) for i in range(1, 71)]
    finding = fnd("F-001", "Discovery", [e.id for e in flows], technique="T1049")
    graph = build_graph(flows, [finding])
    assert len(graph.nodes) == 60
    kept = {n.id for n in graph.nodes}
    assert all(e.source in kept and e.target in kept for e in graph.edges)


def test_story_orders_steps_by_real_timestamp_and_skips_rejected():
    events, findings = scenario()
    graph = build_graph(events, findings)
    story = build_story("CASE-TEST-0001", findings, graph, events)
    assert [s.finding_id for s in story.steps] == ["F-001", "F-002", "F-003", "F-006", "F-004"]
    assert [s.order for s in story.steps] == [1, 2, 3, 4, 5]
    assert story.steps[0].ts == at(0)
    assert "F-005" not in {s.finding_id for s in story.steps}


def test_story_summary_and_severity():
    events, findings = scenario()
    graph = build_graph(events, findings)
    story = build_story("CASE-TEST-0001", findings, graph, events)
    assert story.summary == ("5 attack steps between 01:00 and 01:06 UTC: Persistence -> Execution -> "
                             "Credential Access -> Defense Evasion -> Exfiltration")
    assert story.severity == "critical"
    assert story.case_id == "CASE-TEST-0001"


def test_story_steps_reference_graph_and_edge_step_set():
    events, findings = scenario()
    graph = build_graph(events, findings)
    story = build_story("CASE-TEST-0001", findings, graph, events)
    step1 = story.steps[0]
    assert step1.event_ids == ["EV-1", "EV-2", "EV-9"]
    assert f"ip:{ATTACKER}" in step1.node_ids
    assert edge_by_label(graph, "HTTP POST 200")[0].step == 1
    assert edge_by_label(graph, "HTTP GET 200")[0].step == 1
    assert edge_by_label(graph, "spawned")[0].step == 2
    assert edge_by_label(graph, "read memory")[0].step == 3
    assert edge_by_label(graph, "logon as LOGISTIK\\k.hafiz")[0].step == 4
    assert edge_by_label(graph, "authenticated")[0].step == 4
    assert edge_by_label(graph, "exfiltration 412 MB")[0].step == 5


def test_story_with_no_active_findings_is_empty():
    events, findings = scenario()
    rejected_only = [f for f in findings if f.status == "rejected"]
    graph = build_graph(events, rejected_only)
    story = build_story("CASE-TEST-0001", rejected_only, graph, events)
    assert story.steps == [] and graph.nodes == [] and graph.edges == []
    assert story.severity == "info"
