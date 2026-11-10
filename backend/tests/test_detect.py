from datetime import datetime, timedelta, timezone

from saksi import attack_db
from saksi.detect import RULES, run_rules
from saksi.models import Event

BASE = datetime(2026, 11, 3, 1, 0, 0, tzinfo=timezone.utc)


def at(seconds: float) -> str:
    return (BASE + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


def ev(eid: str, sec: float, event_type: str, **kw) -> Event:
    raw = kw.pop("raw", "{}")
    kw.setdefault("source", "generic")
    kw.setdefault("message", "")
    return Event(id=eid, ts=at(sec), source_file="test.log", event_type=event_type,
                 raw=raw, sha256="0" * 64, **kw)


def rules(events):
    return {s.rule_id for s in run_rules(events)}


def test_web_scan_hit_and_benign():
    hits = [ev(f"EV-{i}", i * 20, "http_request", src_ip="203.0.113.66", status_code=404,
               url=f"/admin{i}") for i in range(20)]
    assert "WEB-SCAN" in rules(hits)
    # 19 hits are below threshold; internal scanner is not external
    assert "WEB-SCAN" not in rules(hits[:19])
    internal = [ev(f"EV-{i}", i * 20, "http_request", src_ip="10.10.5.5", status_code=404)
                for i in range(25)]
    assert "WEB-SCAN" not in rules(internal)


def test_web_scan_signal_fields():
    hits = [ev(f"EV-{i}", i * 20, "http_request", src_ip="203.0.113.66", status_code=404)
            for i in range(20)]
    sig = next(s for s in run_rules(hits) if s.rule_id == "WEB-SCAN")
    assert (sig.technique_id, sig.tactic, sig.severity) == ("T1595.002", "Reconnaissance", "medium")
    assert "203.0.113.66" in sig.entities


def test_web_sqli_hit_and_benign():
    hit = ev("EV-1", 0, "http_request", url="/search?q=' or 1=1 --", src_ip="203.0.113.66")
    assert "WEB-SQLI" in rules([hit])
    assert "WEB-SQLI" in rules([ev("EV-2", 0, "http_request", url="/x?u=%27")])
    assert "WEB-SQLI" in rules([ev("EV-3", 0, "http_request", url="/x?q=1 UNION SELECT pass")])
    assert "WEB-SQLI" in rules([ev("EV-4", 0, "http_request", url="/x?q=1;sleep(5)")])
    assert "WEB-SQLI" in rules([ev("EV-5", 0, "http_request", url="/x?q=exec xp_cmdshell")])
    assert "WEB-SQLI" in rules([ev("EV-6", 0, "http_request", url="/x?q='--")])
    assert "WEB-SQLI" not in rules([ev("EV-7", 0, "http_request", url="/products?id=5")])


def test_web_sqli_signal_is_high_initial_access():
    sig = next(s for s in run_rules([ev("EV-1", 0, "http_request", url="/x?q=%27")])
               if s.rule_id == "WEB-SQLI")
    assert (sig.technique_id, sig.tactic, sig.severity) == ("T1190", "Initial Access", "high")


def test_web_shell_hit_and_benign():
    upload = ev("EV-1", 0, "http_request", raw='{"method": "POST"}', url="/upload/img_upd.aspx",
                status_code=200)
    use = ev("EV-2", 60, "http_request", url="/upload/img_upd.aspx?cmd=whoami", status_code=200)
    sigs = run_rules([upload, use])
    shell = next(s for s in sigs if s.rule_id == "WEB-SHELL")
    assert (shell.technique_id, shell.tactic, shell.severity) == ("T1505.003", "Persistence", "critical")
    assert shell.event_ids == ["EV-1", "EV-2"]
    # GET to the upload path is not an upload; upload without later cmd= use is not a hit
    get_only = ev("EV-3", 0, "http_request", raw='{"method": "GET"}', url="/upload/img_upd.aspx",
                  status_code=200)
    assert "WEB-SHELL" not in rules([get_only, use])
    assert "WEB-SHELL" not in rules([upload])
    failed = ev("EV-4", 0, "http_request", raw='{"method": "POST"}', url="/upload/a.php", status_code=500)
    assert "WEB-SHELL" not in rules([failed, ev("EV-5", 60, "http_request", url="/upload/a.php?cmd=id")])


def test_webserver_shell_spawn_hit_and_benign():
    hit = ev("EV-1", 0, "process_create", host="WEB-PORTAL-01", parent_process="w3wp.exe",
             process="cmd.exe")
    assert "WEBSERVER-SHELL-SPAWN" in rules([hit])
    benign = ev("EV-2", 0, "process_create", host="WS-01", parent_process="explorer.exe",
                process="cmd.exe")
    assert "WEBSERVER-SHELL-SPAWN" not in rules([benign])
    not_shell = ev("EV-3", 0, "process_create", host="WEB-PORTAL-01", parent_process="w3wp.exe",
                   process="notepad.exe")
    assert "WEBSERVER-SHELL-SPAWN" not in rules([not_shell])


def test_ps_encoded_hit_and_benign():
    for cl in ("powershell.exe -nop -w hidden -enc SQBFAFgA",
               "powershell.exe -encodedcommand SQBFAFgA",
               "powershell.exe -e SQBFAFgAIAAoAE5ldy1PYmplY3Q=",
               "powershell.exe [System.Convert]::FromBase64String('abc')"):
        hit = ev("EV-1", 0, "process_create", host="WEB-PORTAL-01", process="powershell.exe",
                 command_line=cl)
        assert "PS-ENCODED" in rules([hit]), cl
    benign = ev("EV-2", 0, "process_create", host="WS-01", process="powershell.exe",
                command_line="powershell.exe -File C:\\scripts\\report.ps1")
    assert "PS-ENCODED" not in rules([benign])


def test_lsass_dump_hit_and_benign():
    access = ev("EV-1", 0, "process_access", host="WEB-PORTAL-01", process="rundll32.exe",
                message="rundll32.exe -> lsass.exe GrantedAccess 0x1fffff")
    assert "LSASS-DUMP" in rules([access])
    cmd = ev("EV-2", 0, "process_create", host="WEB-PORTAL-01", process="rundll32.exe",
             command_line="rundll32.exe C:\\Windows\\System32\\comsvcs.dll, MiniDump 648 out.dmp full")
    assert "LSASS-DUMP" in rules([cmd])
    assert "LSASS-DUMP" in rules([ev("EV-3", 0, "process_create", process="procdump.exe",
                                     command_line="procdump -ma lsass.exe out.dmp")])
    assert "LSASS-DUMP" in rules([ev("EV-4", 0, "process_create", process="mimikatz.exe",
                                     command_line="mimikatz sekurlsa::logonpasswords")])
    benign = ev("EV-5", 0, "process_access", host="WS-01", process="chrome.exe",
                message="chrome.exe -> chrome.exe GrantedAccess 0x0010")
    assert "LSASS-DUMP" not in rules([benign])


def test_lsass_access_from_defender_is_not_a_hit():
    defender = ev("EV-1", 0, "process_access", host="DC-01", process="msmpeng.exe",
                  message="msmpeng.exe -> lsass.exe GrantedAccess 0x1010")
    assert "LSASS-DUMP" not in rules([defender])
    attacker = ev("EV-2", 0, "process_access", host="DC-01", process="rundll32.exe",
                  message="rundll32.exe -> lsass.exe GrantedAccess 0x1fffff")
    assert "LSASS-DUMP" in rules([attacker])


def test_web_shell_name_from_upload_query_string_matches_scenario_shape():
    upload = ev("EV-1", 0, "http_request", raw='{"method": "POST"}',
                url="/shipments/upload.aspx?name=img_upd.aspx", status_code=200)
    whoami = ev("EV-2", 100, "http_request", url="/img_upd.aspx?cmd=whoami", status_code=200)
    ipconfig = ev("EV-3", 200, "http_request", url="/img_upd.aspx?cmd=ipconfig%20/all", status_code=200)
    sigs = run_rules([upload, whoami, ipconfig])
    shell = [s for s in sigs if s.rule_id == "WEB-SHELL"]
    assert len(shell) == 1
    assert shell[0].event_ids == ["EV-1", "EV-2", "EV-3"]
    assert shell[0].technique_id == "T1505.003" and shell[0].severity == "critical"


def test_every_rule_tactic_is_valid_for_its_technique():
    for rule_id, technique, tactic, _severity, _fn in RULES:
        assert tactic in attack_db.tactics_for(technique), (rule_id, technique, tactic)


def test_explicit_cred_alone_triggers():
    explicit = ev("EV-1", 0, "explicit_logon", user="LOGISTIK\\k.hafiz", host="WEB-PORTAL-01",
                  message="explicit credentials to FS-LOGISTIK-01")
    assert "EXPLICIT-CRED" in rules([explicit])


def test_explicit_cred_network_logon_after_lsass():
    http = ev("EV-0", 0, "http_request", raw='{"method": "GET"}', host="WEB-PORTAL-01",
              dst_ip="10.10.1.10", src_ip="203.0.113.66", url="/")
    dump = ev("EV-1", 10, "process_access", host="WEB-PORTAL-01", process="rundll32.exe",
              message="lsass.exe GrantedAccess 0x1fffff")
    logon = ev("EV-2", 3600, "logon", host="FS-LOGISTIK-01", user="LOGISTIK\\k.hafiz",
               src_ip="10.10.1.10", message="LogonType 3")
    assert "EXPLICIT-CRED" in rules([http, dump, logon])
    # Same logon from a domain controller is not counted
    dc_http = ev("EV-3", 0, "http_request", raw='{"method": "GET"}', host="DC-01",
                 dst_ip="10.10.0.5", src_ip="203.0.113.66", url="/")
    dc_logon = ev("EV-4", 3600, "logon", host="FS-LOGISTIK-01", user="LOGISTIK\\k.hafiz",
                  src_ip="10.10.0.5", message="LogonType 3")
    assert "EXPLICIT-CRED" not in rules([dc_http, ev("EV-5", 10, "process_access", host="DC-01",
                                                      message="lsass.exe"), dc_logon])
    # Outside the 2 h window
    late = ev("EV-6", 3 * 3600, "logon", host="FS-LOGISTIK-01", src_ip="10.10.1.10",
              message="LogonType 3")
    assert "EXPLICIT-CRED" not in rules([http, dump, late])


def test_admin_share_hit_and_benign():
    hit = ev("EV-1", 0, "share_access", user="LOGISTIK\\k.hafiz", src_ip="10.10.1.10",
             host="FS-LOGISTIK-01", message="\\\\*\\ADMIN$")
    assert "ADMIN-SHARE" in rules([hit])
    assert "ADMIN-SHARE" in rules([ev("EV-2", 0, "share_access", src_ip="10.10.1.10",
                                      message="\\\\*\\C$")])
    benign_share = ev("EV-3", 0, "share_access", src_ip="10.10.1.10", message="\\\\*\\Logistik")
    assert "ADMIN-SHARE" not in rules([benign_share])
    from_dc = ev("EV-4", 0, "share_access", src_ip="10.10.0.5", host="FS-LOGISTIK-01",
                 message="\\\\*\\ADMIN$")
    dc_map = ev("EV-5", 0, "network_connect", source="sysmon", host="DC-01", src_ip="10.10.0.5")
    assert "ADMIN-SHARE" not in rules([from_dc, dc_map])


def test_psexec_hit_and_benign():
    svc = ev("EV-1", 0, "service_install", host="FS-LOGISTIK-01", process="PSEXESVC.exe",
             message="service name PSEXESVC")
    assert "PSEXEC" in rules([svc])
    assert "PSEXEC" in rules([ev("EV-2", 0, "process_create", host="FS-LOGISTIK-01",
                                 process="psexesvc.exe")])
    assert "PSEXEC" not in rules([ev("EV-3", 0, "service_install", host="FS-LOGISTIK-01",
                                     process="spoolsv.exe", message="Print Spooler")])


def test_archive_staging_hit_and_benign():
    hit = ev("EV-1", 0, "process_create", host="FS-LOGISTIK-01", process="7z.exe",
             command_line="7z.exe a D:\\out.7z D:\\Shares\\Logistik\\Jadual")
    sig = next(s for s in run_rules([hit]) if s.rule_id == "ARCHIVE-STAGING")
    assert (sig.technique_id, sig.tactic, sig.severity) == ("T1560.001", "Collection", "high")
    protected = ev("EV-2", 0, "process_create", host="FS-LOGISTIK-01", process="7z.exe",
                   command_line="7z.exe a -pSecret123 D:\\out.7z D:\\Shares")
    crit = next(s for s in run_rules([protected]) if s.rule_id == "ARCHIVE-STAGING")
    assert crit.severity == "critical"
    assert "ARCHIVE-STAGING" not in rules([ev("EV-3", 0, "process_create", host="WS-01",
                                               process="7z.exe", command_line="7z.exe x backup.7z")])


def test_exfil_volume_hit_and_benign():
    hit = ev("EV-1", 0, "network_flow", src_ip="10.10.3.20", dst_ip="198.51.100.77",
             bytes_out=412_000_000)
    sig = next(s for s in run_rules([hit]) if s.rule_id == "EXFIL-VOLUME")
    assert (sig.technique_id, sig.tactic, sig.severity) == ("T1041", "Exfiltration", "critical")
    assert "EXFIL-VOLUME" in rules([ev("EV-2", 0, "network_connect", src_ip="10.10.3.20",
                                       dst_ip="198.51.100.77", bytes_out=50_000_000)])
    assert "EXFIL-VOLUME" not in rules([ev("EV-3", 0, "network_flow", src_ip="10.10.3.20",
                                           dst_ip="198.51.100.77", bytes_out=1_000_000)])
    assert "EXFIL-VOLUME" not in rules([ev("EV-4", 0, "network_flow", src_ip="10.10.3.20",
                                           dst_ip="10.10.0.5", bytes_out=412_000_000)])


def test_brute_force_hit_and_benign():
    fails = [ev(f"EV-{i}", i * 20, "logon_failure", user="LOGISTIK\\k.hafiz", src_ip="10.10.1.10")
             for i in range(10)]
    assert "BRUTE-FORCE" in rules(fails)
    assert "BRUTE-FORCE" not in rules(fails[:9])
    spread = [ev(f"EV-{i}", i * 3600, "logon_failure", user="LOGISTIK\\k.hafiz", src_ip="10.10.1.10")
              for i in range(10)]
    assert "BRUTE-FORCE" not in rules(spread)


def test_flags_and_signal_ids_updated_in_place_and_event_cap():
    fails = [ev(f"EV-{i:03d}", i, "logon_failure", user="u", src_ip="10.0.0.9") for i in range(70)]
    brute = [s for s in run_rules(fails) if s.rule_id == "BRUTE-FORCE"]
    assert len(brute) == 2  # one for the user dimension, one for the source dimension
    assert all(len(s.event_ids) == 60 for s in brute)  # 70 matched, capped at 60 ids
    expected_ids = [s.id for s in brute]
    assert all("suspicious" in e.flags for e in fails)
    assert all(e.signal_ids == expected_ids for e in fails)


def test_signal_ids_ordered_by_first_event_time():
    http = [ev(f"EV-{i}", 100 + i * 20, "http_request", src_ip="203.0.113.66", status_code=404)
            for i in range(20)]
    proc = ev("EV-P", 0, "process_create", host="WEB-PORTAL-01", parent_process="w3wp.exe",
              process="cmd.exe")
    sigs = run_rules(http + [proc])
    assert [s.id for s in sigs] == ["SIG-001", "SIG-002"]
    assert sigs[0].rule_id == "WEBSERVER-SHELL-SPAWN"
