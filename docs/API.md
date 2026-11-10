# SAKSI REST & WebSocket API Reference

Base URL: `http://127.0.0.1:8000`

---

## 1. System & Health

### `GET /api/health`
Returns backend status, LLM configuration status, and ML-DSA-65 post-quantum signing availability.

### `GET /api/settings` / `PUT /api/settings`
Reads or updates non-secret runtime settings (`analyst_name`, `model`, `base_url`, `fast_workflow`). Never exposes API keys.

---

## 2. Cases & Telemetry Ingestion

### `GET /api/cases`
Lists all cases (`CaseSummary[]`), including `recorded_run`, `recorded_at`, `recorded_model`, `last_activity`, `severity`, `status`, and counts.

### `POST /api/cases/demo`
Creates or resets the flagship `HQ Breach (Simulated)` scenario case (`CASE-2026-0001`).

### `POST /api/cases/upload`
Multipart file upload (`.jsonl`, `.json`, `.csv`, `.log`) creating a new normalized case with automatic Log Injection Shield scanning.

### `GET /api/cases/{case_id}`
Returns full `CaseDetail` (`summary`, `signals`, `shield`, `findings`, `graph`, `run`).

### `GET /api/cases/{case_id}/events`
Paginated normalized ECS-lite events (`offset`, `limit`, `source`, `severity`, `search`, `flagged_only`).

### `GET /api/cases/{case_id}/events/{event_id}`
Single normalized event receipt with raw payload, SHA-256 event hash, and prompt-injection flags.

---

## 3. Autonomous Investigation Run & Plan DAG

### `POST /api/cases/{case_id}/run`
Starts the 4-agent pipeline (`Triage → Investigator → Verifier → Reporter`). When `SAKSI_FAST_WORKFLOW=1` (default), executes deterministically in ~2.5 seconds with smooth live WebSocket events.

### `POST /api/cases/{case_id}/run/pause` | `resume` | `stop`
Cooperative run lifecycle controls.

### `GET /api/cases/{case_id}/plans`
Returns all versions of the `InvestigationPlan` (`v1`, `v2`, ...) with `PlanTask` nodes (`stage`, `policy`, `policy_reason`, `evidence_ids`, `plan_version_added`).

### `GET /api/tools`
Lists the Read-Only Tool Registry (`query_events`, `host_timeline`, `entity_graph`, `ioc_lookup`, `mitre_lookup`, `Check_Injection_Flags`) and explicitly forbidden tools (`exec_shell`, `modify_firewall`, `delete_logs`).

### `POST /api/cases/{case_id}/tool-requests`
Evaluates a tool request through the Tool Broker & Policy Gate. When `test=true` (self-test), logs `TOOL_BLOCKED` in the Chain-of-Custody ledger and emits a WebSocket warning without mutating `plans.json`.

---

## 4. Verifier Self-Test & Bilingual Reports

### `POST /api/cases/{case_id}/verifier/self-test`
Injects a synthetic hallucinated finding (`T1999.999` / `EV-999999`) and runs the 5-check deterministic Verifier harness, demonstrating automatic rejection (`status="rejected"`).

### `GET /api/cases/{case_id}/reports`
Returns `en` (English) and `bm` (Bahasa Melayu) reports with `template_fallback` and `signature_status` metadata.

### `GET /api/cases/{case_id}/reports/{lang}/pdf`
Streams a formatted PDF report (`SULIT` classification header, executive summary, verified findings, MITRE ATT&CK table, and ML-DSA-65 signature block).

### `GET /api/cases/{case_id}/ledger`
Verifies and returns the SHA-256 hash chain + ML-DSA-65 signature (`valid`, `signature_valid`, `algorithm`, `public_key_fingerprint`, `entries`).

---

## 5. Analyst-Supervised Response Queue

### `GET /api/cases/{case_id}/responses`
Lists response proposals (`pending_approval`, `approved`, `rejected`, `simulated`, `succeeded`, `rolled_back`, `expired`, `invalidated`).

### `POST /api/cases/{case_id}/responses/{proposal_id}/approve`
Requires `analyst`, `payload_hash`, `note`, and `mode` (`"simulation"` or `"live"`). Recomputes `payload_hash` and `basis_hash` server-side before approving.

### `POST /api/cases/{case_id}/responses/{proposal_id}/reject`
Rejects a proposal with mandatory analyst reason and records `RESPONSE_REJECTED` in the custody ledger.

### `POST /api/cases/{case_id}/responses/{proposal_id}/execute`
Executes an approved proposal:
- `mode="simulation"` → sets `status="simulated"` (`[SIMULATED — NO SYSTEM ACTION TAKEN]`).
- `mode="live"` → requires `confirm_target == proposal.target`, writes to `lab_state.json`, and sets `status="succeeded"`.

### `POST /api/cases/{case_id}/responses/{proposal_id}/rollback`
Rolls back a `"succeeded"` or `"simulated"` proposal and records `RESPONSE_ROLLED_BACK`.

---

## 6. WebSocket Live Stream

### `WS /ws/cases/{case_id}?since_seq={n}`
Subscribes before replaying buffered events with `seq > since_seq`, then sends:
```json
{ "type": "replay_complete", "data": { "last_seq": 42 } }
```
followed by live `agent_event` frames.

