/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { AgentEvent, AgentName, AgentStatus, RunStatus } from "@/lib/types";
import type { StreamLinkPhase } from "@/lib/ws";
import type { BackendState } from "@/components/layout/connection";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Timestamp } from "@/components/ui/timestamp";
import { AgentAvatar } from "./AgentAvatar";
import {
  AGENT_IDENTITY_META,
  deriveAgentState,
  type AvatarState,
  type DerivedAgentState,
} from "./deriveAgentState";

export const PIPELINE_AGENTS: AgentName[] = ["triage", "investigator", "verifier", "reporter"];

export function avatarStateToTone(state: AvatarState): StatusTone {
  switch (state) {
    case "completed":
      return "success";
    case "working":
    case "waiting_for_tool":
    case "verifying":
      return "accent";
    case "warning":
      return "warning";
    case "blocked":
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

export function deriveAllAgentStates(
  agents: Record<AgentName, AgentStatus> | AgentStatus[] | undefined,
  run: RunStatus | null,
  events: AgentEvent[],
  link: StreamLinkPhase = "live",
  backend: BackendState = "online",
): Record<AgentName, DerivedAgentState> {
  const byName: Record<AgentName, AgentStatus> = {
    triage: { name: "triage", state: "idle", current_task: "", progress: 0, started_at: null, finished_at: null, output_summary: "" },
    investigator: { name: "investigator", state: "idle", current_task: "", progress: 0, started_at: null, finished_at: null, output_summary: "" },
    verifier: { name: "verifier", state: "idle", current_task: "", progress: 0, started_at: null, finished_at: null, output_summary: "" },
    reporter: { name: "reporter", state: "idle", current_task: "", progress: 0, started_at: null, finished_at: null, output_summary: "" },
  };
  if (Array.isArray(agents)) {
    for (const a of agents) byName[a.name] = a;
  } else if (agents) {
    Object.assign(byName, agents);
  }
  return {
    triage: deriveAgentState({ agent: "triage", status: byName.triage, run, events, link, backend }),
    investigator: deriveAgentState({ agent: "investigator", status: byName.investigator, run, events, link, backend }),
    verifier: deriveAgentState({ agent: "verifier", status: byName.verifier, run, events, link, backend }),
    reporter: deriveAgentState({ agent: "reporter", status: byName.reporter, run, events, link, backend }),
  };
}

/**
 * Compact 24px multi-agent presence strip for Topbar or Case Header.
 */
export function AgentPresenceStrip({
  caseId,
  states,
  selectedAgent,
  onSelectAgent,
  compact = false,
}: {
  caseId?: string | null;
  states: Record<AgentName, DerivedAgentState>;
  selectedAgent?: AgentName | null;
  onSelectAgent?: (agent: AgentName | null) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Specialist agent status"
      className="flex items-center gap-1.5"
    >
      {PIPELINE_AGENTS.map((name, idx) => {
        const meta = AGENT_IDENTITY_META[name];
        const st = states[name];
        const isSelected = selectedAgent === name;
        const content = (
          <>
            <AgentAvatar
              role={name}
              size={24}
              state={st.state}
              stateLabel={st.label}
              decorative
            />
            {!compact && (
              <div className="min-w-0 text-left">
                <div className="text-xs font-medium leading-tight text-text">
                  {meta.canonicalName}
                </div>
                <div className="truncate text-[11px] leading-tight text-text-muted">
                  {st.label}
                </div>
              </div>
            )}
          </>
        );

        return (
          <div key={name} className="flex items-center gap-1">
            {onSelectAgent ? (
              <button
                type="button"
                onClick={() => onSelectAgent(isSelected ? null : name)}
                aria-pressed={isSelected}
                title={`${meta.canonicalName}: ${st.label}${st.detail ? ` — ${st.detail}` : ""}`}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1 transition-colors",
                  isSelected
                    ? "border-cyan bg-cyan/10 text-text"
                    : "border-border bg-surface-elevated/60 hover:border-slate-600",
                )}
              >
                {content}
              </button>
            ) : caseId ? (
              <Link
                to={`/app/cases/${encodeURIComponent(caseId)}/agents?agent=${name}`}
                title={`${meta.canonicalName}: ${st.label}${st.detail ? ` — ${st.detail}` : ""}`}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated/60 px-2 py-1 transition-colors hover:border-slate-600"
              >
                {content}
              </Link>
            ) : (
              <div
                title={`${meta.canonicalName}: ${st.label}`}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated/60 px-2 py-1"
              >
                {content}
              </div>
            )}
            {idx < PIPELINE_AGENTS.length - 1 && !compact && (
              <ArrowRight aria-hidden className="size-3 text-text-muted/50" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function cleanDetail(text: string): string {
  return text
    .replace(/,\s*0 rule-based/gi, "")
    .replace(/\b1\s+(\w+)\(s\)/g, "1 $1")
    .replace(/(\d+)\s+(\w+)\(s\)/g, "$1 $2s");
}

/**
 * Command Centre 4-agent desk panel (48px portraits, real state, current/last task, last event time).
 * Never shows fabricated progress percentages or fake "4/4 online" counters.
 */
export function AgentDesk({
  caseId,
  caseTitle,
  states,
  quarantineCount = 0,
  sealed = false,
  verifiedCount = 0,
  showOperationsLink = true,
}: {
  caseId: string | null;
  caseTitle?: string;
  states: Record<AgentName, DerivedAgentState>;
  quarantineCount?: number;
  sealed?: boolean;
  verifiedCount?: number;
  showOperationsLink?: boolean;
}) {
  return (
    <section
      aria-label="Agent Pipeline"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-text">Agent Pipeline</h2>
          <p className="text-xs text-text-secondary">
            {caseId ? (
              <>
                Workflow status for{" "}
                <Link
                  to={`/app/cases/${encodeURIComponent(caseId)}`}
                  className="font-mono text-cyan hover:underline"
                >
                  {caseId}
                </Link>
                {caseTitle ? ` · ${caseTitle}` : ""}
              </>
            ) : (
              "Select or create a case to run the 4-agent workflow"
            )}
          </p>
        </div>
        {caseId && showOperationsLink && (
          <Link
            to={`/app/cases/${encodeURIComponent(caseId)}/agents`}
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
          >
            Open Agent Operations
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PIPELINE_AGENTS.map((name) => {
          const meta = AGENT_IDENTITY_META[name];
          const st = states[name];
          const cardBody = (
            <div
              data-agent-card={name}
              data-state={st.state}
              className="flex h-full items-start gap-3 overflow-hidden rounded-md border border-border bg-surface-elevated/50 p-3.5 transition-colors hover:border-slate-600"
            >
              <AgentAvatar
                role={name}
                size={48}
                state={st.state}
                stateLabel={st.label}
                quarantineActive={name === "triage" && quarantineCount > 0}
                verifiedPositive={name === "verifier" && verifiedCount > 0}
                sealed={name === "reporter" && sealed}
                decorative
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-sm font-semibold text-text">
                    {meta.canonicalName}
                  </span>
                  <StatusBadge tone={avatarStateToTone(st.state)} label={st.label} />
                </div>
                <p className="text-[11px] font-medium text-text-muted">
                  {meta.personaTitle}
                </p>
                <p className="mt-1.5 line-clamp-2 text-xs text-text-secondary">
                  {cleanDetail(st.detail || meta.objective)}
                </p>
                {st.since && (
                  <div className="mt-2 truncate border-t border-border/50 pt-1.5 text-[11px] text-text-muted">
                    <Timestamp iso={st.since} className="text-[11px] text-text-muted" />
                  </div>
                )}
              </div>
            </div>
          );

          return caseId ? (
            <Link
              key={name}
              to={`/app/cases/${encodeURIComponent(caseId)}/agents?agent=${name}`}
              className="block h-full"
            >
              {cardBody}
            </Link>
          ) : (
            <div key={name} className="h-full">
              {cardBody}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Agent Operations 96px main cast card (spec §4.7 & §15.3).
 * Displays 96px editorial figure, role title, objective, real state, real tool/finding counts,
 * latest event, and stage handoff. Never displays fabricated percentage progress bars.
 */
export function AgentWorkCard({
  agent,
  derived,
  selected = false,
  onSelect,
  metrics,
  quarantineActive = false,
  verifiedPositive = false,
  sealed = false,
}: {
  agent: AgentName;
  derived: DerivedAgentState;
  selected?: boolean;
  onSelect?: () => void;
  metrics: { label: string; value: string | number }[];
  quarantineActive?: boolean;
  verifiedPositive?: boolean;
  sealed?: boolean;
}) {
  const meta = AGENT_IDENTITY_META[agent];

  return (
    <article
      data-agent-workcard={agent}
      data-state={derived.state}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      aria-pressed={onSelect ? selected : undefined}
      className={cn(
        "flex flex-col justify-between rounded-lg border bg-surface p-4 transition-colors",
        selected
          ? "border-cyan ring-1 ring-cyan/40"
          : "border-border hover:border-slate-600",
        onSelect && "cursor-pointer",
      )}
    >
      <div>
        <div className="flex items-start gap-3.5">
          <AgentAvatar
            role={agent}
            size={96}
            state={derived.state}
            stateLabel={derived.label}
            quarantineActive={quarantineActive}
            verifiedPositive={verifiedPositive}
            sealed={sealed}
            decorative
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div>
                <h3 className="text-base font-semibold text-text">
                  {meta.canonicalName}
                </h3>
                <p className="text-xs font-medium text-text-muted">
                  {meta.personaTitle}
                </p>
              </div>
              <StatusBadge tone={avatarStateToTone(derived.state)} label={derived.label} />
            </div>

            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              {meta.objective}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-border bg-surface-elevated/50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
            <span className="font-medium uppercase tracking-wider">
              {derived.state === "working" ||
              derived.state === "waiting_for_tool" ||
              derived.state === "verifying"
                ? "Active task"
                : "Stage summary"}
            </span>
            {derived.since && <Timestamp iso={derived.since} />}
          </div>
          <p className="mt-0.5 text-xs font-medium text-text">
            {derived.detail || "No recorded activity in this run"}
          </p>
          {derived.blockedCount > 0 && (
            <p className="mt-1 text-xs font-medium text-amber">
              {derived.blockedCount} tool request{derived.blockedCount === 1 ? "" : "s"} blocked by Policy Gate
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-border pt-2.5">
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="rounded bg-bg/60 px-2.5 py-1.5">
              <div className="text-[11px] text-text-muted">{m.label}</div>
              <div className="font-mono text-xs font-semibold text-text">
                {m.value}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span className="truncate">{meta.handoffTo}</span>
          {onSelect && (
            <span className="shrink-0 font-medium text-cyan">
              {selected ? "Filtering feed" : "Filter feed"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
