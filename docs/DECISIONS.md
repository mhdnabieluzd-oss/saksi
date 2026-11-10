# SAKSI Platform — Architectural & Product Decisions

## ADR-001: Standalone Monorepo in `saksi-platform/`
- **Date:** 2026-11-10
- **Context:** The parent `development/` folder mixed legacy Streamlit prototypes (`main.py`, `main2.py`, `backend/`), multiple virtual environments, and large datasets alongside the FastAPI + React system.
- **Decision:** Package the entire product into `saksi-platform/` with `backend/`, `frontend/`, `scenarios/hq-breach/`, `fixtures/recorded-hq-breach/`, `e2e/`, `docs/`, `scripts/`, and one-command launchers (`start.ps1`, `start.sh`). Zero runtime imports or file paths reference anything outside `saksi-platform/`.

## ADR-002: Modular Backend Package with Backward-Compatible Re-Exports
- **Date:** 2026-11-10
- **Context:** The specification (§3.1) organizes backend code into subpackages (`domain/`, `ingest/`, `detect/`, `agents/`, `planning/`, `evidence/`, `response/`, `reporting/`, `bench/`, `llm/`, `api/`) while requiring all 117+ existing unit/integration tests (`from saksi.models import ...`, `from saksi.responses import ...`) to pass without breakage.
- **Decision:** Place canonical implementations in the §3.1 subpackages and maintain lightweight module re-exports at `saksi.<module>` so both modular imports (`saksi.domain.models`) and flat imports (`saksi.models`) resolve to the exact same objects and singletons.

## ADR-003: Strict Separation of Autonomous Inquiry and Supervised Response
- **Date:** 2026-11-10
- **Context:** Autonomous containment risks taking destructive actions on hallucinated or tampered evidence.
- **Decision:**
  1. The Investigator agent can only call read-only tools registered in `tool_registry.py` (`PolicyGate`). It has no import path to `response/approval.py` or `response/adapters.py` (enforced by automated AST/import tests).
  2. Approval (`POST /approve`) and execution (`POST /execute`) are distinct operations protected by a per-case `threading.RLock()` and `assert_integrity()` (recomputing payload hash, verifying linked findings remain `verified`, and verifying cited events pass SHA-256 checks).
  3. Simulation execution sets `status="simulated"` and returns `SIMULATED — NO SYSTEM ACTION TAKEN`. Live-lab execution requires `approved_mode="live_lab"`, `confirm_target == proposal.target`, and `environment == settings.lab_env`.

## ADR-004: Honest Telemetry, Benchmarks, and Cryptographic Claims
- **Date:** 2026-11-10
- **Context:** Security judges scrutinize inflated metrics, fake progress bars, and overstated cryptographic claims.
- **Decision:**
  1. Benchmark metrics are computed strictly from real case runs against `scenarios/hq-breach/answer_key.json`. Unmeasured metrics return `null` and display as `Not measured`.
  2. SHA-256 event hashes are described as *"matches the stored reference"* (integrity relative to acquisition), never as proof of original truth or legal admissibility.
  3. ML-DSA-65 (`dilithium-py`) signatures are verified before reporting `signature_status="verified"`.
  4. Agent states are derived deterministically from real pipeline/event state (`deriveAgentState`), never from timers or fixed percentages.

## ADR-005: Deterministic Fallback & Recorded Fixture for Zero-Failure Live Demos
- **Date:** 2026-11-10
- **Context:** Live 5-minute pitches at iHack 2026 cannot risk slow or rate-limited external LLM APIs.
- **Decision:**
  1. When `SAKSI_OPENROUTER_API_KEY` is unset or `SAKSI_FAST_DEMO=1`, the pipeline completes a full deterministic rule-based + template investigation in under 5 seconds and explicitly sets `template_fallback=True` on reports.
  2. Ship `fixtures/recorded-hq-breach/` as a pre-seeded recorded run (`CASE-2026-0001`) clearly badged in the UI (`Recorded run · not live`) with fresh 24-hour proposal expiry regeneration on load/reset.

## ADR-006: Cortex XSIAM Visual Learnings Adapted into Original SAKSI Design System
- **Date:** 2026-11-10
- **Context:** We studied Palo Alto Cortex XSIAM's dark command-centre density and trust patterns (`palo-alto/DESIGN-SPEC.md`, `Xsiam-teardown.md`).
- **Decision:** Adopt the dark navy luminance hierarchy (`#070a12` → `#0d1423` → `#161e2a`), solid square letter severity badges (`C`, `H`, `M`, `L`) in dense views alongside glyph+word badges in tables, severity-colored MITRE cells, dashed-vs-solid provenance edges, split-pane findings view, Verifier explainability popover, segmented step progress ring, and `/pivot`, `/trace`, `/finding` slash commands in Tanya SAKSI — all with original SAKSI branding, self-hosted/system Inter + JetBrains Mono typography, and zero third-party copyrighted assets.
