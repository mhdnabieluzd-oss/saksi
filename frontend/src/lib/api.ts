import type {
  CaseDetail,
  CaseSummary,
  Classification,
  ChatMessage,
  EventDetail,
  EventPage,
  Finding,
  Graph,
  Lang,
  LedgerEntry,
  LedgerVerification,
  LlmHealth,
  Overview,
  Report,
  ReportHashCheck,
  RunStatus,
  AgentEvent,
  Settings,
  ShieldAlert,
  SourceKind,
  Severity,
  Story,
  InvestigationPlan,
  ToolDefinition,
  ResponseProposal,
  ExecutionMode,
  BenchmarkRunResult,
} from "./types";

export const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// Request models from saksi/models.py (not part of the frontend data contract).
export interface Health {
  ok: boolean;
  version: string;
  ml_dsa_ready?: boolean;
}
export interface NewScenarioRequest {
  scenario: "hq-breach";
}
export interface ChatRequest {
  question: string;
}
export interface ReportRequest {
  lang: Lang;
  classification: Classification;
}
export type EventQuery = {
  q?: string;
  source?: SourceKind;
  severity?: Severity;
  flag?: string;
  offset?: number;
  limit?: number;
};

async function readDetail(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) return "Invalid request";
    }
  } catch {
    // Body was not JSON; fall through to the status text.
  }
  return res.statusText || `Request failed (${res.status})`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Backend unreachable");
  }
  if (!res.ok) throw new ApiError(res.status, await readDetail(res));
  return (await res.json()) as T;
}

function send<T>(method: "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

const casePath = (caseId: string) => `/cases/${encodeURIComponent(caseId)}`;

export const getHealth = () => request<Health>("/health");
export const getLlmHealth = () => request<LlmHealth>("/health/llm");
export const getOverview = (includeLlm = true) =>
  request<Overview>(`/overview${includeLlm ? "" : "?include_llm=false"}`);
export const getSettings = () => request<Settings>("/settings");
export const saveSettings = (settings: Settings) => send<Settings>("PUT", "/settings", settings);

export const listCases = () => request<CaseSummary[]>("/cases");
export const createScenarioCase = (req: NewScenarioRequest = { scenario: "hq-breach" }) =>
  send<CaseSummary>("POST", "/cases/scenario", req);

export function uploadCase(files: File[], title: string): Promise<CaseSummary> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  form.append("title", title);
  return request<CaseSummary>("/cases/upload", { method: "POST", body: form });
}

export const getCase = (caseId: string) => request<CaseDetail>(casePath(caseId));

export const listEvents = (caseId: string, params: EventQuery = {}) =>
  request<EventPage>(`${casePath(caseId)}/events${query(params)}`);
export const getEvent = (caseId: string, eventId: string) =>
  request<EventDetail>(`${casePath(caseId)}/events/${encodeURIComponent(eventId)}`);

export const getGraph = (caseId: string) => request<Graph>(`${casePath(caseId)}/graph`);
export const getStory = (caseId: string) => request<Story>(`${casePath(caseId)}/story`);

export const startRun = (caseId: string) => send<RunStatus>("POST", `${casePath(caseId)}/run`);
export const getRun = (caseId: string) => request<RunStatus>(`${casePath(caseId)}/run`);
export const pauseRun = (caseId: string) => send<RunStatus>("POST", `${casePath(caseId)}/run/pause`);
export const resumeRun = (caseId: string) => send<RunStatus>("POST", `${casePath(caseId)}/run/resume`);
export const stopRun = (caseId: string) => send<RunStatus>("POST", `${casePath(caseId)}/run/stop`);

export const getPlan = (caseId: string) => request<InvestigationPlan>(`${casePath(caseId)}/plan`);
export const listPlans = (caseId: string) => request<InvestigationPlan[]>(`${casePath(caseId)}/plans`);
export const getToolRegistry = () => request<ToolDefinition[]>("/tool-registry");
export const testToolRequest = (
  caseId: string,
  req: { tool_name: string; arguments: Record<string, unknown>; analyst?: string; test?: boolean },
) =>
  send<{ allowed: boolean; reason: string; sanitized_args: Record<string, unknown>; test?: boolean; actor?: string }>(
    "POST",
    `${casePath(caseId)}/tool-requests`,
    req,
  );

