# SAKSI — Sistem Agen Keselamatan Siber Pintar

**SAKSI** is an **Agentic AI Cyber Incident Investigation & Analyst-Supervised Response Platform** built for **iHack 2026 (Category 2: AI × Cybersecurity)** and aligned with the Final Year Project of **Muhammad Nabiel Bin U'zied** (UiTM CS255 — Bachelor of Computer Science (Hons.) Computer Networks, Supervisor: **Dr. Mohsen Bin Mohamad Hata**).

> **Core Positioning:** *"Autonomous in investigation planning and evidence inquiry; analyst-supervised in defensive action."*

---

## Key Capabilities

1. **Four-Specialist Agent Pipeline (Triage → Investigator → Verifier → Reporter)**
   - **Triage (The Watchkeeper):** Screens raw heterogeneous telemetry (Sysmon, Windows Security, Suricata, DNS, Auth, CloudTrail), detects prompt-injection attempts via the Log Injection Shield, and assigns case priority.
   - **Investigator (The Pathfinder):** Builds an explicit, multi-step **Investigation Plan DAG** (`v1 → v2` adaptive re-planning) and queries evidence exclusively through the **Read-Only Tool Broker & Policy Gate** (`max_steps=8`, `max_tool_calls=12`).
   - **Verifier (The Evidence Auditor):** Runs a **5-check deterministic verification harness** on every candidate finding (`evidence_exists`, `hash_integrity`, `timestamp_consistency`, `attack_id_valid`, `entity_overlap`). Unsupported or contradicted findings are marked `rejected` and excluded from executive reports and response proposals.
   - **Reporter (The Briefing Officer):** Produces bilingual executive & technical incident reports (**English + Bahasa Melayu**) and seals the SHA-256 hash-chained **Chain-of-Custody Ledger** with a **NIST FIPS 204 ML-DSA-65 (Dilithium3)** post-quantum digital signature.
2. **Analyst-Supervised Response Queue (Never Autonomous)**
   - Response actions (`isolate_host`, `disable_account`, `block_ip`, `quarantine_file`) require explicit human approval bound to `payload_hash` and `basis_hash`.
   - Separate **Approve** and **Execute** stages:
     - **Simulate (Dry-Run):** Sets `status = "simulated"` (`SIMULATED — NO SYSTEM ACTION TAKEN`).
     - **Execute in Lab (LAB-LOCAL):** Requires typing the exact target hostname/account/IP and writes a reversible local lab state record (`data/cases/<id>/lab_state.json`).
3. **Cortex XSIAM-Inspired Tactical SOC Interface**
   - Designed for `1920×1080` and `1440×900` SOC monitors down to `390×844` mobile viewports with zero horizontal overflow, solid square `C`/`H`/`M`/`L` severity badges, real-count telemetry-to-response pipeline flow, and full `prefers-reduced-motion` support.

---

## Standalone Repository Layout

```text
saksi-platform/
├── README.md
├── .env.example
├── .gitignore
├── start.ps1                     # Windows one-command launcher
├── start.sh                      # POSIX one-command launcher
├── backend/                      # FastAPI + Python 3.11+ backend (package: saksi)
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── saksi/
│   │   ├── main.py               # Entrypoint: uvicorn saksi.main:app
│   │   ├── settings.py           # Environment & path configuration
│   │   ├── domain/               # Domain models, MITRE ATT&CK catalogue, entities
│   │   ├── ingest/               # Multi-source parsers & ECS-lite normaliser
│   │   ├── shield/               # Log prompt-injection scanner & sanitizer
│   │   ├── planning/             # Autonomous Plan DAG & Read-Only Tool Policy Gate
│   │   ├── agents/               # Triage, Investigator, Verifier, Reporter, Tanya
│   │   ├── evidence/             # Attack graph builder, SHA-256 + ML-DSA-65 custody
│   │   ├── response/             # Supervised response state machine & lab adapter
│   │   ├── reporting/            # Bilingual EN/BM report & PDF generator
│   │   └── bench/                # Synthetic evaluation harness (planner vs baseline)
│   └── tests/                    # 122 pytest unit, contract & safety tests
├── frontend/                     # React 19 + TypeScript + Vite + Tailwind CSS v4
│   ├── package.json
│   └── src/
│       ├── design/theme.css      # Cortex XSIAM Obsidian-Slate design tokens
│       ├── agents/               # AgentOperatorDesk & 10-state deterministic avatar
│       ├── features/workspace/   # PlanDagNode & workspace modules
│       ├── components/           # AttackGraph, FindingCard, ResponseQueuePanel, etc.
│       ├── pages/app/            # All 11 SOC routes
│       └── test/                 # Vitest unit & component tests
├── scenarios/hq-breach/          # Multi-stage synthetic intrusion scenario
├── fixtures/recorded-hq-breach/  # Pre-recorded CASE-2026-0001 fixture for instant demo
├── e2e/                          # Playwright E2E spec
├── scripts/                      # seed_demo.py, reset_demo.ps1, capture_screenshots.py
└── docs/                         # Architecture, API, Security, FYP Mapping, Demo Script
```

---

## Quick Start (Under 60 Seconds)

### Option A — One-Command Launcher (Windows PowerShell)
```powershell
.\start.ps1
```
This seeds `CASE-2026-0001` with fresh response proposal expiries (`now + 7 days`) and valid ML-DSA-65 chain-of-custody signatures, starts the FastAPI backend on `http://127.0.0.1:8000`, and starts the Vite frontend on `http://127.0.0.1:5173`.

### Option B — Manual Backend + Frontend
```powershell
# 1. Seed recorded demo case & benchmarks
python scripts/seed_demo.py

# 2. Start FastAPI backend (serves both API and built SPA at http://127.0.0.1:8000)
cd backend
python -m uvicorn saksi.main:app --host 127.0.0.1 --port 8000
```

---

## Verification Commands

```powershell
# Backend test suite (122 passed)
cd backend
python -m pytest -q tests

# Frontend unit tests, linter, and production build
cd ../frontend
npm test
npm run lint
npm run build
```

