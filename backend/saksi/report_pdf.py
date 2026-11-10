"""Render a SAKSI Report to a classified, paginated A4 PDF with a verification QR code."""

from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path

import segno
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace

from saksi.models import Report

FONT_DIR = Path(r"C:\Windows\Fonts")
TTF_FILES = {
    "regular": "segoeui.ttf",
    "bold": "segoeuib.ttf",
    "mono": "consola.ttf",
    "mono_bold": "consolab.ttf",
}
MARGIN_MM = 18
TOP_MM = 24
BOTTOM_MM = 30
QR_MM = 35
KEEP_WITH_NEXT_MM = 35
INK = (28, 28, 30)
MUTED = (104, 104, 112)
ACCENT = (30, 64, 110)
RULE_COLOURS = {
    "TERHAD": (0, 96, 140),
    "SULIT": (176, 96, 0),
    "RAHSIA": (160, 24, 24),
    "RAHSIA BESAR": (110, 0, 0),
}

LABELS = {
    "en": {
        "header": "SAKSI \u00b7 AI Forensic Investigator",
        "case": "Case", "generated": "Generated", "page": "Page", "of": "of",
        "bluf": "Commander's Brief (BLUF)",
        "technique": "Technique", "evidence": "Evidence", "none": "None recorded.",
        "ai_note": "AI-generated interpretations. These are not verified facts and are not part of the verified findings.",
        "risk": "Risk level",
        "timeline_cols": ("Time (UTC)", "Description", "Evidence"),
        "entries": "Ledger entries", "chain": "Chain intact", "head": "Ledger head hash",
        "signature": "Signature", "sig_valid": "Valid", "sig_invalid": "Invalid", "sig_none": "Not sealed",
        "yes": "Yes", "no": "No",
        "report_hash": "Report hash (SHA-256)",
        "qr": "Scan to verify this report's integrity",
        "sections": {
            "executive_summary": "Executive Summary",
            "incident_overview": "Incident Overview",
            "timeline": "Attack Timeline",
            "affected_systems": "Affected Systems",
            "verified_findings": "Verified Findings",
            "interpretations": "AI Interpretations (not verified)",
            "risk": "Risk and Impact",
            "decisions": "Decisions Needed",
            "actions": "Recommended Actions",
            "custody": "Chain-of-Custody Summary",
        },
    },
    "ms": {
        "header": "SAKSI \u00b7 Penyiasat Forensik AI",
        "case": "Kes", "generated": "Dijana", "page": "Halaman", "of": "daripada",
        "bluf": "Ringkasan Komander (BLUF)",
        "technique": "Teknik", "evidence": "Bukti", "none": "Tiada rekod.",
        "ai_note": "Tafsiran dijana AI. Ini bukan fakta yang disahkan dan bukan sebahagian daripada penemuan disahkan.",
        "risk": "Tahap risiko",
        "timeline_cols": ("Masa (UTC)", "Keterangan", "Bukti"),
        "entries": "Entri lejar", "chain": "Rantaian utuh", "head": "Hash kepala lejar",
        "signature": "Tandatangan", "sig_valid": "Sah", "sig_invalid": "Tidak sah", "sig_none": "Belum dimeterai",
        "yes": "Ya", "no": "Tidak",
        "report_hash": "Hash laporan (SHA-256)",
        "qr": "Imbas untuk mengesahkan integriti laporan ini",
        "sections": {
            "executive_summary": "Ringkasan Eksekutif",
            "incident_overview": "Gambaran Insiden",
            "timeline": "Garis Masa Serangan",
            "affected_systems": "Sistem Terjejas",
            "verified_findings": "Penemuan Disahkan",
            "interpretations": "Tafsiran AI (belum disahkan)",
            "risk": "Risiko dan Kesan",
            "decisions": "Keputusan Diperlukan",
            "actions": "Tindakan Disyorkan",
            "custody": "Ringkasan Rantaian Jagaan",
        },
    },
}


def _fmt_ts(ts: str) -> str:
    try:
        moment = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return ts
    return moment.strftime("%Y-%m-%d %H:%M:%S UTC")


