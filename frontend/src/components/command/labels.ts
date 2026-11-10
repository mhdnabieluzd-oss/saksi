import type { AgentEvent, AgentEventKind, AgentName } from "@/lib/types";

export const AGENT_LABEL: Record<AgentName, string> = {
  triage: "Triage",
  investigator: "Investigator",
  verifier: "Verifier",
  reporter: "Reporter",
};

export const EVENT_KIND_LABEL: Record<AgentEventKind, string> = {
  status: "Status",
  action: "Action",
  tool_call: "Tool call",
  tool_result: "Tool result",
  finding: "Finding",
  warning: "Warning",
  error: "Error",
  info: "Info",
};

export function isAttention(event: AgentEvent): boolean {
  return event.kind === "warning" || event.kind === "error";
}

/** Newest first, so the latest activity sits at the top of each list. */
export function newestFirst(events: AgentEvent[]): AgentEvent[] {
  return [...events].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}
