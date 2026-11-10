"""Capture 6-viewport screenshot matrix and verify zero horizontal overflow across all SAKSI routes."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

PLATFORM_DIR = Path(__file__).resolve().parents[1]
OUT_DIR = PLATFORM_DIR / "docs" / "screenshots"

VIEWPORTS = [
    ("390x844", 390, 844),
    ("768x1024", 768, 1024),
    ("1024x768", 1024, 768),
    ("1280x720", 1280, 720),
    ("1440x900", 1440, 900),
    ("1920x1080", 1920, 1080),
]

PRIMARY_ROUTES = [
    ("01-landing", "/"),
    ("02-command-centre", "/app/command-centre"),
    ("03-investigations", "/app/investigations"),
    ("04-workspace", "/app/cases/CASE-2026-0001"),
    ("05-agent-operations", "/app/cases/CASE-2026-0001/agents"),
    ("06-evidence", "/app/cases/CASE-2026-0001/evidence"),
    ("07-replay", "/app/cases/CASE-2026-0001/replay"),
    ("08-tanya", "/app/cases/CASE-2026-0001/tanya"),
    ("09-reports", "/app/cases/CASE-2026-0001/reports"),
    ("10-benchmarks", "/app/benchmarks"),
    ("11-settings", "/app/settings"),
]


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    overflow_failures: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 1. Capture full 11-route suite at 1920x1080 and 1440x900, and core routes across all 6 viewports
        for vp_label, width, height in VIEWPORTS:
            context = browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()
            routes = PRIMARY_ROUTES if vp_label in ("1920x1080", "1440x900") else PRIMARY_ROUTES[:6]
            for route_slug, route_path in routes:
                url = f"{base_url}{route_path}"
                page.goto(url, wait_until="networkidle", timeout=30000)
                page.wait_for_timeout(350)
                metrics = page.evaluate(
                    "() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })"
                )
                overflow = metrics["scrollWidth"] - metrics["innerWidth"]
                filename = f"{route_slug}_{vp_label}.png"
                page.screenshot(path=str(OUT_DIR / filename), full_page=False)
                entry = {
                    "route": route_path,
                    "viewport": vp_label,
                    "scrollWidth": metrics["scrollWidth"],
                    "innerWidth": metrics["innerWidth"],
                    "overflowPx": overflow,
                    "screenshot": filename,
                }
                results.append(entry)
                if overflow > 2:
                    overflow_failures.append(f"{route_path} @ {vp_label}: scrollWidth={metrics['scrollWidth']} > innerWidth={metrics['innerWidth']}")
            context.close()
        browser.close()

    (OUT_DIR / "viewport_audit.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Captured {len(results)} screenshots into {OUT_DIR}")
    if overflow_failures:
        print("Overflow warnings:", overflow_failures)
        return 1
    print("Zero horizontal overflow across all audited viewports.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

