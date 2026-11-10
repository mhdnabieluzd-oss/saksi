# SAKSI 5-Minute Live Pitch Script & Q&A Cheat Sheet (iHack 2026)

> **Pre-Pitch Reset (30 seconds before going on stage):**
> ```powershell
> .\scripts\reset_demo.ps1
> ```
> Confirm `http://127.0.0.1:8000/app/command-centre` is open at `1920×1080` (100% browser zoom).

---

## Minute-by-Minute Live Demo Choreography (5:00 Total)

### 0:00 – 0:45 | The Problem & Core Positioning (`Command Centre`)
- **Screen:** `/app/command-centre`
- **Action:** Point to the **Cortex XSIAM Telemetry-to-Response Pipeline** (`Log Sources → Normalised Events → Detections & Shield → Verified Findings → Response Proposals`).
- **Say:** *"Malaysian SOC teams drown in raw Sysmon, Suricata, and Windows logs, but giving an LLM unrestricted shell access is reckless. SAKSI is **autonomous in investigation planning and evidence inquiry, and analyst-supervised in defensive action**."*

### 0:45 – 1:45 | Live 4-Agent Run & Adaptive Re-Planning (`Agent Operations`)
- **Screen:** `/app/cases/CASE-2026-0001/agents`
- **Action:**
  1. Click **Re-run Investigation** (completes smoothly in ~2.5 seconds via the deterministic workflow engine — zero risk of live API lag).
  2. Click the **Investigation Plan DAG** version switcher (`v1` → `v2`) and point to the **4-step segmented progress ring**.
  3. Click **Test policy gate (self-test)** (`exec_shell`) and show the red `Policy: DENIED` toast and `TOOL_BLOCKED` audit entry.
- **Say:** *"Watch our four specialist agents—Triage, Investigator, Verifier, and Reporter. When Investigator discovers lateral movement to `DC-HQ-01`, it dynamically expands Plan `v1` into `v2`. And if an agent or prompt injection attempts `exec_shell`, our Read-Only Tool Broker blocks it deterministically."*

### 1:45 – 3:00 | Attack Graph, Verifier Self-Test & Receipt Drawer (`Case Workspace`)
- **Screen:** `/app/cases/CASE-2026-0001`
- **Action:**
  1. Click a stage in the **Attack Chain Strip** to highlight the corresponding nodes in the **Attack Graph** and scroll to the **Finding Card**.
  2. Click an `EV-0001` **Evidence Receipt Chip** to open the **Evidence Receipt Drawer** showing the raw log and SHA-256 hash.
  3. Click **Inject Hallucination (Self-Test)** in the Findings header and expand **Rejected / Unverified (1)** to show the Verifier catching `T1999.999` / `EV-999999`.
- **Say:** *"Every finding carries a Cortex-style severity badge and clickable `EV-xxxx` receipts. If the LLM hallucinates a technique or event ID, our 5-check deterministic Verifier automatically rejects it before it ever reaches the report."*

### 3:00 – 4:15 | Analyst-Supervised Response Queue (`Case Workspace → Response Queue`)
- **Screen:** `/app/cases/CASE-2026-0001` (Right column: **Supervised Response Queue**)
- **Action:**
  1. Click **Approve** on `isolate_host (WKS-FIN-04)`, select **Simulation only**, and confirm. Show status: `Approved by Analyst — not executed`.
  2. Click **Simulate (Dry-Run)** and show the amber `SIMULATED — NO SYSTEM ACTION TAKEN` badge.
- **Say:** *"Notice that Approve and Execute are strictly separate. Approving verifies the SHA-256 `payload_hash` and `basis_hash`. Running a simulation clearly records `SIMULATED — NO SYSTEM ACTION TAKEN`—never faking a live production action."*

### 4:15 – 5:00 | Bilingual Reports, ML-DSA-65 Ledger & Benchmarks (`Reports` & `Benchmarks`)
- **Screen:** `/app/cases/CASE-2026-0001/reports` → `/app/benchmarks`
- **Action:**
  1. Toggle **English** ↔ **Bahasa Melayu** report tabs and point to the **ML-DSA-65 (NIST FIPS 204)** post-quantum signature badge.
  2. Click **Benchmarks** in the sidebar to show the honest **Synthetic Evaluation Harness** comparison (`Autonomous Planner` vs `Fixed Single-Pass Baseline`).
- **Say:** *"Finally, Reporter generates executive and technical reports in both English and Bahasa Melayu, sealed with NIST FIPS 204 ML-DSA-65 post-quantum signatures, and our synthetic benchmark harness proves why multi-step re-planning outperforms a single-pass baseline."*

---

## Judge Q&A Cheat Sheet

1. **"What happens if an attacker puts `Ignore previous instructions` inside a Windows Event Log or HTTP User-Agent?"**
   - Our **Log Injection Shield** scans every event at ingest, wraps adversarial strings in `[FLAGGED_UNTRUSTED_LOG_CONTENT]`, and even if an LLM is tricked into requesting `exec_shell`, the **Tool Broker Policy Gate** blocks it at the Python layer (`test_investigator_no_response_imports`).
2. **"Does the AI automatically isolate hosts or block IPs?"**
   - Never. SAKSI is *autonomous in investigation, analyst-supervised in response*. Every containment proposal requires human approval bound to `payload_hash` and `basis_hash`.
3. **"What if the internet or LLM API drops during an investigation?"**
   - SAKSI has a deterministic rule-based investigation & template reporting fallback (`SAKSI_FAST_WORKFLOW`), and explicitly labels fallback outputs so the analyst always knows how every finding was produced.

