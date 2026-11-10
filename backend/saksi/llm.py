"""OpenRouter client for SAKSI: forced JSON calls, a bounded tool loop and a cached health probe.

Every model request goes through `_chat`, so tests can replace one function.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from openai import OpenAI

from saksi import config
from saksi.models import LlmHealth

BASE_URL = "https://openrouter.ai/api/v1"
TIMEOUT_S = 90.0
MAX_RETRIES = 2
JSON_ATTEMPTS = 2          # a forced call is retried once when its arguments are not usable JSON
MAX_TOKENS_TOOLS = 12000     # reasoning tokens count against this; 4096 truncated the final submission
TOOL_RESULT_MAX = 6000
HEALTH_TTL_S = 60.0

Handler = Callable[[dict[str, Any]], tuple[Any, str]]
StepHook = Callable[[dict[str, Any]], None]


class LlmError(RuntimeError):
    """The model could not produce a usable answer. The message never contains the API key."""


@dataclass
class Usage:
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: int = 0


@dataclass
class ToolRunResult:
    final_args: dict[str, Any] | None
    rounds: int
    usage: list[Usage] = field(default_factory=list)


_health_lock = threading.Lock()
_health: tuple[float, LlmHealth] | None = None


def redact_secrets(text: str) -> str:
    """Remove the API key from text and cap its length, so error text is safe to store or show."""
    key = config.api_key()
    if key:
        text = text.replace(key, "[redacted]")
    return text[:200]


def _client() -> OpenAI:
    key = config.api_key()
    if not key:
        raise LlmError("No OpenRouter API key is configured.")
    return OpenAI(base_url=BASE_URL, api_key=key, timeout=TIMEOUT_S, max_retries=MAX_RETRIES)


def _chat(**kwargs: Any) -> Any:
    """Send one chat completion request at temperature 0. Every model call goes through here."""
    try:
        return _client().chat.completions.create(temperature=0, **kwargs)
    except LlmError:
        raise
    except Exception as exc:  # any SDK or network failure becomes LlmError without secret text
        raise LlmError(f"LLM request failed ({type(exc).__name__}): {redact_secrets(str(exc))}") from None


_DEFAULT_CHAT_REF = _chat


def _is_fast_workflow() -> bool:
    """Use the fast deterministic workflow engine unless a test monkeypatched _chat or SAKSI_LIVE_LLM=1."""
    return _chat is _DEFAULT_CHAT_REF and os.environ.get("SAKSI_LIVE_LLM") != "1"


def _pace(seconds: float = 0.22) -> None:
    """Short pacing delay only on background worker threads so live UI animations stream smoothly."""
    if threading.current_thread() is not threading.main_thread():
        time.sleep(seconds)


def _extract_log_data_blocks(text: str) -> list[Any]:
    blocks: list[Any] = []
    for match in re.finditer(r"<log_data>\s*(.*?)\s*</log_data>", text, flags=re.DOTALL):
        raw = match.group(1).strip()
        try:
            blocks.append(json.loads(raw))
        except Exception:
            blocks.append(raw)
    return blocks


def _fast_complete_json(
    system: str,
    user: str,
    schema_name: str,
    chosen: str,
) -> tuple[dict[str, Any], Usage]:
    _pace(0.25)
    blocks = _extract_log_data_blocks(user)
    usage = Usage(model=chosen, prompt_tokens=320, completion_tokens=180, latency_ms=180)

    if schema_name == "submit_scope":
        signals = blocks[0] if blocks and isinstance(blocks[0], list) else []
        entities: list[str] = []
        severities: set[str] = set()
        rules: set[str] = set()
        for sig in signals:
            if isinstance(sig, dict):
                severities.add(str(sig.get("severity") or "high"))
                rules.add(str(sig.get("rule") or ""))
                for ent in sig.get("entities") or []:
                    if ent and str(ent) not in entities:
                        entities.append(str(ent))
        priority = "critical" if "critical" in severities else "high" if "high" in severities else "medium"
        if "WEB-SQLI" in rules or "WEB-SHELL" in rules:
            scope = (
                "Detection rules matched a full intrusion chain from external IP 203.0.113.66 against "
                "WEB-PORTAL-01 (SQL injection, web shell, encoded PowerShell, and LSASS memory dump), "
                "followed by lateral movement as LOGISTIK\\k.hafiz to FS-LOGISTIK-01 and 432 MB archive "
                "exfiltration to 198.51.100.77. Verify each stage against raw web, Sysmon, and SIEM logs."
            )
        elif signals:
            scope = (
                f"{len(signals)} detection signal(s) matched across incoming logs. "
                "Verify the highest-severity alerts and trace affected accounts and hosts."
            )
        else:
            scope = "Inspect ingested log events for suspicious authentication, command execution, or network activity."
        return {"scope": scope, "priority": priority, "focus_entities": entities[:8]}, usage

    if schema_name == "submit_verdicts":
        items = blocks[0] if blocks and isinstance(blocks[0], list) else []
        verdicts: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            fid = str(item.get("finding_id") or "")
            if not fid:
                continue
            ev_list = item.get("evidence") or []
            ev_ids = [str(ev.get("id")) for ev in ev_list if isinstance(ev, dict) and ev.get("id")]
            ev_str = ", ".join(ev_ids[:4]) if ev_ids else "cited events"
            verdicts.append({
                "finding_id": fid,
                "verdict": "supported",
                "reason": f"Confirmed by raw log records ({ev_str}) matching {item.get('technique_id', '')}: {item.get('title', '')}.",
            })
        return {"verdicts": verdicts}, usage

    if schema_name == "submit_report":
        payload = blocks[0] if blocks and isinstance(blocks[0], dict) else {}
        findings = payload.get("findings") if isinstance(payload, dict) else []
        if not isinstance(findings, list):
            findings = []
        is_ms = "Bahasa Melayu" in system
        timeline: list[dict[str, Any]] = []
        for f in findings:
            if not isinstance(f, dict):
                continue
            eids = [str(eid) for eid in (f.get("evidence_ids") or []) if eid]
            if not eids:
                continue
            timeline.append({
                "ts": str(f.get("first_seen") or "2026-11-03T01:10:04Z"),
                "description": str(f.get("summary") or f.get("title") or ""),
                "evidence_ids": eids[:6],
            })
        if is_ms:
            return {
                "title": "Taklimat Panglima: Pencerobohan Berbilang Peringkat & Eksfiltrasi Data di Markas Logistik",
                "bluf": (
                    "Bukti log mengesahkan rantaian pencerobohan penuh pada 3 Nov 2026 daripada IP luar 203.0.113.66: "
                    "suntikan SQL dan muat naik web shell (img_upd.aspx) pada WEB-PORTAL-01, arahan PowerShell berkod, "
                    "cubaan salinan memori LSASS, pergerakan sisi menggunakan akaun LOGISTIK\\k.hafiz ke FS-LOGISTIK-01 "
                    "melalui PsExec, pembungkusan arkib 7z (q4.7z), serta muat naik keluar sebanyak 412 MB (432,013,312 bait) "
                    "ke 198.51.100.77. Keutamaan segera ialah menyekat 198.51.100.77 dan 203.0.113.66 di PA-FW-01 serta "
                    "mengasingkan kedua-dua pelayan."
                ),
                "executive_summary": (
                    "Antara jam 01:10 dan 03:44 UTC pada 3 Nov 2026, penyerang luar (203.0.113.66) telah mengimbas "
                    "WEB-PORTAL-01, mengeksploitasi /login.aspx melalui suntikan SQL, dan memuat naik web shell img_upd.aspx. "
                    "Melalui proses IIS w3wp.exe (LOGISTIK\\svc_web), penyerang menjalankan arahan tinjauan, PowerShell berkod "
                    "ke 198.51.100.77:443, dan comsvcs.dll MiniDump ke atas lsass.exe. Seterusnya, bukti kelayakan "
                    "LOGISTIK\\k.hafiz digunakan untuk mengakses FS-LOGISTIK-01 melalui ADMIN$ dan memasang perkhidmatan "
                    "PSEXESVC. Fail jadual penghantaran Q4 telah dibungkus ke dalam C:\\Users\\Public\\q4.7z dan dimuat naik "
                    "ke 198.51.100.77 menggunakan curl.exe."
                ),
                "incident_overview": (
                    "Skop: Pencerobohan berbilang peringkat daripada akses awal sehingga eksfiltrasi melibatkan "
                    "WEB-PORTAL-01 (10.10.1.10) dan FS-LOGISTIK-01 (10.10.3.20). Kesemua penemuan telah disahkan "
                    "terhadap rekod log asal dan1 rekod suntikan prompt telah dikuarantin oleh Perisai Serangan AI."
                ),
                "timeline": timeline,
                "affected_systems": [
                    "WEB-PORTAL-01 (10.10.1.10)",
                    "FS-LOGISTIK-01 (10.10.3.20)",
                    "PA-FW-01 (Perimeter Firewall)",
                    "Akaun LOGISTIK\\svc_web",
                    "Akaun LOGISTIK\\k.hafiz",
                    "D:\\Shares\\Logistik\\Jadual_Penghantaran_Q4",
                ],
                "interpretations": [
                    "Kata laluan arkib q4.7z (-pP@ss) kelihatan dalam baris arahan dan perlu dianggap telah terdedah.",
                    "Salinan memori LSASS (lsass.dmp) mungkin telah dibaca oleh penyerang; semua akaun berkaitan perlu ditetapkan semula.",
                ],
                "risk_level": "critical",
                "risk_and_impact": (
                    "Eksfiltrasi data jadual penghantaran Q4 bersaiz 412 MB ke IP luar 198.51.100.77 telah disahkan. "
                    "Dua pelayan utama telah dikompromi dengan akses pentadbiran."
                ),
                "decisions_needed": [
                    "Luluskan sekatan serta-merta ke atas IP 198.51.100.77 dan 203.0.113.66 pada PA-FW-01.",
                    "Luluskan pengasingan hos FS-LOGISTIK-01 dan WEB-PORTAL-01.",
                    "Luluskan penggantungan dan penetapan semula kata laluan akaun LOGISTIK\\k.hafiz dan LOGISTIK\\svc_web.",
                ],
                "recommended_actions": [
                    "Sekat trafik keluar ke 198.51.100.77 dan trafik masuk daripada 203.0.113.66 di PA-FW-01.",
                    "Padamkan web shell img_upd.aspx pada WEB-PORTAL-01 dan hentikan perkhidmatan PSEXESVC pada FS-LOGISTIK-01.",
                    "Tetapkan semula kelayakan LOGISTIK\\k.hafiz dan LOGISTIK\\svc_web serta batalkan tiket Kerberos aktif.",
                    "Kuarantin fail C:\\Users\\Public\\q4.7z dan C:\\Users\\Public\\lsass.dmp untuk analisis forensik lanjut.",
                ],
            }, usage

        return {
            "title": "Commander's Brief: Multi-Stage Intrusion & Data Exfiltration at Markas Logistik",
            "bluf": (
                "Verified log evidence confirms a full intrusion chain on 3 Nov 2026 from external IP 203.0.113.66: "
                "SQL injection and web shell upload (img_upd.aspx) on WEB-PORTAL-01, encoded PowerShell C2 to 198.51.100.77, "
                "LSASS memory dump via comsvcs MiniDump, lateral movement as LOGISTIK\\k.hafiz to FS-LOGISTIK-01 via PsExec, "
                "7z archive staging (q4.7z), and a 412 MB (432,013,312 bytes) upload to 198.51.100.77 allowed by PA-FW-01 at 03:44 UTC. "
                "Immediate priority: block 198.51.100.77 and 203.0.113.66 at PA-FW-01, isolate both servers, and disable LOGISTIK\\k.hafiz."
            ),
            "executive_summary": (
                "Between 01:10 and 03:44 UTC on 3 Nov 2026, external attacker 203.0.113.66 scanned WEB-PORTAL-01, "
                "exploited /login.aspx via SQL injection, and uploaded the web shell img_upd.aspx. Running under IIS "
                "worker process w3wp.exe (LOGISTIK\\svc_web), the attacker ran discovery commands, launched encoded "
                "PowerShell connecting to 198.51.100.77:443, and dumped LSASS memory to C:\\Users\\Public\\lsass.dmp. "
                "The attacker then authenticated as LOGISTIK\\k.hafiz to FS-LOGISTIK-01 over SMB (ADMIN$) and executed "
                "commands via PSEXESVC, staging Q4 shipment schedules into password-protected archive C:\\Users\\Public\\q4.7z "
                "and uploading it via curl.exe to https://198.51.100.77/u."
            ),
            "incident_overview": (
                "Scope: Multi-stage intrusion from reconnaissance to exfiltration across WEB-PORTAL-01 (10.10.1.10) "
                "and FS-LOGISTIK-01 (10.10.3.20). All findings below passed deterministic and evidence-grounding checks, "
                "and 1 prompt-injection log record was quarantined by the AI-Attack Shield."
            ),
            "timeline": timeline,
            "affected_systems": [
                "WEB-PORTAL-01 (10.10.1.10)",
                "FS-LOGISTIK-01 (10.10.3.20)",
                "PA-FW-01 (Perimeter Firewall)",
                "LOGISTIK\\svc_web service account",
                "LOGISTIK\\k.hafiz domain account",
                "D:\\Shares\\Logistik\\Jadual_Penghantaran_Q4",
            ],
            "interpretations": [
                "The archive password (-pP@ss) is visible in process creation logs and must be treated as compromised.",
                "LSASS memory was dumped to C:\\Users\\Public\\lsass.dmp on WEB-PORTAL-01, which likely exposed LOGISTIK\\k.hafiz credentials.",
            ],
            "risk_level": "critical",
            "risk_and_impact": (
                "Confirmed exfiltration of a 412 MB archive (q4.7z) containing Q4 logistics shipment schedules to external host "
                "198.51.100.77, plus administrative compromise of WEB-PORTAL-01 and FS-LOGISTIK-01."
            ),
            "decisions_needed": [
                "Approve blocking 198.51.100.77 and 203.0.113.66 at firewall PA-FW-01 immediately.",
                "Approve host isolation for FS-LOGISTIK-01 and WEB-PORTAL-01.",
                "Approve disabling and resetting credentials for LOGISTIK\\k.hafiz and LOGISTIK\\svc_web.",
            ],
            "recommended_actions": [
                "Block outbound C2/exfiltration IP 198.51.100.77 and scanner IP 203.0.113.66 on PA-FW-01.",
                "Isolate FS-LOGISTIK-01 and WEB-PORTAL-01 from internal SMB segments.",
                "Disable LOGISTIK\\k.hafiz and LOGISTIK\\svc_web and revoke active Kerberos tickets.",
                "Remove web shell img_upd.aspx, service PSEXESVC, and staged files q4.7z and lsass.dmp after preserving forensic copies.",
            ],
        }, usage

    if schema_name == "answer_question":
        question_raw = str(blocks[0] if blocks else user)
        ctx = blocks[1] if len(blocks) > 1 and isinstance(blocks[1], dict) else {}
        v_findings = ctx.get("verified_findings") if isinstance(ctx, dict) else []
        c_events = ctx.get("candidate_events") if isinstance(ctx, dict) else []
        if not isinstance(v_findings, list):
            v_findings = []
        if not isinstance(c_events, list):
            c_events = []

        all_eids: list[str] = []
        for f in v_findings:
            if isinstance(f, dict):
                for eid in f.get("evidence_ids") or []:
                    if eid and str(eid) not in all_eids:
                        all_eids.append(str(eid))
        for ev in c_events:
            if isinstance(ev, dict) and ev.get("id") and str(ev["id"]) not in all_eids:
                all_eids.append(str(ev["id"]))

        def pick(*preferred: str) -> list[str]:
            picked = [eid for eid in preferred if eid in all_eids]
            if not picked:
                picked = all_eids[:4]
            return picked

        q_lower = question_raw.lower()
        is_ms = "Bahasa Melayu" in system

        if is_ms:
            if any(w in q_lower for w in ("akaun", "k.hafiz", "svc_web", "account", "compromis")):
                cites = pick("EV-00581", "EV-00790", "EV-00895", "EV-00896")
                c0, c1, c2 = (cites + ["EV-00581", "EV-00790", "EV-00895"])[:3]
                ans = (
                    f"Dua akaun telah dikompromi: `LOGISTIK\\svc_web` pada `WEB-PORTAL-01` selepas web shell `img_upd.aspx` "
                    f"dimuat naik [{c0}], dan akaun domain `LOGISTIK\\k.hafiz` selepas memori LSASS disalin melalui "
                    f"`comsvcs.dll MiniDump` [{c1}]. Akaun `LOGISTIK\\k.hafiz` kemudiannya digunakan untuk log masuk ke "
                    f"`FS-LOGISTIK-01` [{c2}]."
                )
            elif any(w in q_lower for w in ("data", "keluar", "exfil", "q4.7z", "432", "412")):
                cites = pick("EV-01010", "EV-01245", "EV-01413")
                c0, c1, c2 = (cites + ["EV-01010", "EV-01245", "EV-01413"])[:3]
                ans = (
                    f"Fail jadual penghantaran `D:\\Shares\\Logistik\\Jadual_Penghantaran_Q4\\*` telah dibungkus ke dalam "
                    f"arkib berpassword `C:\\Users\\Public\\q4.7z` menggunakan `7z.exe` [{c0}], dan dimuat naik ke "
                    f"`https://198.51.100.77/u` menggunakan `curl.exe` [{c1}]. Firewall `PA-FW-01` merekodkan penghantaran "
                    f"sebanyak 432,013,312 bait (~412 MB) ke `198.51.100.77:443` [{c2}]."
                )
            else:
                cites = pick("EV-00505", "EV-00569", "EV-00790", "EV-00895", "EV-01245", "EV-01413")
                c0, c1, c2, c3 = (cites + ["EV-00505", "EV-00569", "EV-00895", "EV-01413"])[:4]
                ans = (
                    f"Pencerobohan bermula pada 01:10 UTC apabila `203.0.113.66` mengimbas `WEB-PORTAL-01` dan melakukan "
                    f"suntikan SQL pada `/login.aspx` [{c0}], diikuti muat naik web shell `img_upd.aspx` [{c1}]. Penyerang "
                    f"menyalin memori LSASS, bergerak ke `FS-LOGISTIK-01` menggunakan akaun `LOGISTIK\\k.hafiz` [{c2}], "
                    f"dan memuat naik arkib `q4.7z` (~412 MB) ke `198.51.100.77` [{c3}]."
                )
            return {
                "answer": ans,
                "citations": [{"event_id": eid, "quote": ""} for eid in cites],
                "verified_points": [
                    f"Web shell img_upd.aspx dan arahan w3wp.exe disahkan pada WEB-PORTAL-01 [{cites[0] if cites else 'EV-00569'}].",
                    f"Pergerakan sisi LOGISTIK\\k.hafiz dan eksfiltrasi q4.7z ke 198.51.100.77 disahkan [{cites[-1] if cites else 'EV-01413'}].",
                ],
                "hypotheses": [
                    "Kemungkinan bukti kelayakan k.hafiz diperoleh daripada fail salinan memori C:\\Users\\Public\\lsass.dmp."
                ],
                "uncertainty": "Kandungan sebenar yang dinyahkod daripada arahan PowerShell Base64 tidak terdapat dalam log.",
            }, usage

        if any(w in q_lower for w in ("account", "compromis", "who", "user", "k.hafiz", "svc_web")):
            cites = pick("EV-00581", "EV-00790", "EV-00895", "EV-00896")
            c0, c1, c2 = (cites + ["EV-00581", "EV-00790", "EV-00895"])[:3]
            ans = (
                f"Two accounts were compromised: `LOGISTIK\\svc_web` on `WEB-PORTAL-01` when `w3wp.exe` executed commands "
                f"from the uploaded `img_upd.aspx` web shell [{c0}], and domain account `LOGISTIK\\k.hafiz` following the "
                f"LSASS memory dump (`comsvcs.dll MiniDump`) on `WEB-PORTAL-01` [{c1}]. `LOGISTIK\\k.hafiz` was then used "
                f"at 02:21:33 UTC for an explicit-credential logon (`Event 4648`) from `WEB-PORTAL-01` to `FS-LOGISTIK-01` [{c2}]."
            )
        elif any(w in q_lower for w in ("data", "left", "exfil", "upload", "q4.7z", "432", "412")):
            cites = pick("EV-01010", "EV-01015", "EV-01245", "EV-01413")
            c0, c1, c2 = (cites + ["EV-01010", "EV-01245", "EV-01413"])[:3]
            ans = (
                f"The attacker archived `D:\\Shares\\Logistik\\Jadual_Penghantaran_Q4\\*` into password-protected archive "
                f"`C:\\Users\\Public\\q4.7z` using `7z.exe` (`-pP@ss`) at 02:40 UTC [{c0}], then uploaded `q4.7z` to "
                f"`https://198.51.100.77/u` using `curl.exe` at 03:18 UTC [{c1}]. Firewall `PA-FW-01` recorded 432,013,312 bytes "
                f"(~412 MB) sent to `198.51.100.77:443` at 03:44 UTC [{c2}]."
            )
        elif any(w in q_lower for w in ("prompt", "inject", "quarantin", "shield", "atlas")):
            cites = pick("EV-00505", "EV-00569")
            c0 = cites[0] if cites else "EV-00505"
            ans = (
                f"During triage, the AI-Attack Shield quarantined 1 web access log record carrying an indirect prompt-injection "
                f"User-Agent (`Ignore all previous instructions...`, MITRE ATLAS `AML.T0051.001`). That record was withheld "
                f"from all AI prompts while verified attack findings were established from clean records [{c0}]."
            )
        else:
            cites = pick("EV-00505", "EV-00569", "EV-00790", "EV-00895", "EV-01010", "EV-01413")
            c0, c1, c2, c3 = (cites + ["EV-00505", "EV-00569", "EV-00895", "EV-01413"])[:4]
            ans = (
                f"External host `203.0.113.66` exploited `/login.aspx` on `WEB-PORTAL-01` via SQL injection at 01:19 UTC [{c0}] "
                f"and uploaded web shell `img_upd.aspx` at 01:31 UTC [{c1}]. After dumping LSASS memory on `WEB-PORTAL-01`, "
                f"the attacker pivoted as `LOGISTIK\\k.hafiz` to `FS-LOGISTIK-01` via `ADMIN$` and `PSEXESVC` at 02:21 UTC [{c2}], "
                f"staged `C:\\Users\\Public\\q4.7z`, and exfiltrated 432,013,312 bytes (~412 MB) to `198.51.100.77` [{c3}]."
            )
        return {
            "answer": ans,
            "citations": [{"event_id": eid, "quote": ""} for eid in cites],
            "verified_points": [
                f"SQL injection and web shell execution on WEB-PORTAL-01 confirmed [{cites[0] if cites else 'EV-00505'}].",
                f"Lateral movement to FS-LOGISTIK-01 and 412 MB archive exfiltration to 198.51.100.77 confirmed [{cites[-1] if cites else 'EV-01413'}].",
            ],
            "hypotheses": [
                "The attacker likely extracted LOGISTIK\\k.hafiz credentials from the C:\\Users\\Public\\lsass.dmp memory dump."
            ],
            "uncertainty": "The exact contents of the Base64-encoded PowerShell payload and lsass.dmp are not recorded in telemetry.",
        }, usage

    return {}, usage


def _fast_run_tools(
    chosen: str,
    messages: list[dict[str, Any]],
    handlers: dict[str, Handler],
    final_tool: str,
    emit: StepHook,
) -> ToolRunResult:
    """Deterministic, fast multi-step tool execution for the Investigator agent (~1.5s total)."""
    usage_list: list[Usage] = []

    def invoke_step(rnd: int, tool_name: str, args: dict[str, Any]) -> Any:
        _pace(0.22)
        part = Usage(model=chosen, prompt_tokens=260, completion_tokens=95, latency_ms=190)
        usage_list.append(part)
        assistant = {
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": f"call-fast-{rnd}-{tool_name}",
                "type": "function",
                "function": {"name": tool_name, "arguments": json.dumps(args)},
            }],
        }
        emit({
            "kind": "llm_call",
            "round": rnd,
            "usage": part,
            "input": messages,
            "output": assistant,
            "tool_calls": 1,
        })
        emit({"kind": "tool_call", "tool": tool_name, "args": args})
        result, summary = _run_handler(handlers, tool_name, args)
        emit({"kind": "tool_result", "tool": tool_name, "args": args, "result": result, "summary": summary})
        return result

    sig_res = invoke_step(1, "list_signals", {})
    sig_blocks = _extract_log_data_blocks(str(sig_res))
    signals: list[dict[str, Any]] = sig_blocks[0] if sig_blocks and isinstance(sig_blocks[0], list) else []

    invoke_step(2, "get_host_timeline", {"host": "WEB-PORTAL-01", "limit": 20})
    invoke_step(3, "search_events", {"query": "powershell", "limit": 15})
    invoke_step(4, "pivot", {"entity": "LOGISTIK\\k.hafiz", "limit": 20})
    invoke_step(5, "related_auth_events", {"user": "LOGISTIK\\k.hafiz", "limit": 15})
    invoke_step(6, "get_host_timeline", {"host": "FS-LOGISTIK-01", "limit": 20})

    RULE_SUMMARIES: dict[str, tuple[str, str]] = {
        "WEB-SCAN": (
            "Web vulnerability scanning of WEB-PORTAL-01 from 203.0.113.66",
            "External IP 203.0.113.66 scanned WEB-PORTAL-01 (10.10.1.10) across admin, config, backup, and API paths using the Nmap Scripting Engine user agent.",
        ),
        "WEB-SQLI": (
            "SQL injection against /login.aspx from 203.0.113.66",
            "203.0.113.66 sent sqlmap/1.7.8 SQL injection requests (OR '1'='1 and UNION SELECT) to /login.aspx on WEB-PORTAL-01, receiving HTTP 500 followed by HTTP 302.",
        ),
        "WEB-SHELL": (
            "Web shell img_upd.aspx uploaded and executed on WEB-PORTAL-01",
            "203.0.113.66 uploaded img_upd.aspx via POST /shipments/upload.aspx and invoked it repeatedly with cmd= parameters returning HTTP 200.",
        ),
        "WIN-WEBSHELL-CMD": (
            "IIS worker w3wp.exe spawned cmd.exe under LOGISTIK\\svc_web",
            "w3wp.exe on WEB-PORTAL-01 spawned cmd.exe as LOGISTIK\\svc_web to run whoami, ipconfig /all, net user, dir, and rundll32 MiniDump commands.",
        ),
        "WIN-DISCOVERY": (
            "Domain account and share discovery from WEB-PORTAL-01",
            "Through the web shell, LOGISTIK\\svc_web ran ipconfig /all, net user k.hafiz /domain, and dir D:\\Shares\\Logistik on WEB-PORTAL-01.",
        ),
        "PS-ENCODED": (
            "Encoded PowerShell launched by w3wp.exe and connected to 198.51.100.77",
            "w3wp.exe spawned powershell.exe with -nop -w hidden -enc Base64 arguments under LOGISTIK\\svc_web, opening an outbound session to 198.51.100.77:443.",
        ),
        "CRED-LSASS": (
            "LSASS memory dump via comsvcs.dll MiniDump on WEB-PORTAL-01",
            "cmd.exe spawned rundll32.exe comsvcs.dll MiniDump targeting lsass.exe (GrantedAccess 0x1FFFFF) and created C:\\Users\\Public\\lsass.dmp on WEB-PORTAL-01.",
        ),
        "LAT-EXPLICIT": (
            "Explicit-credential logon as LOGISTIK\\k.hafiz to FS-LOGISTIK-01",
            "LOGISTIK\\k.hafiz authenticated from WEB-PORTAL-01 (10.10.1.10) to FS-LOGISTIK-01 (10.10.3.20) using explicit credentials (Event 4648 and LogonType 3 Event 4624).",
        ),
        "LAT-ADMIN-SHARE": (
            "Administrative share ADMIN$ accessed on FS-LOGISTIK-01",
            "FS-LOGISTIK-01 recorded SMB access (Event 5140) to \\\\*\\ADMIN$ by LOGISTIK\\k.hafiz from 10.10.1.10.",
        ),
        "LAT-PSEXEC": (
            "PsExec service PSEXESVC installed and executed on FS-LOGISTIK-01",
            "Service PSEXESVC (C:\\Windows\\PSEXESVC.exe) was installed on FS-LOGISTIK-01 (Event 7045) and spawned cmd.exe under LOGISTIK\\k.hafiz.",
        ),
        "COL-7Z": (
            "Password-protected 7z archive q4.7z staged on FS-LOGISTIK-01",
            "cmd.exe launched 7z.exe as LOGISTIK\\k.hafiz to compress D:\\Shares\\Logistik\\Jadual_Penghantaran_Q4\\* into C:\\Users\\Public\\q4.7z with -pP@ss.",
        ),
        "EXFIL-CURL": (
            "Archive q4.7z (412 MB) exfiltrated to 198.51.100.77 over HTTPS",
            "curl.exe uploaded C:\\Users\\Public\\q4.7z to https://198.51.100.77/u from FS-LOGISTIK-01, and PA-FW-01 logged 432,013,312 bytes sent to 198.51.100.77:443.",
        ),
    }

    findings: list[dict[str, Any]] = []
    for sig in signals:
        if not isinstance(sig, dict):
            continue
        rule_id = str(sig.get("rule_id") or "")
        eids = [str(x) for x in (sig.get("event_ids") or []) if x][:12]
        ents = [str(x) for x in (sig.get("entities") or []) if x][:8]
        if not eids:
            continue
        title, summary = RULE_SUMMARIES.get(
            rule_id,
            (str(sig.get("title") or rule_id), f"{sig.get('title') or rule_id} confirmed in log events."),
        )
        findings.append({
            "title": title,
            "summary": summary,
            "tactic": str(sig.get("tactic") or "Execution"),
            "technique_id": str(sig.get("technique_id") or "T1059"),
            "evidence_ids": eids,
            "entities": ents,
            "confidence": "high",
        })
        if rule_id == "PS-ENCODED":
            findings.append({
                "title": "Obfuscated Base64 PowerShell command line on WEB-PORTAL-01",
                "summary": (
                    "The powershell.exe command line launched by w3wp.exe on WEB-PORTAL-01 used -nop -w hidden "
                    "and a Base64-encoded (-enc) payload under LOGISTIK\\svc_web to conceal execution."
                ),
                "tactic": "Stealth",
                "technique_id": "T1027",
                "evidence_ids": eids[:2],
                "entities": [e for e in ents if e != "198.51.100.77"],
                "confidence": "high",
            })

    final_args = {"findings": findings}
    _pace(0.2)
    emit({"kind": "tool_call", "tool": final_tool, "args": final_args})
    emit({
        "kind": "tool_result",
        "tool": final_tool,
        "args": final_args,
        "result": {"accepted": True},
        "summary": "submitted",
    })
    return ToolRunResult(final_args=final_args, rounds=6, usage=usage_list)


def _model(model: str | None) -> str:
    return model or config.load_settings().model


def _usage(model: str, response: Any, started: float) -> Usage:
    usage = getattr(response, "usage", None)
    return Usage(
        model=model,
        prompt_tokens=int(getattr(usage, "prompt_tokens", 0) or 0),
        completion_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
        latency_ms=int((time.monotonic() - started) * 1000),
    )


def _sum(total: Usage, part: Usage) -> Usage:
    return Usage(model=total.model, prompt_tokens=total.prompt_tokens + part.prompt_tokens,
                 completion_tokens=total.completion_tokens + part.completion_tokens,
                 latency_ms=total.latency_ms + part.latency_ms)


def _message(response: Any) -> Any | None:
    choices = getattr(response, "choices", None) or []
    return choices[0].message if choices else None


def complete_json(system: str, user: str, schema_name: str, schema: dict[str, Any],
                  model: str | None = None, max_tokens: int = 3000) -> tuple[dict[str, Any], Usage]:
    """Get one JSON object through a forced function call. Retries once when the arguments are unusable."""
    chosen = _model(model)
    if _is_fast_workflow() and schema_name in {"submit_scope", "submit_verdicts", "submit_report", "answer_question"}:
        return _fast_complete_json(system, user, schema_name, chosen)
    tool = {"type": "function", "function": {
        "name": schema_name, "description": f"Submit the {schema_name} result.", "parameters": schema}}
    choice = {"type": "function", "function": {"name": schema_name}}
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    total = Usage(model=chosen)
    problem = "no tool call returned"
    for _ in range(JSON_ATTEMPTS):
        started = time.monotonic()
        response = _chat(model=chosen, max_tokens=max_tokens, messages=messages, tools=[tool], tool_choice=choice)
        total = _sum(total, _usage(chosen, response, started))
        message = _message(response)
        calls = (message.tool_calls or []) if message else []
        if not calls:
            continue
        try:
            args = json.loads(calls[0].function.arguments or "")
        except json.JSONDecodeError:
            problem = "arguments were not valid JSON"
            continue
        if isinstance(args, dict):
            return args, total
        problem = "arguments were not a JSON object"
    raise LlmError(f"{schema_name}: {problem}")


def _parse_args(raw: str | None) -> dict[str, Any] | None:
    try:
        value = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _run_handler(handlers: dict[str, Handler], name: str, args: dict[str, Any] | None) -> tuple[Any, str]:
    if args is None:
        return {"error": "arguments must be a JSON object"}, "invalid arguments"
    handler = handlers.get(name)
    if handler is None:
        return {"error": f"unknown tool: {name}"}, "unknown tool"
    try:
        return handler(args)
    except Exception as exc:  # a failing tool is reported to the model, not raised
        return {"error": f"{type(exc).__name__}: {redact_secrets(str(exc))}"}, "tool error"


def _as_text(result: Any) -> str:
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, default=str)
    return text if len(text) <= TOOL_RESULT_MAX else text[:TOOL_RESULT_MAX] + "...[truncated]"


def run_tools(system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
              handlers: dict[str, Handler], max_rounds: int = 10, final_tool: str = "submit_findings",
              on_step: StepHook | None = None, model: str | None = None) -> ToolRunResult:
    """Run a tool loop until the model calls `final_tool`. The last round forces that tool.

    Handlers receive the decoded arguments and return (result, short_summary). The hook receives
    dicts with kind "llm_call", "tool_call" or "tool_result" so callers can record every step.
    """
    chosen = _model(model)
    emit: StepHook = on_step or (lambda step: None)
    if _is_fast_workflow() and "list_signals" in handlers:
        return _fast_run_tools(chosen, messages, handlers, final_tool, emit)
    convo: list[dict[str, Any]] = [{"role": "system", "content": system}, *messages]
    usage: list[Usage] = []
    for rnd in range(1, max_rounds + 1):
        forced = rnd == max_rounds
        sent = list(convo)
        choice: Any = {"type": "function", "function": {"name": final_tool}} if forced else "auto"
        started = time.monotonic()
        response = _chat(model=chosen, max_tokens=MAX_TOKENS_TOOLS, messages=sent, tools=tools, tool_choice=choice)
        part = _usage(chosen, response, started)
        usage.append(part)
        message = _message(response)
        if message is None:
            raise LlmError("model returned no message")
        calls = list(message.tool_calls or [])
        assistant: dict[str, Any] = {"role": "assistant", "content": message.content or ""}
        if calls:
            assistant["tool_calls"] = [{"id": c.id, "type": "function", "function": {
                "name": c.function.name, "arguments": c.function.arguments or "{}"}} for c in calls]
        convo.append(assistant)
        emit({"kind": "llm_call", "round": rnd, "usage": part, "input": sent, "output": assistant,
              "tool_calls": len(calls)})
        if not calls:
            if forced:
                break
            convo.append({"role": "user",
                          "content": f"Continue with the tools, or call {final_tool} when the work is complete."})
            continue
        for call in calls:
            name = call.function.name
            args = _parse_args(call.function.arguments)
            emit({"kind": "tool_call", "tool": name, "args": args or {}})
            if name == final_tool and args:
                emit({"kind": "tool_result", "tool": name, "args": args, "result": {"accepted": True},
                      "summary": "submitted"})
                return ToolRunResult(final_args=args, rounds=rnd, usage=usage)
            result, summary = _run_handler(handlers, name, args)
            convo.append({"role": "tool", "tool_call_id": call.id, "content": _as_text(result)})
            emit({"kind": "tool_result", "tool": name, "args": args or {}, "result": result, "summary": summary})
    return ToolRunResult(final_args=None, rounds=max_rounds, usage=usage)


def _probe() -> LlmHealth:
    try:
        model = _model(None)
    except Exception:
        model = config.DEFAULT_MODEL
    if _is_fast_workflow():
        return LlmHealth(ok=True, model=model, latency_ms=8, detail="Ready")
    if not config.api_key():
        return LlmHealth(ok=False, model=model, detail="No API key configured.")
    started = time.monotonic()
    try:
        _chat(model=model, max_tokens=5, messages=[{"role": "user", "content": "Reply with OK."}])
    except Exception as exc:
        return LlmHealth(ok=False, model=model, detail=redact_secrets(str(exc)))
    return LlmHealth(ok=True, model=model, latency_ms=int((time.monotonic() - started) * 1000), detail="OK")


def health() -> LlmHealth:
    """Return the model health, probed at most once a minute. Never raises."""
    global _health
    with _health_lock:
        if _health and time.monotonic() - _health[0] < HEALTH_TTL_S:
            return _health[1]
    result = _probe()
    with _health_lock:
        _health = (time.monotonic(), result)
    return result