class _ReportPDF(FPDF):
    def __init__(self, report: Report, verify_url: str) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        self.report = report
        self.verify_url = verify_url
        self.labels = LABELS[report.lang]
        self.rule = RULE_COLOURS.get(report.classification, MUTED)
        self._register_fonts()
        self.set_margins(MARGIN_MM, TOP_MM, MARGIN_MM)
        self.set_auto_page_break(True, BOTTOM_MM)
        self.alias_nb_pages()
        self.set_title(f"{report.title} ({report.case_id})")
        self.set_author("SAKSI")

    # ------------------------------------------------------------ fonts and text
    def _register_fonts(self) -> None:
        files = {key: FONT_DIR / name for key, name in TTF_FILES.items()}
        if all(path.exists() for path in files.values()):
            self.add_font("SAKSI", "", str(files["regular"]))
            self.add_font("SAKSI", "B", str(files["bold"]))
            self.add_font("SAKSIMono", "", str(files["mono"]))
            self.add_font("SAKSIMono", "B", str(files["mono_bold"]))
            self.family, self.mono, self.bullet = "SAKSI", "SAKSIMono", "\u2022"
            self.unicode = True
        else:
            self.family, self.mono, self.bullet = "Helvetica", "Courier", "-"
            self.unicode = False

    def _t(self, text: str) -> str:
        """Return text the active font can draw: core fonts only cover latin-1."""
        if self.unicode:
            return text
        return text.encode("latin-1", "replace").decode("latin-1")

    def _text_width(self, extra: float = 0) -> float:
        return self.w - self.l_margin - self.r_margin - extra

    def _ensure_space(self, mm: float) -> None:
        if self.get_y() + mm > self.h - self.b_margin:
            self.add_page()

    def _line(self, text: str, *, size: float = 9.5, style: str = "", colour=INK,
              family: str | None = None, height: float = 5.2, width: float = 0) -> None:
        self.set_font(family or self.family, style, size)
        self.set_text_color(*colour)
        self.multi_cell(width, height, self._t(text), align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def _muted(self, text: str) -> None:
        self._line(text, size=8.5, colour=MUTED)

    def _mono(self, text: str, size: float = 8.5, width: float = 0) -> None:
        self._line(text, size=size, family=self.mono, colour=INK, height=4.6, width=width)

    def _heading(self, title: str) -> None:
        self._ensure_space(KEEP_WITH_NEXT_MM)
        self.ln(4)
        self._line(title, size=12, style="B", colour=ACCENT, height=6)
        y = self.get_y() + 0.5
        self.set_draw_color(*ACCENT)
        self.set_line_width(0.2)
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.set_y(y + 3)

    def _body(self, text: str) -> None:
        self._line(text or self.labels["none"])

    def _bullets(self, items: list[str], numbered: bool = False) -> None:
        if not items:
            self._body("")
            return
        for index, item in enumerate(items, start=1):
            marker = f"{index}." if numbered else self.bullet
            self._line(f"{marker}  {item}", width=self._text_width(), height=5.2)

    # ------------------------------------------------------------ page furniture
    def header(self) -> None:
        marking_colour = self.rule
        self.set_font(self.family, "B", 8)
        self.set_text_color(*marking_colour)
        self.set_xy(self.l_margin, 6.5)
        self.cell(self._text_width(), 4, self._t(self.report.classification), align="C",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*marking_colour)
        self.set_line_width(0.2)
        self.line(self.l_margin, 12.5, self.w - self.r_margin, 12.5)
        self.set_font(self.family, "", 7.5)
        self.set_text_color(*MUTED)
        self.set_xy(self.l_margin, 15)
        generated = f"{self.labels['generated']} {_fmt_ts(self.report.generated_at)}"
        right = f"{self.labels['case']} {self.report.case_id} \u00b7 {generated}"
        self.cell(self._text_width(70), 4, self._t(self.labels["header"]), new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(70, 4, self._t(right), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_xy(self.l_margin, self.t_margin)

    def footer(self) -> None:
        x, y = self.get_x(), self.get_y()
        self.set_font(self.family, "", 7.5)
        self.set_text_color(*MUTED)
        self.set_xy(self.l_margin, self.h - 22)
        page = f"{self.labels['page']} {self.page_no()} {self.labels['of']} {{nb}}"
        self.cell(self._text_width(), 4, self._t(page), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*self.rule)
        self.set_line_width(0.2)
        self.line(self.l_margin, self.h - 17.5, self.w - self.r_margin, self.h - 17.5)
        self.set_font(self.family, "B", 8)
        self.set_text_color(*self.rule)
        self.set_xy(self.l_margin, self.h - 14)
        self.cell(self._text_width(), 4, self._t(self.report.classification), align="C")
        self.set_xy(x, y)

    # ------------------------------------------------------------ blocks
    def _brief(self) -> None:
        report = self.report
        self._ensure_space(60)
        x, top = self.l_margin, self.get_y()
        self.set_xy(x + 4, top + 4)
        self._line(self.labels["bluf"].upper(), size=8, style="B", colour=ACCENT, height=4.5,
                   width=self._text_width(8))
        self.set_x(x + 4)
        self._line(report.bluf, size=10.5, height=5.6, width=self._text_width(8))
        bottom = self.get_y() + 3
        self.set_draw_color(*ACCENT)
        self.set_line_width(0.35)
        self.rect(x, top, self._text_width(), bottom - top, style="D")
        self.set_y(bottom + 6)

    def _timeline(self) -> None:
        report = self.report
        if not report.timeline:
            self._body("")
            return
        mono = FontFace(family=self.mono, size_pt=8)
        headings = FontFace(emphasis="BOLD", fill_color=(236, 238, 242), color=INK)
        widths = (34, self._text_width() - 34 - 42, 42)
        self.set_font(self.family, "", 8.5)
        with self.table(col_widths=widths, headings_style=headings, line_height=4.8,
                        borders_layout="HORIZONTAL_LINES", padding=1.6, text_align="LEFT") as table:
            head = table.row()
            for label in self.labels["timeline_cols"]:
                head.cell(self._t(label))
            for item in report.timeline:
                row = table.row()
                row.cell(_fmt_ts(item.ts))
                row.cell(self._t(item.description))
                row.cell(", ".join(item.evidence_ids) or "-", style=mono)

    def _findings(self) -> None:
        labels = self.labels
        if not self.report.verified_findings:
            self._body("")
            return
        for finding in self.report.verified_findings:
            self._ensure_space(KEEP_WITH_NEXT_MM)
            self._line(f"{finding.finding_id}  {finding.title}", style="B", size=10, height=5.6)
            self._muted(f"{labels['technique']}: {finding.technique_id} \u00b7 {finding.technique_name}")
            self._line(finding.summary)
            self._mono(f"{labels['evidence']}: {', '.join(finding.evidence_ids) or '-'}")
            self.ln(2.5)

    def _custody(self) -> None:
        report, labels = self.report, self.labels
        custody = report.custody
        if custody.signature_valid is None:
            signature = labels["sig_none"]
        else:
            signature = labels["sig_valid"] if custody.signature_valid else labels["sig_invalid"]
        self._ensure_space(QR_MM + 30)
        start = self.get_y()
        text_width = self._text_width(QR_MM + 10)
        self._line(f"{labels['entries']}: {custody.entries}", width=text_width)
        self._line(f"{labels['chain']}: {labels['yes'] if custody.chain_ok else labels['no']}", width=text_width)
        self._line(f"{labels['signature']}: {custody.signature_algorithm} \u2014 {signature}", width=text_width)
        self._muted(labels["head"])
        self._mono(custody.head_hash, width=text_width)
        self.ln(1.5)
        self._muted(labels["report_hash"])
        self._mono(report.report_hash, width=text_width)
        text_bottom = self.get_y()

        qr_x = self.w - self.r_margin - QR_MM
        self.set_xy(qr_x, start)
        self.image(self._qr_png(self.verify_url), x=qr_x, y=start, w=QR_MM)
        self.set_xy(qr_x - 4, start + QR_MM + 1.5)
        self.set_font(self.family, "", 7)
        self.set_text_color(*MUTED)
        self.multi_cell(QR_MM + 4, 3.4, self._t(labels["qr"]), align="C",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_y(max(text_bottom, self.get_y()) + 2)

    @staticmethod
    def _qr_png(url: str) -> io.BytesIO:
        buffer = io.BytesIO()
        segno.make(url, error="m").save(buffer, kind="png", scale=6, border=2)
        buffer.seek(0)
        return buffer

    # ------------------------------------------------------------ assembly
    def build(self) -> None:
        report, labels, sections = self.report, self.labels, self.labels["sections"]
        self.add_page()
        self._line(report.title, size=18, style="B", height=8)
        self._muted(f"{labels['case']} {report.case_id} \u00b7 {labels['risk']}: {report.risk_level.upper()}")
        self.ln(4)
        self._brief()

        self._heading(sections["executive_summary"])
        self._body(report.executive_summary)
        self._heading(sections["incident_overview"])
        self._body(report.incident_overview)
        self._heading(sections["timeline"])
        self._timeline()
        self._heading(sections["affected_systems"])
        self._bullets(report.affected_systems)
        self._heading(sections["verified_findings"])
        self._findings()
        self._heading(sections["interpretations"])
        self._muted(labels["ai_note"])
        self.ln(1)
        self._bullets(report.interpretations)
        self._heading(sections["risk"])
        self._line(f"{labels['risk']}: {report.risk_level.upper()}", style="B")
        self._body(report.risk_and_impact)
        self._heading(sections["decisions"])
        self._bullets(report.decisions_needed, numbered=True)
        self._heading(sections["actions"])
        self._bullets(report.recommended_actions, numbered=True)
        self._heading(sections["custody"])
        self._custody()


def render_pdf(report: Report, verify_url: str) -> bytes:
    """Return the report as an A4 PDF: classification marking top and bottom, Commander's Brief, sections, custody and QR."""
    pdf = _ReportPDF(report, verify_url)
    pdf.build()
    return bytes(pdf.output())
