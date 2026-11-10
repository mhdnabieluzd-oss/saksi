// SAKSI data contract (frontend). Mirrors saksi/models.py exactly.
// Copy to web/src/lib/types.ts. Change only together with saksi/models.py and docs/saksi-api.md.
// All timestamps are ISO 8601 strings in UTC ending in "Z".

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type SourceKind = "web" | "sysmon" | "siem" | "generic";
export type Classification = "TERHAD" | "SULIT" | "RAHSIA" | "RAHSIA BESAR";
export type CaseStatus = "new" | "running" | "completed" | "failed";
export type AgentName = "triage" | "investigator" | "verifier" | "reporter";
export type AgentState = "idle" | "queued" | "running" | "completed" | "failed" | "requires_review";
export type FindingStatus = "verified" | "rejected" | "unverified";
export type Confidence = "high" | "medium" | "low";
export type NodeKind = "ip" | "user" | "host" | "process" | "domain" | "file";
export type Risk = "critical" | "high" | "medium" | "low" | "none";
export type Lang = "en" | "ms";

export interface SourceFile { name: string; kind: SourceKind; sha256: string; size_bytes: number; event_count: number }

export interface Event {
  id: string; ts: string; source: SourceKind; source_file: string; event_type: string; severity: Severity;
  host: string | null; user: string | null; src_ip: string | null; dst_ip: string | null;
  process: string | null; parent_process: string | null; command_line: string | null; url: string | null;
  status_code: number | null; bytes_out: number | null;
  message: string; raw: string; sha256: string; flags: string[]; signal_ids: string[];
}
export interface EventPage { total: number; items: Event[] }
export interface IntegrityCheck { stored_hash: string; computed_hash: string; match: boolean }

export interface Signal {
  id: string; rule_id: string; title: string; technique_id: string; tactic: string;
  severity: Severity; event_ids: string[]; entities: string[];
}
export interface ShieldAlert {
  id: string; event_id: string; pattern: string; excerpt: string;
  atlas_technique: string; atlas_name: string; action: "quarantined"; detected_at: string;
}
export interface VerificationCheck { name: string; passed: boolean | null; detail: string }
export interface Verification { checks: VerificationCheck[]; verdict_reason: string; verified_at: string }
export interface Finding {
  id: string; title: string; summary: string; tactic: string; technique_id: string; technique_name: string;
  evidence_ids: string[]; entities: string[]; confidence: Confidence; status: FindingStatus;
  verification: Verification | null; origin: "investigator" | "triage_fallback" | "self_test";
  first_seen: string | null; last_seen: string | null;
}

export interface GraphNode {
  id: string; kind: NodeKind; label: string; risk: Risk; first_seen: string | null; last_seen: string | null;
  first_ts?: string | null; last_ts?: string | null; degree?: number;
  event_ids: string[]; finding_ids: string[];
  attributes?: Record<string, unknown>;
}
export interface GraphEdge {
  id: string; source: string; target: string; label: string; ts: string;
  last_ts?: string | null;
  event_ids: string[]; evidence_ids?: string[]; step: number | null;
  provenance?: "observed" | "inferred" | "contextual";
  directed?: boolean;
  relation?: string | null;
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_nodes?: number | null;
  truncated?: boolean;
}

export interface StoryStep {
  order: number; ts: string; title: string; description: string; tactic: string; technique_id: string;
  finding_id: string; event_ids: string[]; node_ids: string[]; edge_ids: string[];
}
export interface Story { case_id: string; summary: string; severity: Severity; steps: StoryStep[] }

export interface AgentStatus {
  name: AgentName; state: AgentState; current_task: string; progress: number;
  started_at: string | null; finished_at: string | null; output_summary: string;
}
export type AgentEventKind = "status" | "action" | "tool_call" | "tool_result" | "finding" | "warning" | "error" | "info";
export interface AgentEvent {
  seq: number; ts: string; case_id: string; agent: AgentName; kind: AgentEventKind; message: string;
  tool: string | null; args: Record<string, unknown> | null; evidence_ids: string[]; ledger_seq: number | null;
  code?: string | null;
  ref?: string | null;
}
export interface RunStatus {
  case_id: string; state: "idle" | "running" | "paused" | "stopped" | "completed" | "failed"; agents: AgentStatus[];
  started_at: string | null; finished_at: string | null; model: string; error: string | null;
}