export const listResponseProposals = (caseId: string) =>
  request<ResponseProposal[]>(`${casePath(caseId)}/response-proposals`);
export const approveResponseProposal = (
  caseId: string,
  proposalId: string,
  req: { analyst: string; payload_hash: string; note?: string; mode?: ExecutionMode },
) =>
  send<ResponseProposal>(
    "POST",
    `${casePath(caseId)}/response-proposals/${encodeURIComponent(proposalId)}/approve`,
    req,
  );
export const rejectResponseProposal = (
  caseId: string,
  proposalId: string,
  req: { analyst: string; payload_hash: string; note?: string },
) =>
  send<ResponseProposal>(
    "POST",
    `${casePath(caseId)}/response-proposals/${encodeURIComponent(proposalId)}/reject`,
    req,
  );
export const executeResponseProposal = (
  caseId: string,
  proposalId: string,
  req: {
    analyst: string;
    payload_hash: string;
    mode: ExecutionMode;
    confirm_target?: string;
    environment?: string;
  },
) =>
  send<ResponseProposal>(
    "POST",
    `${casePath(caseId)}/response-proposals/${encodeURIComponent(proposalId)}/execute`,
    req,
  );
export const rollbackResponseProposal = (
  caseId: string,
  proposalId: string,
  req: { analyst: string; payload_hash: string; note?: string },
) =>
  send<ResponseProposal>(
    "POST",
    `${casePath(caseId)}/response-proposals/${encodeURIComponent(proposalId)}/rollback`,
    req,
  );

export const listBenchmarkRuns = () => request<BenchmarkRunResult[]>("/benchmarks/runs");
export const runBenchmarkEvaluation = (req: {
  case_id: string;
  workflow: "autonomous_planner" | "fixed_baseline";
}) => send<BenchmarkRunResult>("POST", "/benchmarks/runs", req);

export const listAgentEvents = (caseId: string, after = 0) =>
  request<AgentEvent[]>(`${casePath(caseId)}/agents/events${query({ after })}`);
export const runVerifierSelfTest = (caseId: string) =>
  send<Finding>("POST", `${casePath(caseId)}/selftest/verifier`);

export const listShield = (caseId: string) => request<ShieldAlert[]>(`${casePath(caseId)}/shield`);

export const getLedger = (caseId: string) => request<LedgerEntry[]>(`${casePath(caseId)}/ledger`);
export const verifyLedger = (caseId: string) =>
  request<LedgerVerification>(`${casePath(caseId)}/ledger/verify`);
export const tamperLedger = (caseId: string) =>
  send<LedgerVerification>("POST", `${casePath(caseId)}/ledger/tamper`);
export const restoreLedger = (caseId: string) =>
  send<LedgerVerification>("POST", `${casePath(caseId)}/ledger/restore`);

export const listChat = (caseId: string) => request<ChatMessage[]>(`${casePath(caseId)}/chat`);
export const sendChat = (caseId: string, req: ChatRequest) =>
  send<ChatMessage>("POST", `${casePath(caseId)}/chat`, req);

export const generateReport = (
  caseId: string,
  req: ReportRequest = { lang: "en", classification: "SULIT" },
) => send<Report>("POST", `${casePath(caseId)}/report`, req);
export const getReport = (caseId: string, lang: Lang = "en") =>
  request<Report>(`${casePath(caseId)}/report${query({ lang })}`);
export const reportPdfUrl = (caseId: string, lang: Lang = "en") =>
  `${API_BASE}${casePath(caseId)}/report.pdf${query({ lang })}`;
export const verifyReportHash = (caseId: string, hash: string) =>
  request<ReportHashCheck>(`/verify/report${query({ case_id: caseId, hash })}`);
