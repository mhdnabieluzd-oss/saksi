import { useHealth, useLlmHealth } from "@/lib/queries";

export type BackendState = "checking" | "online" | "offline";
export type LlmState = "checking" | "online" | "degraded" | "offline" | "unknown";

export interface ConnectionStatusInfo {
  backend: BackendState;
  llm: LlmState;
  version: string | null;
  mlDsaReady: boolean | null;
  llmModel: string | null;
  llmLatencyMs: number | null;
  llmDetail: string;
}

/**
 * Splits fast backend reachability (/api/health) from the slower LLM probe (/api/health/llm)
 * so the shell and Command Centre never block on a 40s LLM timeout.
 * Applies honest latency thresholds (<=3000ms online, >3000ms degraded).
 */
export function useConnectionStatus(): ConnectionStatusInfo {
  const health = useHealth();
  const llm = useLlmHealth(Boolean(health.data?.ok));

  const backend: BackendState = health.isError
    ? "offline"
    : health.data?.ok
      ? "online"
      : "checking";

  let llmState: LlmState;
  if (backend === "offline") {
    llmState = "unknown";
  } else if (llm.isLoading || !llm.data) {
    llmState = "checking";
  } else if (!llm.data.ok) {
    llmState = "offline";
  } else if (llm.data.latency_ms !== null && llm.data.latency_ms > 3000) {
    llmState = "degraded";
  } else {
    llmState = "online";
  }

  return {
    backend,
    llm: llmState,
    version: health.data?.version ?? null,
    mlDsaReady: health.data?.ml_dsa_ready ?? null,
    llmModel: llm.data?.model ?? null,
    llmLatencyMs: llm.data?.latency_ms ?? null,
    llmDetail: llm.data?.detail ?? "",
  };
}
