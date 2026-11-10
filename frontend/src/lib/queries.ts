import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import * as api from "./api";
import { ApiError, type EventQuery, type ReportRequest } from "./api";
import type { ExecutionMode, Lang, Settings } from "./types";

// Every case-scoped key starts with ["cases", caseId], so one prefix invalidates the whole case.
export const queryKeys = {
  health: ["health"] as const,
  llmHealth: ["health", "llm"] as const,
  overview: ["overview"] as const,
  settings: ["settings"] as const,
  cases: ["cases", "list"] as const,
  case: (id: string) => ["cases", id, "detail"] as const,
  events: (id: string, params: EventQuery) => ["cases", id, "events", params] as const,
  event: (id: string, eventId: string) => ["cases", id, "event", eventId] as const,
  graph: (id: string) => ["cases", id, "graph"] as const,
  story: (id: string) => ["cases", id, "story"] as const,
  run: (id: string) => ["cases", id, "run"] as const,
  plan: (id: string) => ["cases", id, "plan"] as const,
  plans: (id: string) => ["cases", id, "plans"] as const,
  toolRegistry: ["tool-registry"] as const,
  responseProposals: (id: string) => ["cases", id, "response-proposals"] as const,
  benchmarks: ["benchmarks", "runs"] as const,
  agentEvents: (id: string, after: number) => ["cases", id, "agent-events", after] as const,
  shield: (id: string) => ["cases", id, "shield"] as const,
  ledger: (id: string) => ["cases", id, "ledger"] as const,
  ledgerVerify: (id: string) => ["cases", id, "ledger", "verify"] as const,
  chat: (id: string) => ["cases", id, "chat"] as const,
  report: (id: string, lang: Lang) => ["cases", id, "report", lang] as const,
};

export function invalidateCase(queryClient: QueryClient, caseId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ["cases", caseId] });
}

// Graph and story return 404 until the run completes: do not retry those.
const retryUnlessNotFound = (failureCount: number, error: Error): boolean =>
  !(error instanceof ApiError && error.status === 404) && failureCount < 1;

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: api.getHealth,
    refetchInterval: 15_000,
  });
}

export function useLlmHealth(enabled = true) {
  return useQuery({
    queryKey: queryKeys.llmHealth,
    queryFn: api.getLlmHealth,
    enabled,
    staleTime: 30_000,
  });
}

export function useOverview(includeLlm = false) {
  return useQuery({
    queryKey: [...queryKeys.overview, includeLlm] as const,
    queryFn: () => api.getOverview(includeLlm),
    refetchInterval: 15_000,
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings });
}

export function useCases() {
  return useQuery({ queryKey: queryKeys.cases, queryFn: api.listCases });
}

export function useCase(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.case(caseId ?? ""),
    queryFn: () => api.getCase(caseId ?? ""),
    enabled: Boolean(caseId),
  });
}

export function useEvents(caseId: string | undefined, params: EventQuery = {}) {
  return useQuery({
    queryKey: queryKeys.events(caseId ?? "", params),
    queryFn: () => api.listEvents(caseId ?? "", params),
    enabled: Boolean(caseId),
    placeholderData: keepPreviousData,
  });
}

export function useEvent(caseId: string | undefined, eventId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.event(caseId ?? "", eventId ?? ""),
    queryFn: () => api.getEvent(caseId ?? "", eventId ?? ""),
    enabled: Boolean(caseId && eventId),
  });
}

export function useGraph(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.graph(caseId ?? ""),
    queryFn: () => api.getGraph(caseId ?? ""),
    enabled: Boolean(caseId),
    retry: retryUnlessNotFound,
  });
}

export function useStory(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.story(caseId ?? ""),
    queryFn: () => api.getStory(caseId ?? ""),
    enabled: Boolean(caseId),
    retry: retryUnlessNotFound,
  });
}

export function useRun(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.run(caseId ?? ""),
    queryFn: () => api.getRun(caseId ?? ""),
    enabled: Boolean(caseId),
    refetchInterval: (query) => (query.state.data?.state === "running" ? 2_000 : false),
  });
}

export function useAgentEvents(caseId: string | undefined, after = 0) {
  return useQuery({
    queryKey: queryKeys.agentEvents(caseId ?? "", after),
    queryFn: () => api.listAgentEvents(caseId ?? "", after),
    enabled: Boolean(caseId),
  });
}

export function useShield(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.shield(caseId ?? ""),
    queryFn: () => api.listShield(caseId ?? ""),
    enabled: Boolean(caseId),
  });
}

