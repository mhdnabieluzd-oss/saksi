import type { AgentEvent, AgentName, AgentStatus, RunStatus } from "@/lib/types";
import type { StreamLinkPhase } from "@/lib/ws";
import type { BackendState } from "@/components/layout/connection";

export type AgentIdentityRole = AgentName | "tanya";

export type AvatarState =
  | "idle"
  | "queued"
  | "working"
  | "waiting_for_tool"
  | "verifying"
  | "completed"
  | "warning"
  | "blocked"
  | "failed"
  | "offline";

export interface DerivedAgentState {
  state: AvatarState;
  label: string;
  detail?: string;
  tool?: string;
  since?: string | null;
  lastKnown?: AvatarState;
  blockedCount: number;
  toolCallsCount: number;
}

export interface AgentRoleMeta {
  role: AgentIdentityRole;
  canonicalName: string;
  personaTitle: string;
  objective: string;
  handoffTo: string;
  accentVar: string;
}

export const AGENT_IDENTITY_META: Record<AgentIdentityRole, AgentRoleMeta> = {
  triage: {
    role: "triage",
    canonicalName: "Triage",
    personaTitle: "Log Screening",
    objective: "Scans logs, blocks prompt-injection attempts, and sets the investigation priority.",
    handoffTo: "Signals & scope -> Investigator",
    accentVar: "var(--saksi-accent, #22d3ee)",
  },
  investigator: {
    role: "investigator",
    canonicalName: "Investigator",
    personaTitle: "Evidence Search",
    objective: "Plans search steps, pivots across hosts and accounts, and gathers evidence.",
    handoffTo: "Findings & plan -> Verifier",
    accentVar: "var(--saksi-accent, #22d3ee)",
  },
  verifier: {
    role: "verifier",
    canonicalName: "Verifier",
    personaTitle: "Fact Verification",
    objective: "Checks every finding against raw logs, MITRE ATT&CK rules, and event hashes.",
    handoffTo: "Verified findings -> Reporter",
    accentVar: "var(--saksi-text-secondary, #94a3b8)",
  },
  reporter: {
    role: "reporter",
    canonicalName: "Reporter",
    personaTitle: "Report Writer",
    objective: "Writes the English and Bahasa Melayu reports and seals the evidence chain.",
    handoffTo: "Reports & response actions -> Analyst",
    accentVar: "var(--saksi-info, #7eadeb)",
  },
  tanya: {
    role: "tanya",
    canonicalName: "Tanya SAKSI",
    personaTitle: "Q&A Assistant",
    objective: "Answers questions from verified findings and cites exact log event IDs.",
    handoffTo: "Cited events -> Analyst",
    accentVar: "var(--saksi-accent, #22d3ee)",
  },
};

export interface AvatarStateInput {
  agent: AgentName;
  status: AgentStatus;
  run: RunStatus | null;
  events: AgentEvent[];
  link?: StreamLinkPhase;
  backend?: BackendState;
}

function isFallbackWarning(e: AgentEvent): boolean {
  if (e.kind !== "warning") return false;
  if (e.code === "llm.fallback") return true;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("llm unavailable") ||
    msg.includes("ai support check unavailable") ||
    msg.includes("used rule-based") ||
    msg.includes("used template report")
  );
}

function isPolicyBlockedWarning(e: AgentEvent): boolean {
  if (e.kind !== "warning") return false;
  if (e.code === "policy.blocked" || e.code === "policy.needs_approval") return true;
  const msg = e.message;
  if (msg.includes("duplicate call") || msg.includes("loop guard")) return false;
  return (
    e.tool !== null &&
    (msg.startsWith("Tool Broker:") || msg.startsWith("Policy Gate blocked"))
  );
}

