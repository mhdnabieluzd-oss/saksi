"""PDF rendering: structure, classification marking on every page, Malay and English, and the core-font fallback."""

from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

from saksi import report_pdf
from saksi.tests.sample_report import main, sample_report

VERIFY_URL = "http://testserver/api/verify/report?case_id=CASE-2026-0001&hash=abc"


def _page_count(pdf: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page[^s]", pdf))


@pytest.fixture
def written_text(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Record every string the renderer draws through its text gateway."""
    drawn: list[str] = []
    original = report_pdf._ReportPDF._t

    def record(self: report_pdf._ReportPDF, text: str) -> str:
        drawn.append(text)
        return original(self, text)

    monkeypatch.setattr(report_pdf._ReportPDF, "_t", record)
    return drawn


@pytest.mark.parametrize(("lang", "classification"), [("en", "SULIT"), ("ms", "RAHSIA")])
def test_renders_pdf_with_marking_on_every_page(lang: str, classification: str, written_text: list[str]) -> None:
    pdf = report_pdf.render_pdf(sample_report(lang, classification), VERIFY_URL)

    assert pdf.startswith(b"%PDF")
    pages = _page_count(pdf)
    assert pages >= 1
    # The classification is drawn once at the top and once at the bottom of each page.
    assert written_text.count(classification) == 2 * pages


def test_core_font_fallback_still_renders(monkeypatch: pytest.MonkeyPatch, written_text: list[str]) -> None:
    monkeypatch.setattr(report_pdf, "FONT_DIR", Path("__no_such_font_dir__"))
    pdf = report_pdf.render_pdf(sample_report("ms", "TERHAD"), VERIFY_URL)

    assert pdf.startswith(b"%PDF")
    assert written_text.count("TERHAD") == 2 * _page_count(pdf)


def test_sample_pdfs_written(tmp_path: Path) -> None:
    """Writes the en and ms sample PDFs to SAKSI_SAMPLE_PDF_DIR when that variable is set (for visual review)."""
    target = Path(os.environ.get("SAKSI_SAMPLE_PDF_DIR", tmp_path))
    written = main(target)
    assert [path.name for path in written] == ["sample_report_en.pdf", "sample_report_ms.pdf"]
    assert all(path.read_bytes().startswith(b"%PDF") for path in written)
