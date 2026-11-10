"""Seed or reset the deterministic recorded HQ-breach demo case (CASE-2026-0001) and benchmark runs.

Usage:
    python scripts/seed_demo.py
"""

from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

PLATFORM_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = PLATFORM_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from saksi import benchmark, custody, planner, responses, store
from saksi.config import FIXTURES_DIR, data_dir


def seed_recorded_case(case_id: str = "CASE-2026-0001") -> Path:
    fixture_dir = FIXTURES_DIR / "recorded-hq-breach"
    if not fixture_dir.is_dir():
        raise FileNotFoundError(f"Fixture directory not found: {fixture_dir}")

    target_dir = data_dir() / "cases" / case_id
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(fixture_dir, target_dir)

    # Ensure case.json carries recorded_run metadata
    case_path = target_dir / "case.json"
    if case_path.exists():
        case_data = json.loads(case_path.read_text(encoding="utf-8"))
        case_data["id"] = case_id
        case_data["recorded_run"] = True
        case_data.setdefault("recorded_at", "2026-11-08T01:16:33Z")
        case_data.setdefault("recorded_model", "anthropic/claude-haiku-5.5")
        case_data.setdefault(
            "last_activity",
            {
                "ts": "2026-11-08T01:16:33Z",
                "summary": "EN & BM reports ready (13 verified findings); ledger sealed with ML-DSA-65",
            },
        )
        case_path.write_text(json.dumps(case_data, indent=2) + "\n", encoding="utf-8")

    # Ensure plans.json & plan.json exist
    planner.load_plans(case_id)

    # Refresh response proposal expiry dates so demo approvals never expire mid-pitch
    resp_path = target_dir / "responses.json"
    if resp_path.exists():
        raw_props = json.loads(resp_path.read_text(encoding="utf-8"))
        fresh_expiry = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for item in raw_props:
            item["status"] = "pending_approval"
            item["expires_at"] = fresh_expiry
            item["approved_by"] = None
            item["approved_at"] = None
            item["approved_mode"] = None
            item["rejected_by"] = None
            item["rejected_at"] = None
            item["executed_at"] = None
            item["executed_by"] = None
            item["rolled_back_at"] = None
            item["rolled_back_by"] = None
            item["execution_result"] = ""
            item["invalidated_reason"] = None
        resp_path.write_text(json.dumps(raw_props, indent=2) + "\n", encoding="utf-8")
    else:
        responses.load_proposals(case_id)

    # Re-seal the ledger with the local ML-DSA-65 key so custody verification & signature are 100% valid
    custody.seal(case_id)

    # Seed benchmark evaluations for both workflows
    benchmark.evaluate_case(case_id, workflow="autonomous_planner")
    benchmark.evaluate_case(case_id, workflow="fixed_baseline")
    return target_dir


if __name__ == "__main__":
    dest = seed_recorded_case()
    v = custody.verify("CASE-2026-0001")
    print(f"Seeded CASE-2026-0001 at {dest} (ledger ok={v.ok}, signature valid={v.signature.valid})")