export function useLedger(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ledger(caseId ?? ""),
    queryFn: () => api.getLedger(caseId ?? ""),
    enabled: Boolean(caseId),
  });
}

export function useLedgerVerify(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ledgerVerify(caseId ?? ""),
    queryFn: () => api.verifyLedger(caseId ?? ""),
    enabled: Boolean(caseId),
  });
}

export function useChat(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.chat(caseId ?? ""),
    queryFn: () => api.listChat(caseId ?? ""),
    enabled: Boolean(caseId),
  });
}

export function useReport(caseId: string | undefined, lang: Lang = "en") {
  return useQuery({
    queryKey: queryKeys.report(caseId ?? "", lang),
    queryFn: () => api.getReport(caseId ?? "", lang),
    enabled: Boolean(caseId),
    retry: retryUnlessNotFound,
  });
}

export function useCreateScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.createScenarioCase(),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.cases }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      ]),
  });
}

export function useUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ files, title }: { files: File[]; title: string }) => api.uploadCase(files, title),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.cases }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      ]),
  });
}

export function useStartRun(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.startRun(caseId),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useSelfTest(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.runVerifierSelfTest(caseId),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useTamper(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.tamperLedger(caseId),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useRestore(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.restoreLedger(caseId),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useSendChat(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => api.sendChat(caseId, { question }),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useGenerateReport(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: ReportRequest) => api.generateReport(caseId, req),
    onSuccess: (report) => {
      queryClient.setQueryData(queryKeys.report(caseId, report.lang), report);
      return invalidateCase(queryClient, caseId);
    },
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => api.saveSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.settings, saved);
      return queryClient.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function usePlan(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plan(caseId ?? ""),
    queryFn: () => api.getPlan(caseId ?? ""),
    enabled: Boolean(caseId),
    retry: retryUnlessNotFound,
  });
}

export function usePlans(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plans(caseId ?? ""),
    queryFn: () => api.listPlans(caseId ?? ""),
    enabled: Boolean(caseId),
  });
}

export function useToolRegistry() {
  return useQuery({
    queryKey: queryKeys.toolRegistry,
    queryFn: api.getToolRegistry,
  });
}

export function usePauseRun(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.pauseRun(caseId),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useResumeRun(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.resumeRun(caseId),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useStopRun(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.stopRun(caseId),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useTestToolRequest(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { tool_name: string; arguments: Record<string, unknown>; analyst?: string; test?: boolean }) =>
      api.testToolRequest(caseId, req),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useResponseProposals(caseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.responseProposals(caseId ?? ""),
    queryFn: () => api.listResponseProposals(caseId ?? ""),
    enabled: Boolean(caseId),
  });
}

export function useApproveResponse(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { proposalId: string; analyst: string; payload_hash: string; note?: string; mode?: ExecutionMode }) =>
      api.approveResponseProposal(caseId, req.proposalId, {
        analyst: req.analyst,
        payload_hash: req.payload_hash,
        note: req.note,
        mode: req.mode,
      }),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useRejectResponse(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { proposalId: string; analyst: string; payload_hash: string; note?: string }) =>
      api.rejectResponseProposal(caseId, req.proposalId, {
        analyst: req.analyst,
        payload_hash: req.payload_hash,
        note: req.note,
      }),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useExecuteResponse(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: {
      proposalId: string;
      analyst: string;
      payload_hash: string;
      mode: ExecutionMode;
      confirm_target?: string;
      environment?: string;
    }) =>
      api.executeResponseProposal(caseId, req.proposalId, {
        analyst: req.analyst,
        payload_hash: req.payload_hash,
        mode: req.mode,
        confirm_target: req.confirm_target,
        environment: req.environment,
      }),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useRollbackResponse(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { proposalId: string; analyst: string; payload_hash: string; note?: string }) =>
      api.rollbackResponseProposal(caseId, req.proposalId, {
        analyst: req.analyst,
        payload_hash: req.payload_hash,
        note: req.note,
      }),
    onSuccess: () => invalidateCase(queryClient, caseId),
  });
}

export function useBenchmarkRuns() {
  return useQuery({
    queryKey: queryKeys.benchmarks,
    queryFn: api.listBenchmarkRuns,
  });
}

export function useRunBenchmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { case_id: string; workflow: "autonomous_planner" | "fixed_baseline" }) =>
      api.runBenchmarkEvaluation(req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.benchmarks }),
  });
}