function deriveCore(
  agent: AgentName,
  status: AgentStatus,
  run: RunStatus | null,
  runEvents: AgentEvent[],
): Omit<DerivedAgentState, "lastKnown"> {
  const blockedCount = runEvents.filter(isPolicyBlockedWarning).length;
  const toolCallsCount = runEvents.filter((e) => e.kind === "tool_call").length;
  const lastEvent = runEvents.length > 0 ? runEvents[runEvents.length - 1] : null;

  // Rule 2: failed
  if (status.state === "failed") {
    const errEv = [...runEvents].reverse().find((e) => e.kind === "error");
    return {
      state: "failed",
      label: "Failed",
      detail: errEv?.message || status.output_summary || "Stage failed",
      since: status.finished_at ?? lastEvent?.ts ?? null,
      blockedCount,
      toolCallsCount,
    };
  }

  // Rule 3: warning (requires_review OR completed with fallback OR completed with blocked requests)
  const fallbackEv = [...runEvents].reverse().find(isFallbackWarning);
  if (status.state === "requires_review") {
    return {
      state: "warning",
      label: "Needs analyst review",
      detail: status.output_summary || "One or more findings require manual verification",
      since: status.finished_at ?? lastEvent?.ts ?? null,
      blockedCount,
      toolCallsCount,
    };
  }
  if (status.state === "completed" && (fallbackEv || blockedCount > 0)) {
    const detail =
      blockedCount > 0
        ? `Completed · ${blockedCount} request${blockedCount === 1 ? "" : "s"} blocked by policy`
        : fallbackEv?.message || status.output_summary;
    return {
      state: "warning",
      label: blockedCount > 0 ? `Completed (${blockedCount} blocked)` : "Completed (fallback)",
      detail,
      since: status.finished_at ?? lastEvent?.ts ?? null,
      blockedCount,
      toolCallsCount,
    };
  }

  // Rule 4: completed
  if (status.state === "completed") {
    return {
      state: "completed",
      label: "Completed",
      detail: status.output_summary || "Stage complete",
      since: status.finished_at ?? lastEvent?.ts ?? null,
      blockedCount,
      toolCallsCount,
    };
  }

  // Running states (Rules 5, 6, 7, 8)
  if (status.state === "running") {
    const toolEvents = runEvents.filter(
      (e) => e.kind === "tool_call" || e.kind === "tool_result" || isPolicyBlockedWarning(e),
    );
    const newestToolEv = toolEvents.length > 0 ? toolEvents[toolEvents.length - 1] : null;

    // Rule 5: blocked
    if (newestToolEv && isPolicyBlockedWarning(newestToolEv)) {
      return {
        state: "blocked",
        label: "Request blocked by policy gate",
        detail: newestToolEv.message,
        tool: newestToolEv.tool ?? undefined,
        since: newestToolEv.ts,
        blockedCount,
        toolCallsCount,
      };
    }

    // Rule 6: waiting_for_tool
    if (newestToolEv && newestToolEv.kind === "tool_call" && newestToolEv.tool) {
      return {
        state: "waiting_for_tool",
        label: `Running tool ${newestToolEv.tool}`,
        detail: newestToolEv.message,
        tool: newestToolEv.tool,
        since: newestToolEv.ts,
        blockedCount,
        toolCallsCount,
      };
    }

    // Rule 7: verifying
    if (agent === "verifier") {
      return {
        state: "verifying",
        label: "Verifying findings",
        detail: status.current_task || "Validating event citations and ATT&CK mapping",
        since: status.started_at ?? lastEvent?.ts ?? null,
        blockedCount,
        toolCallsCount,
      };
    }

    // Rule 8: working
    if (run?.state === "paused") {
      return {
        state: "working",
        label: "Pause requested · finishes current stage",
        detail: status.current_task || "Completing active stage before pause",
        since: status.started_at,
        blockedCount,
        toolCallsCount,
      };
    }
    if (run?.state === "stopped") {
      return {
        state: "working",
        label: "Finishing current stage after stop",
        detail: status.current_task || "Stopping after current stage",
        since: status.started_at,
        blockedCount,
        toolCallsCount,
      };
    }
    return {
      state: "working",
      label: "Working",
      detail: status.current_task || lastEvent?.message || "Executing stage",
      since: status.started_at ?? lastEvent?.ts ?? null,
      blockedCount,
      toolCallsCount,
    };
  }

  // Rule 9: queued
  if (status.state === "queued" && (run?.state === "running" || run?.state === "paused")) {
    return {
      state: "queued",
      label: run.state === "paused" ? "Queued · run paused" : "Queued",
      detail: "Waiting for upstream stage handoff",
      since: run.started_at,
      blockedCount,
      toolCallsCount,
    };
  }

  // Rule 10: idle
  const notRun = status.state === "queued" && (run?.state === "stopped" || run?.state === "failed" || run?.state === "completed");
  return {
    state: "idle",
    label: notRun ? "Not run" : "Idle",
    detail: status.output_summary || (notRun ? "Run ended before this stage" : "Awaiting investigation run"),
    since: status.finished_at ?? lastEvent?.ts ?? null,
    blockedCount,
    toolCallsCount,
  };
}

/**
 * Pure deterministic derivation of an agent's visual state from real backend run status and events.
 * Never invents progress percentages or timer-based transitions.
 */
export function deriveAgentState(input: AvatarStateInput): DerivedAgentState {
  const { agent, status, run, events, link = "live", backend = "online" } = input;
  const runEvents = events.filter(
    (e) => e.agent === agent && (!run?.started_at || e.ts >= run.started_at),
  );
  const core = deriveCore(agent, status, run, runEvents);

  // Rule 1: offline
  if (backend === "offline" || link === "reconnecting") {
    return {
      ...core,
      state: "offline",
      lastKnown: core.state,
      label: `Offline · last known: ${core.label}`,
    };
  }

  return core;
}