export type TaskStatus = "planned" | "ready" | "running" | "waiting_approval" | "completed" | "blocked" | "failed" | "skipped" | "cancelled";
export type CapabilityClass = "read_evidence" | "correlate" | "enrich" | "response";
export type ToolRiskTier = "read_only" | "elevated_read" | "response_sim" | "response_live";

export interface ToolDefinition {
  name: string;
  description: string;
  capability_class: CapabilityClass;
  permission_scope: string;
  risk_tier: ToolRiskTier;
  requires_approval: boolean;
  max_results: number;
  timeout_seconds: number;
  data_handling: "local" | "redacted_cloud";
  input_schema: Record<string, unknown>;
}

export interface PlanTask {
  task_id: string;
  title: string;
  objective: string;
  rationale: string;
  status: TaskStatus;
  tool_name: string;
  input: Record<string, unknown>;
  depends_on: string[];
  expected_evidence: string[];
  risk: ToolRiskTier;
  stage?: string;
  policy?: "allowed" | "blocked" | "needs_approval";
  policy_reason?: string | null;
  max_results: number;
  timeout_seconds: number;
  started_at: string | null;
  finished_at: string | null;
  output_summary: string;
  evidence_ids: string[];
  finding_ids: string[];
  blocked_reason: string | null;
  plan_version_added: number;
}

export interface PlanLimits {
  max_steps: number;
  max_tool_calls: number;
  max_runtime_seconds: number;
}

export interface InvestigationPlan {
  plan_id: string;
  case_id: string;
  run_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  revised_at?: string | null;
  reconstructed?: boolean;
  status: "active" | "paused" | "completed" | "stopped" | "failed";
  objective: string;
  revision_reason: string;
  tasks: PlanTask[];
  limits: PlanLimits;
  stop_conditions: string[];
  stop_reason: string | null;
}

export type ResponseActionType = "isolate_host" | "disable_account" | "block_ip" | "quarantine_file";
export type ResponseProposalStatus = "draft" | "pending_approval" | "approved" | "rejected" | "expired" | "executing" | "succeeded" | "simulated" | "failed" | "rolled_back" | "invalidated";
export type ExecutionMode = "simulation" | "live_lab";

export interface ResponseProposal {
  id: string;
  case_id: string;
  action_type: ResponseActionType;
  target: string;
  title: string;
  reason: string;
  security_benefit: string;
  finding_ids: string[];
  evidence_ids: string[];
  d3fend_id: string;
  d3fend_name: string;
  impact_assessment: string;
  reversibility: string;
  rollback_procedure: string;
  connector: string;
  execution_mode: ExecutionMode;
  parameters: Record<string, unknown>;
  risk_tier: "low" | "medium" | "high" | "critical";
  confidence: Confidence;
  status: ResponseProposalStatus;
  created_at: string;
  expires_at: string;
  payload_hash: string;
  recommended_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  decision_note: string;
  executed_at: string | null;
  rolled_back_at: string | null;
  execution_result: string;
  ledger_seq: number | null;
  basis_hash?: string | null;
  approved_mode?: ExecutionMode | null;
  invalidated_reason?: string | null;
  environment?: string | null;
  executed_by?: string | null;
  rolled_back_by?: string | null;
}

export interface TechniqueEvalRow {
  technique_id: string;
  technique_name: string;
  tactic: string;
  expected_event_ids: string[];
  predicted_finding_id: string | null;
  predicted_status: FindingStatus | null;
  cited_event_ids: string[];
  matched: boolean;
  grounding_precision: number;
  citation_overlap: number;
}

export interface BenchmarkMetrics {
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  precision: number;
  recall: number;
  f1: number;
  false_positives_per_case: number;
  evidence_grounding_precision: number;
  evidence_citation_precision: number;
  evidence_coverage: number;
  time_to_first_finding_ms: number | null;
  investigation_completion_ms: number | null;
  tool_calls_total: number | null;
  blocked_tool_requests: number;
  verifier_rejection_rate: number;
}

export interface BenchmarkScenarioManifest {
  scenario_id: string;
  name: string;
  dataset_source: string;
  telemetry_layers: string[];
  license: string;
  event_count: number;
  expected_techniques: number;
  expected_entities: string[];
  limitations: string;
}

export interface BenchmarkRunResult {
  id: string;
  case_id: string;
  scenario_id: string;
  workflow: "autonomous_planner" | "fixed_baseline";
  model: string;
  evaluated_at: string;
  manifest: BenchmarkScenarioManifest;
  metrics: BenchmarkMetrics;
  per_technique: TechniqueEvalRow[];
  notes: string;
}

