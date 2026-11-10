"""Sample Report for PDF tests, and a script that writes sample PDFs for visual review.

Usage (from development/):  .venv\\Scripts\\python.exe -m saksi.tests.sample_report <output-dir>
"""

from __future__ import annotations

import sys
from pathlib import Path

from saksi import custody
from saksi.models import CustodySummary, Report, ReportFinding, ReportTimelineItem

HASH_A = "9f2c4e7a1b6d8035c2e4f1a9b7d6c3e0a5f8b2d4c1e9a7b6d3f0c8e2a4b5d6f1"
HASH_B = "3ad81f0c6e2b9475a1d3c8e6f40b2a97d5c1e8f36a4b0d9c2e7f1a5b8d3c6e04"

_CONTENT = {
    "en": {
        "title": "Incident Report: Breach of Markas Logistik HQ (simulated)",
        "bluf": ("An external actor compromised the HQ web portal, used a web shell to dump domain "
                 "credentials and exfiltrated the Q4 delivery schedule. Isolate WEB-PORTAL-01 and "
                 "FS-LOGISTIK-01, reset the k.hafiz credentials and block 198.51.100.77 today."),
        "executive_summary": ("Between 03 Nov 2026 10:14 and 11:02 UTC, an external IP address moved from "
                              "web reconnaissance to data theft. Four of the five ATT&CK stages in this case "
                              "are supported by verified evidence."),
        "incident_overview": ("The portal at WEB-PORTAL-01 accepted SQL injection from 203.0.113.66. The "
                              "attacker then placed a web shell and ran encoded PowerShell under w3wp.exe. "
                              "Credentials were read from LSASS and reused against the file server."),
        "timeline": [
            ("2026-11-03T10:14:22Z", "SQL injection probes against /search on WEB-PORTAL-01.", ["EV-00412", "EV-00413"]),
            ("2026-11-03T10:31:05Z", "Web shell img_upd.aspx written and executed by w3wp.exe.", ["EV-00688"]),
            ("2026-11-03T10:47:40Z", "LSASS memory dumped with comsvcs.dll MiniDump.", ["EV-00905", "EV-00906"]),
            ("2026-11-03T11:02:18Z", "412 MB uploaded over HTTPS to 198.51.100.77.", ["EV-01987"]),
        ],
        "affected_systems": [
            "WEB-PORTAL-01 (10.10.1.10): web server, initial access point",
            "FS-LOGISTIK-01 (10.10.3.20): file share holding the delivery schedule",
            "DC-01 (10.10.0.5): domain controller, credentials exposed",
        ],
        "findings": [
            ReportFinding(finding_id="F-001", title="SQL injection on the public portal",
                          technique_id="T1190", technique_name="Exploit Public-Facing Application",
                          summary="Requests to /search carry SQL metacharacters and return HTTP 500 responses.",
                          evidence_ids=["EV-00412", "EV-00413"]),
            ReportFinding(finding_id="F-002", title="LSASS memory dumped",
                          technique_id="T1003.001", technique_name="OS Credential Dumping: LSASS Memory",
                          summary="comsvcs.dll MiniDump was invoked against lsass.exe by a web-shell child process.",
                          evidence_ids=["EV-00905", "EV-00906"]),
        ],
        "interpretations": [
            "The LSASS access followed by a logon as k.hafiz to FS-LOGISTIK-01 suggests lateral movement. "
            "This is not yet verified against the domain controller logs.",
        ],
        "risk_and_impact": ("Confidential delivery schedules for Q4 may be in the hands of a third party. "
                            "Operations are not disrupted at present, but the domain credentials must be treated as compromised."),
        "decisions_needed": [
            "Approve isolation of WEB-PORTAL-01 and FS-LOGISTIK-01 from the corporate network.",
            "Decide whether the incident is reported to the national CERT within the required window.",
        ],
        "recommended_actions": [
            "Remove img_upd.aspx and rebuild WEB-PORTAL-01 from a known-good image.",
            "Reset passwords for k.hafiz and svc_web, and revoke active Kerberos tickets.",
            "Block 198.51.100.77 at the perimeter firewall and review proxy logs for other hosts.",
        ],
    },
    "ms": {
        "title": "Laporan Insiden: Pencerobohan Ibu Pejabat Markas Logistik (simulasi)",
        "bluf": ("Pihak luar menceroboh portal web ibu pejabat, menggunakan web shell untuk mengambil kelayakan "
                 "domain dan membocorkan jadual penghantaran Q4. Pencilkan WEB-PORTAL-01 dan FS-LOGISTIK-01, "
                 "tetapkan semula kelayakan k.hafiz dan sekat 198.51.100.77 hari ini."),
        "executive_summary": ("Antara 03 Nov 2026 pukul 10:14 dan 11:02 UTC, alamat IP luar beralih daripada "
                              "peninjauan web kepada kecurian data. Empat daripada lima peringkat ATT&CK disokong "
                              "oleh bukti yang disahkan."),
        "incident_overview": ("Portal WEB-PORTAL-01 menerima suntikan SQL daripada 203.0.113.66. Penyerang kemudian "
                              "memasang web shell dan menjalankan PowerShell yang dikodkan di bawah w3wp.exe."),
        "timeline": [
            ("2026-11-03T10:14:22Z", "Percubaan suntikan SQL ke atas /search pada WEB-PORTAL-01.", ["EV-00412", "EV-00413"]),
            ("2026-11-03T10:31:05Z", "Web shell img_upd.aspx ditulis dan dijalankan oleh w3wp.exe.", ["EV-00688"]),
            ("2026-11-03T10:47:40Z", "Memori LSASS didump menggunakan comsvcs.dll MiniDump.", ["EV-00905", "EV-00906"]),
            ("2026-11-03T11:02:18Z", "412 MB dimuat naik melalui HTTPS ke 198.51.100.77.", ["EV-01987"]),
        ],
        "affected_systems": [
            "WEB-PORTAL-01 (10.10.1.10): pelayan web, titik capaian awal",
            "FS-LOGISTIK-01 (10.10.3.20): pelayan fail yang memuat jadual penghantaran",
            "DC-01 (10.10.0.5): pengawal domain, kelayakan terdedah",
        ],
        "findings": [
            ReportFinding(finding_id="F-001", title="Suntikan SQL pada portal awam",
                          technique_id="T1190", technique_name="Eksploitasi Aplikasi Menghadap Awam",
                          summary="Permintaan ke /search mengandungi aksara SQL dan memulangkan respons HTTP 500.",
                          evidence_ids=["EV-00412", "EV-00413"]),
        ],
        "interpretations": [
            "Akses LSASS diikuti log masuk sebagai k.hafiz ke FS-LOGISTIK-01 mencadangkan pergerakan sisi. "
            "Ini belum disahkan dengan log pengawal domain.",
        ],
        "risk_and_impact": ("Jadual penghantaran Q4 yang sulit mungkin berada di tangan pihak ketiga. "
                            "Operasi belum terjejas, tetapi kelayakan domain mesti dianggap telah terdedah."),
        "decisions_needed": [
            "Luluskan pengasingan WEB-PORTAL-01 dan FS-LOGISTIK-01 daripada rangkaian korporat.",
        ],
        "recommended_actions": [
            "Buang img_upd.aspx dan bina semula WEB-PORTAL-01 daripada imej yang diketahui selamat.",
            "Tetapkan semula kata laluan k.hafiz dan svc_web.",
        ],
    },
}


