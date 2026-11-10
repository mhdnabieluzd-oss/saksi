"""SAKSI data contract.

Every backend module and the frontend (web/src/lib/types.ts) follow these shapes.
Change a model here only together with types.ts and docs/saksi-api.md.
All timestamps are ISO 8601 strings in UTC with a trailing "Z".
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------- enums
Severity = Literal["info", "low", "medium", "high", "critical"]
SourceKind = Literal["web", "sysmon", "siem", "generic"]
Classification = Literal["TERHAD", "SULIT", "RAHSIA", "RAHSIA BESAR"]
CaseStatus = Literal["new", "running", "completed", "failed"]
AgentName = Literal["triage", "investigator", "verifier", "reporter"]
AgentState = Literal["idle", "queued", "running", "completed", "failed", "requires_review"]
FindingStatus = Literal["verified", "rejected", "unverified"]
Confidence = Literal["high", "medium", "low"]
NodeKind = Literal["ip", "user", "host", "process", "domain", "file"]
Risk = Literal["critical", "high", "medium", "low", "none"]
Lang = Literal["en", "ms"]


# ---------------------------------------------------------------- evidence
class SourceFile(BaseModel):
    name: str
    kind: SourceKind
    sha256: str
    size_bytes: int
    event_count: int


class Event(BaseModel):
    """One normalised log record. `raw` is the original record, untouched."""
    id: str                                   # "EV-00001", assigned after merge-sorting by ts
    ts: str
    source: SourceKind
    source_file: str
    event_type: str                           # e.g. "http_request", "process_create", "logon"
    severity: Severity = "info"
    host: Optional[str] = None
    user: Optional[str] = None
    src_ip: Optional[str] = None
    dst_ip: Optional[str] = None
    process: Optional[str] = None
    parent_process: Optional[str] = None
    command_line: Optional[str] = None
    url: Optional[str] = None
    status_code: Optional[int] = None
    bytes_out: Optional[int] = None
    message: str                              # one-line human summary
    raw: str                                  # original record text (JSON or line), byte-for-byte as ingested
    sha256: str                               # sha256 of `raw` (utf-8)
    flags: list[str] = Field(default_factory=list)       # "suspicious", "prompt_injection", "quarantined"
    signal_ids: list[str] = Field(default_factory=list)


class EventPage(BaseModel):
    total: int
    items: list[Event]


class IntegrityCheck(BaseModel):
    stored_hash: str
    computed_hash: str
    match: bool


# ---------------------------------------------------------------- detection
class Signal(BaseModel):
    """Deterministic detection-rule hit produced by the triage agent."""
    id: str                                   # "SIG-001"
    rule_id: str                              # e.g. "WEB-SQLI"
    title: str
    technique_id: str                         # ATT&CK id, e.g. "T1190"
    tactic: str                               # ATT&CK tactic name, e.g. "Initial Access"
    severity: Severity
    event_ids: list[str]
    entities: list[str] = Field(default_factory=list)


class ShieldAlert(BaseModel):
    """A log record that tries to manipulate the AI (indirect prompt injection)."""
    id: str                                   # "AIS-001"
    event_id: str
    pattern: str                              # which pattern matched
    excerpt: str                              # the offending text (truncated to 300 chars)
    atlas_technique: str = "AML.T0051.001"
    atlas_name: str = "LLM Prompt Injection: Indirect"
    action: Literal["quarantined"] = "quarantined"
    detected_at: str


class VerificationCheck(BaseModel):
    name: str                                 # "evidence_exists", "technique_valid", "tactic_consistent",
                                              # "entities_in_evidence", "not_quarantined_only", "llm_support"
    passed: Optional[bool]                    # None = check skipped (e.g. LLM unavailable)
    detail: str


class Verification(BaseModel):
    checks: list[VerificationCheck]
    verdict_reason: str
    verified_at: str


class Finding(BaseModel):
    id: str                                   # "F-001"; self-test findings use "F-TEST-001"
    title: str
    summary: str
    tactic: str
    technique_id: str
    technique_name: str
    evidence_ids: list[str]
    entities: list[str] = Field(default_factory=list)
    confidence: Confidence = "medium"
    status: FindingStatus = "unverified"
    verification: Optional[Verification] = None
    origin: Literal["investigator", "triage_fallback", "self_test"] = "investigator"
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None


# ---------------------------------------------------------------- graph and story
class GraphNode(BaseModel):
    id: str                                   # "<kind>:<value>", e.g. "ip:203.0.113.66"
    kind: NodeKind
    label: str
    risk: Risk = "none"
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    first_ts: Optional[str] = None
    last_ts: Optional[str] = None
    degree: int = 0
    event_ids: list[str] = Field(default_factory=list)
    finding_ids: list[str] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str                                   # "E-001"
    source: str                               # GraphNode.id
    target: str                               # GraphNode.id
    label: str                                # action, e.g. "HTTP POST", "logon", "spawned", "exfiltration"
    ts: str                                   # earliest event on this edge
    last_ts: Optional[str] = None             # latest event on this edge
    event_ids: list[str]
    evidence_ids: list[str] = Field(default_factory=list)
    step: Optional[int] = None                # StoryStep.order this edge belongs to
    provenance: Literal["observed", "inferred", "contextual"] = "observed"
    directed: bool = True
    relation: Optional[str] = None


class Graph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    total_nodes: Optional[int] = None
    truncated: bool = False


class StoryStep(BaseModel):
    order: int                                # 1-based
    ts: str                                   # real timestamp of the first event in the step
    title: str
    description: str
    tactic: str
    technique_id: str
    finding_id: str
    event_ids: list[str]
    node_ids: list[str]
    edge_ids: list[str]


class Story(BaseModel):
    case_id: str
    summary: str
    severity: Severity
    steps: list[StoryStep]


# ---------------------------------------------------------------- agents
class AgentStatus(BaseModel):
    name: AgentName
    state: AgentState = "idle"
    current_task: str = ""
    progress: int = 0                         # 0-100
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    output_summary: str = ""


class AgentEvent(BaseModel):
    seq: int                                  # per-case, strictly increasing from 1
    ts: str
    case_id: str
    agent: AgentName
    kind: Literal["status", "action", "tool_call", "tool_result", "finding", "warning", "error", "info"]
    message: str                              # concise, human-readable; never hidden chain-of-thought
    tool: Optional[str] = None
    args: Optional[dict[str, Any]] = None
    evidence_ids: list[str] = Field(default_factory=list)
    ledger_seq: Optional[int] = None
    code: Optional[str] = None
    ref: Optional[str] = None


class RunStatus(BaseModel):
    case_id: str
    state: Literal["idle", "running", "paused", "stopped", "completed", "failed"] = "idle"
    agents: list[AgentStatus]
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    model: str = ""
    error: Optional[str] = None


# ---------------------------------------------------------------- autonomous planner & tool registry
TaskStatus = Literal[
    "planned", "ready", "running", "waiting_approval",
    "completed", "blocked", "failed", "skipped", "cancelled",
]
CapabilityClass = Literal["read_evidence", "correlate", "enrich", "response"]
ToolRiskTier = Literal["read_only", "elevated_read", "response_sim", "response_live"]


class ToolDefinition(BaseModel):
    name: str
    description: str
    capability_class: CapabilityClass = "read_evidence"
    permission_scope: str = "case:read"
    risk_tier: ToolRiskTier = "read_only"
    max_results: int = 25
    timeout_seconds: int = 20
    requires_approval: bool = False
    data_handling: Literal["local", "redacted_cloud"] = "redacted_cloud"
    input_schema: dict[str, Any] = Field(default_factory=dict)


class PlanTask(BaseModel):
    task_id: str                              # "TASK-01"
    title: str
    objective: str
    rationale: str
    status: TaskStatus = "planned"
    tool_name: str
    input: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[str] = Field(default_factory=list)
    expected_evidence: list[str] = Field(default_factory=list)
    risk: ToolRiskTier = "read_only"
    stage: str = "inquiry"
    policy: Literal["allowed", "blocked", "needs_approval"] = "allowed"
    policy_reason: Optional[str] = None
    max_results: int = 25
    timeout_seconds: int = 20
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    output_summary: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    finding_ids: list[str] = Field(default_factory=list)
    blocked_reason: Optional[str] = None
    plan_version_added: int = 1


class PlanLimits(BaseModel):
    max_steps: int = 20
    max_tool_calls: int = 40
    max_runtime_seconds: int = 300


class InvestigationPlan(BaseModel):
    plan_id: str                              # "PLAN-CASE-2026-0001-v1"
    case_id: str
    run_id: str
    version: int = 1
    created_at: str
    updated_at: str
    revised_at: Optional[str] = None
    reconstructed: bool = False
    status: Literal["active", "paused", "completed", "stopped", "failed"] = "active"
    objective: str
    revision_reason: str = "Initial plan from triage signals and scope"
    tasks: list[PlanTask] = Field(default_factory=list)
    limits: PlanLimits = Field(default_factory=PlanLimits)
    stop_conditions: list[str] = Field(
        default_factory=lambda: ["objective_met", "budget_exhausted", "no_safe_next_step"]
    )
    stop_reason: Optional[str] = None


# ---------------------------------------------------------------- human-approved response
ResponseActionType = Literal["isolate_host", "disable_account", "block_ip", "quarantine_file"]
ResponseProposalStatus = Literal[
    "draft", "pending_approval", "approved", "rejected",
    "expired", "executing", "succeeded", "simulated", "failed", "rolled_back", "invalidated",
]
ExecutionMode = Literal["simulation", "live_lab"]


class ResponseProposal(BaseModel):
    id: str                                   # "RESP-001"
    case_id: str
    action_type: ResponseActionType
    target: str                               # exact hostname, user, IP or path
    title: str
    reason: str
    security_benefit: str
    finding_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    d3fend_id: str = "D3-ISOL"
    d3fend_name: str = "Execution Isolation"
    impact_assessment: str
    reversibility: str
    rollback_procedure: str
    connector: str = "saksi_sim_edr"
    execution_mode: ExecutionMode = "simulation"
    parameters: dict[str, Any] = Field(default_factory=dict)
    risk_tier: Literal["low", "medium", "high", "critical"] = "high"
    confidence: Confidence = "high"
    status: ResponseProposalStatus = "pending_approval"
    created_at: str
    expires_at: str
    payload_hash: str                         # sha256 over canonical action_type + target + connector + parameters
    recommended_by: str = "response_recommender"
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[str] = None
    decision_note: str = ""
    executed_at: Optional[str] = None
    rolled_back_at: Optional[str] = None
    execution_result: str = ""
    ledger_seq: Optional[int] = None
    # Additive safety fields (WP-S). All optional so older responses.json files still load.
    basis_hash: Optional[str] = None          # sha256 over finding ids+statuses and cited event hashes at proposal time
    approved_mode: Optional[ExecutionMode] = None   # scope the analyst approved: simulation (default) or live_lab
    invalidated_reason: Optional[str] = None
    environment: Optional[str] = None         # lab environment id, set only when a lab record was written
    executed_by: Optional[str] = None
    rolled_back_by: Optional[str] = None


class ResponseDecisionRequest(BaseModel):
    analyst: str = "Analyst"
    payload_hash: str
    note: str = ""
    mode: Optional[ExecutionMode] = None      # approval scope; used by approve only, default simulation


class ResponseExecuteRequest(BaseModel):
    analyst: str = "Analyst"
    payload_hash: str
    mode: ExecutionMode = "simulation"
    confirm_target: Optional[str] = None      # live_lab only: must equal the proposal target exactly
    environment: Optional[str] = None         # live_lab only: must equal the server lab environment id


# ---------------------------------------------------------------- benchmarking
class TechniqueEvalRow(BaseModel):
    technique_id: str
    technique_name: str
    tactic: str
    expected_event_ids: list[str] = Field(default_factory=list)
    predicted_finding_id: Optional[str] = None
    predicted_status: Optional[FindingStatus] = None
    cited_event_ids: list[str] = Field(default_factory=list)
    matched: bool = False
    grounding_precision: float = 0.0
    citation_overlap: int = 0


class BenchmarkMetrics(BaseModel):
    true_positives: int
    false_positives: int
    false_negatives: int
    precision: float
    recall: float
    f1: float
    false_positives_per_case: float
    evidence_grounding_precision: float
    evidence_citation_precision: float
    evidence_coverage: float
    time_to_first_finding_ms: Optional[int] = None   # None = not measured
    investigation_completion_ms: Optional[int] = None
    tool_calls_total: Optional[int] = None
    blocked_tool_requests: int
    verifier_rejection_rate: float


class BenchmarkScenarioManifest(BaseModel):
    scenario_id: str
    name: str
    dataset_source: str
    telemetry_layers: list[str]
    license: str
    event_count: int
    expected_techniques: int
    expected_entities: list[str]
    limitations: str


class BenchmarkRunResult(BaseModel):
    id: str                                   # "BENCH-001"
    case_id: str
    scenario_id: str = "hq-breach"
    workflow: Literal["autonomous_planner", "fixed_baseline"] = "autonomous_planner"
    model: str
    evaluated_at: str
    manifest: BenchmarkScenarioManifest
    metrics: BenchmarkMetrics
    per_technique: list[TechniqueEvalRow]
    notes: str = ""


# ---------------------------------------------------------------- custody
LedgerKind = Literal[
    "CASE_CREATED", "EVIDENCE_INGESTED", "EVENTS_NORMALISED", "AGENT_STEP",
    "FINDING_VERIFIED", "FINDING_REJECTED", "SHIELD_ALERT", "VERIFIER_SELF_TEST",
    "REPORT_GENERATED", "CHAT_ANSWER", "SEAL",
    "PLAN_UPDATED", "TOOL_BLOCKED", "RESPONSE_PROPOSED", "RESPONSE_APPROVED",
    "RESPONSE_REJECTED", "RESPONSE_EXECUTED", "RESPONSE_ROLLED_BACK", "RESPONSE_INVALIDATED", "BENCHMARK_COMPLETED",
]


class LedgerEntry(BaseModel):
    seq: int                                  # 1-based, per case
    ts: str
    case_id: str
    kind: LedgerKind
    actor: str                                # "system", "triage", "investigator", "verifier", "reporter", "analyst:<name>"
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)   # hashes, model, tool, ids
    prev_hash: str                            # entry_hash of seq-1, or 64 zeros for seq 1
    entry_hash: str                           # sha256 of canonical JSON of every field except entry_hash


class SignatureStatus(BaseModel):
    algorithm: str = "ML-DSA-65 (FIPS 204)"
    public_key_fingerprint: str               # sha256 of the public key, hex, first 16 chars
    signed_head_hash: Optional[str] = None    # ledger head the seal signed
    signed_seq: Optional[int] = None
    signed_at: Optional[str] = None
    valid: Optional[bool] = None              # None = no seal yet


class LedgerVerification(BaseModel):
    ok: bool
    entries: int
    broken_at: Optional[int] = None           # first seq whose hash or link fails
    reason: str
    head_hash: Optional[str] = None
    events_root_ok: Optional[bool] = None     # merkle root of event hashes still matches EVENTS_NORMALISED
    signature: SignatureStatus
    checked_at: str
    tampered_simulation: bool = False         # true while a tamper simulation is active


# ---------------------------------------------------------------- chat
class Citation(BaseModel):
    event_id: str
    excerpt: str


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    lang: Lang
    ts: str
    citations: list[Citation] = Field(default_factory=list)
    verified_points: list[str] = Field(default_factory=list)
    hypotheses: list[str] = Field(default_factory=list)
    uncertainty: Optional[str] = None
    unknown_citations: list[str] = Field(default_factory=list)   # ids the model cited that do not exist
    ledger_seq: Optional[int] = None


class ChatRequest(BaseModel):
    question: str


# ---------------------------------------------------------------- report
class ReportTimelineItem(BaseModel):
    ts: str
    description: str
    evidence_ids: list[str]


class ReportFinding(BaseModel):
    finding_id: str
    title: str
    technique_id: str
    technique_name: str
    summary: str
    evidence_ids: list[str]


class CustodySummary(BaseModel):
    entries: int
    head_hash: str
    chain_ok: bool
    signature_algorithm: str
    signature_valid: Optional[bool]


class Report(BaseModel):
    case_id: str
    lang: Lang
    classification: Classification
    generated_at: str
    model: str
    title: str
    bluf: str                                 # bottom line up front, 2-3 sentences for a commander
    executive_summary: str
    incident_overview: str
    timeline: list[ReportTimelineItem]
    affected_systems: list[str]
    verified_findings: list[ReportFinding]    # only findings with status "verified"
    interpretations: list[str]                # AI interpretation, clearly not verified fact
    risk_level: Severity
    risk_and_impact: str
    decisions_needed: list[str]
    recommended_actions: list[str]
    custody: CustodySummary
    report_hash: str                          # sha256 of canonical JSON of the report minus this field
    template_fallback: bool = False
    signature_status: Optional[SignatureStatus] = None


class ReportRequest(BaseModel):
    lang: Lang = "en"
    classification: Classification = "SULIT"


class ReportHashCheck(BaseModel):
    case_id: str
    report_hash: str
    match: bool
    lang: Optional[Lang] = None


# ---------------------------------------------------------------- cases and overview
class CaseSummary(BaseModel):
    id: str                                   # "CASE-2026-0001"
    title: str
    created_at: str
    status: CaseStatus = "new"
    severity: Optional[Severity] = None
    classification: Classification = "SULIT"
    scenario: bool = False                    # true = simulated training scenario
    recorded_run: bool = False                # true = seeded from deterministic recorded fixture
    recorded_at: Optional[str] = None
    recorded_model: Optional[str] = None
    last_activity: Optional[dict[str, str]] = None
    sources: list[SourceFile] = Field(default_factory=list)
    event_count: int = 0
    finding_count: int = 0
    verified_count: int = 0
    shield_alert_count: int = 0


class CaseStats(BaseModel):
    by_source: dict[str, int]
    by_severity: dict[str, int]
    time_start: Optional[str] = None
    time_end: Optional[str] = None


class CaseDetail(BaseModel):
    summary: CaseSummary
    stats: CaseStats
    scope: str = ""                           # triage agent's scope statement
    signals: list[Signal] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    shield_alerts: list[ShieldAlert] = Field(default_factory=list)


class EventDetail(BaseModel):
    event: Event
    integrity: IntegrityCheck
    related_finding_ids: list[str]
    custody: list[LedgerEntry]                # ledger entries that reference this event or its source file


class NewScenarioRequest(BaseModel):
    scenario: Literal["hq-breach"] = "hq-breach"


class LlmHealth(BaseModel):
    ok: bool
    model: str
    latency_ms: Optional[int] = None
    detail: str = ""


class Overview(BaseModel):
    cases_total: int
    active_investigations: int                # status new or running
    critical_incidents: int                   # cases with severity critical
    agents_configured: int = 4
    agents_available: Optional[int] = None    # deprecated: no longer derived from LLM health; None = not measured (use run status per agent)
    evidence_verified: int                    # events whose stored hash re-computes correctly, all cases
    evidence_total: int
    recent_cases: list[CaseSummary]
    recent_agent_events: list[AgentEvent]
    llm: LlmHealth
    llm_checked: bool = True                  # False when the probe was skipped (include_llm=false); llm is then a placeholder
    ml_dsa_ready: bool


class Settings(BaseModel):
    analyst_name: str = "Analyst"
    model: str = "anthropic/claude-haiku-5.5"
    reporter_model: str = "anthropic/claude-haiku-5.5"
    default_classification: Classification = "SULIT"