export type LedgerKind =
  | "CASE_CREATED" | "EVIDENCE_INGESTED" | "EVENTS_NORMALISED" | "AGENT_STEP"
  | "FINDING_VERIFIED" | "FINDING_REJECTED" | "SHIELD_ALERT" | "VERIFIER_SELF_TEST"
  | "REPORT_GENERATED" | "CHAT_ANSWER" | "SEAL"
  | "PLAN_UPDATED" | "TOOL_BLOCKED" | "RESPONSE_PROPOSED" | "RESPONSE_APPROVED"
  | "RESPONSE_REJECTED" | "RESPONSE_EXECUTED" | "RESPONSE_ROLLED_BACK" | "RESPONSE_INVALIDATED" | "BENCHMARK_COMPLETED";
export interface LedgerEntry {
  seq: number; ts: string; case_id: string; kind: LedgerKind; actor: string; summary: string;
  data: Record<string, unknown>; prev_hash: string; entry_hash: string;
}
export interface SignatureStatus {
  algorithm: string; public_key_fingerprint: string; signed_head_hash: string | null;
  signed_seq: number | null; signed_at: string | null; valid: boolean | null;
}
export interface LedgerVerification {
  ok: boolean; entries: number; broken_at: number | null; reason: string; head_hash: string | null;
  events_root_ok: boolean | null; signature: SignatureStatus; checked_at: string; tampered_simulation: boolean;
}

export interface Citation { event_id: string; excerpt: string }
export interface ChatMessage {
  id: string; role: "user" | "assistant"; content: string; lang: Lang; ts: string; citations: Citation[];
  verified_points: string[]; hypotheses: string[]; uncertainty: string | null; unknown_citations: string[];
  ledger_seq: number | null;
}

export interface ReportTimelineItem { ts: string; description: string; evidence_ids: string[] }
export interface ReportFinding { finding_id: string; title: string; technique_id: string; technique_name: string; summary: string; evidence_ids: string[] }
export interface CustodySummary { entries: number; head_hash: string; chain_ok: boolean; signature_algorithm: string; signature_valid: boolean | null }
export interface Report {
  case_id: string; lang: Lang; classification: Classification; generated_at: string; model: string; title: string;
  bluf: string; executive_summary: string; incident_overview: string; timeline: ReportTimelineItem[];
  affected_systems: string[]; verified_findings: ReportFinding[]; interpretations: string[];
  risk_level: Severity; risk_and_impact: string; decisions_needed: string[]; recommended_actions: string[];
  custody: CustodySummary; report_hash: string;
  template_fallback?: boolean;
  signature_status?: SignatureStatus | null;
}
export interface ReportHashCheck { case_id: string; report_hash: string; match: boolean; lang: Lang | null }

export interface CaseSummary {
  id: string; title: string; created_at: string; status: CaseStatus; severity: Severity | null;
  classification: Classification; scenario: boolean; sources: SourceFile[];
  recorded_run?: boolean; recorded_at?: string | null; recorded_model?: string | null;
  last_activity?: { ts?: string; summary?: string } | null;
  event_count: number; finding_count: number; verified_count: number; shield_alert_count: number;
}
export interface CaseStats { by_source: Record<string, number>; by_severity: Record<string, number>; time_start: string | null; time_end: string | null }
export interface CaseDetail { summary: CaseSummary; stats: CaseStats; scope: string; signals: Signal[]; findings: Finding[]; shield_alerts: ShieldAlert[] }
export interface EventDetail { event: Event; integrity: IntegrityCheck; related_finding_ids: string[]; custody: LedgerEntry[] }

export interface LlmHealth { ok: boolean; model: string; latency_ms: number | null; detail: string }
export interface Overview {
  cases_total: number; active_investigations: number; critical_incidents: number;
  agents_configured: number; agents_available: number | null; evidence_verified: number; evidence_total: number;
  recent_cases: CaseSummary[]; recent_agent_events: AgentEvent[]; llm: LlmHealth; llm_checked?: boolean; ml_dsa_ready: boolean;
}
export interface Settings { analyst_name: string; model: string; reporter_model: string; default_classification: Classification }

// WebSocket /ws/cases/{caseId}: server pushes these messages.
export type WsMessage =
  | { type: "agent_event"; data: AgentEvent }
  | { type: "agent_status"; data: AgentStatus }
  | { type: "run_status"; data: RunStatus }
  | { type: "replay_complete"; data: { last_seq: number } };