def sample_report(lang: str = "en", classification: str = "SULIT") -> Report:
    """Return a complete, self-consistent sample Report in the given language."""
    content = _CONTENT[lang]
    data = {
        "case_id": "CASE-2026-0001",
        "lang": lang,
        "classification": classification,
        "generated_at": "2026-11-08T09:00:00Z",
        "model": "anthropic/claude-haiku-5.5",
        "title": content["title"],
        "bluf": content["bluf"],
        "executive_summary": content["executive_summary"],
        "incident_overview": content["incident_overview"],
        "timeline": [ReportTimelineItem(ts=ts, description=text, evidence_ids=ids)
                     for ts, text, ids in content["timeline"]],
        "affected_systems": content["affected_systems"],
        "verified_findings": content["findings"],
        "interpretations": content["interpretations"],
        "risk_level": "critical",
        "risk_and_impact": content["risk_and_impact"],
        "decisions_needed": content["decisions_needed"],
        "recommended_actions": content["recommended_actions"],
        "custody": CustodySummary(entries=14, head_hash=HASH_B, chain_ok=True,
                                  signature_algorithm="ML-DSA-65 (FIPS 204)", signature_valid=True),
    }
    draft = Report(**data, report_hash="")
    report_hash = custody.canonical_hash(draft.model_dump(mode="json", exclude={"report_hash"}))
    return draft.model_copy(update={"report_hash": report_hash})


def main(out_dir: Path) -> list[Path]:
    """Write en and ms sample PDFs into out_dir and return their paths."""
    from saksi import report_pdf

    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for lang in ("en", "ms"):
        report = sample_report(lang)
        verify_url = f"http://127.0.0.1:8000/api/verify/report?case_id={report.case_id}&hash={report.report_hash}"
        target = out_dir / f"sample_report_{lang}.pdf"
        target.write_bytes(report_pdf.render_pdf(report, verify_url))
        written.append(target)
    return written


if __name__ == "__main__":
    for path in main(Path(sys.argv[1])):
        print(path)
