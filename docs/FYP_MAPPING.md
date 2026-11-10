# FYP Proposal Alignment & Research Mapping

**Student:** Muhammad Nabiel Bin U'zied (2023493692)  
**Programme:** CS255 — Bachelor of Computer Science (Hons.) Computer Networks, UiTM  
**Supervisor:** Dr. Mohsen Bin Mohamad Hata  
**Project Title:** *SAKSI: Agentic AI-Driven Cyber Incident Investigation and Supervised Response Platform*

---

## 1. Mapping to Research Objectives (RO1 – RO3)

| Research Objective | FYP Requirement | SAKSI Implementation | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **RO1** | Design a multi-source log ingestion, prompt-injection defense, and autonomous investigation planning architecture. | `saksi/ingest/` normalises Sysmon, Windows Security, Suricata, DNS, Auth, and CloudTrail into ECS-lite `NormalizedEvent` records with SHA-256 digests. `saksi/shield/` flags adversarial log prompt injections. `saksi/planner.py` builds the explicit `InvestigationPlan` DAG (`v1 → v2` adaptive re-planning). | `tests/test_ingest.py`, `tests/test_shield.py`, `tests/test_planner_and_responses.py` |
| **RO2** | Develop a multi-agent investigation pipeline with deterministic evidence verification and post-quantum chain-of-custody sealing. | Four specialist agents (`Triage`, `Investigator`, `Verifier`, `Reporter`) + `Tanya SAKSI` Q&A. `saksi/verifier.py` enforces 5 deterministic checks (`evidence_exists`, `hash_integrity`, `timestamp_consistency`, `attack_id_valid`, `entity_overlap`). `saksi/custody.py` maintains an append-only SHA-256 hash chain sealed with **ML-DSA-65 (NIST FIPS 204)**. | `tests/test_verifier.py`, `tests/test_custody.py`, `tests/test_redesign_contract.py` |
| **RO3** | Evaluate the autonomous planner against a fixed single-pass baseline and enforce analyst-supervised defensive containment. | `saksi/benchmark.py` runs repeatable evaluations across synthetic scenarios (`hq-breach`, `cloud-iam`, `benign-admin`, `injected-log`, `ot-modbus`). `saksi/responses.py` enforces human-in-the-loop approval (`payload_hash` + `basis_hash`), dry-run simulation (`status="simulated"`), and reversible `LAB-LOCAL` execution. | `tests/test_benchmark_and_api.py`, `/app/benchmarks` |

---

## 2. Mapping to FYP Proposal Tables (Tables 6, 12–15)

- **Table 6 (System Architecture & Module Breakdown):**
  - Module 1: Multi-Source Log Ingestion & ECS-Lite Normaliser (`saksi/ingest/`)
  - Module 2: Adversarial Log Prompt-Injection Shield (`saksi/shield/`)
  - Module 3: Autonomous Investigation Planner & Read-Only Tool Broker (`saksi/planning/`, `saksi/tools.py`)
  - Module 4: 5-Check Deterministic Verifier & MITRE ATT&CK Mapper (`saksi/verifier.py`, `saksi/attack_catalog.py`)
  - Module 5: Analyst-Supervised Response Queue & Post-Quantum Custody Ledger (`saksi/responses.py`, `saksi/custody.py`)
- **Tables 12–15 (Functional, Safety & Evaluation Metrics):**
  - **Technique Recall & Precision:** Computed per scenario in `saksi/benchmark.py` without special-case overrides (`T1027` special case removed).
  - **Evidence Grounding Rate:** Percentage of verified findings with 100% valid `EV-xxxx` SHA-256 receipts (`1.0` on verified outputs).
  - **Hallucination Rejection Rate:** `100%` on injected unverified/fabricated findings (`POST /api/cases/{id}/verifier/self-test`).
  - **Unsafe Tool Block Rate:** `100%` on out-of-policy tool requests (`exec_shell`, `modify_firewall`, `delete_logs`).

