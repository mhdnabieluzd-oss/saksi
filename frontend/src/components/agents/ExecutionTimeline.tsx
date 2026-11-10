import type { AgentName, AgentState, AgentStatus } from "@/lib/types";
import { agentStateMeta, formatTs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { AGENT_INFO, AGENT_ORDER } from "./meta";
import { formatDuration } from "./timing";

const BAR_CLASS: Record<AgentState, string> = {
  idle: "bg-border",
  queued: "bg-border",
  running: "bg-cyan",
  completed: "bg-green",
  failed: "bg-red",
  requires_review: "bg-amber",
};

/** Horizontal bars per agent on one shared time axis. The state is written beside each bar, not only shown by colour. */
export function ExecutionTimeline({ agents, now }: { agents: Record<AgentName, AgentStatus>; now: number }) {
  const spans = AGENT_ORDER.flatMap((name) => {
    const status = agents[name];
    const start = status.started_at ? Date.parse(status.started_at) : Number.NaN;
    if (Number.isNaN(start)) return [];
    const end = status.finished_at ? Date.parse(status.finished_at) : now;
    return [{ name, start, end: Math.max(start, end) }];
  });

  if (spans.length === 0) {
    return (
      <EmptyState
        title="No agent has started yet"
        description="Each agent appears here on a shared time axis once it begins its work."
      />
    );
  }

  const origin = Math.min(...spans.map((span) => span.start));
  const finish = Math.max(...spans.map((span) => span.end));
  const axis = Math.max(finish - origin, 1_000);

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-4">
      <div className="flex justify-between font-mono text-xs text-text-muted tabular-nums">
        <span>{formatTs(new Date(origin).toISOString())}</span>
        <span>{formatTs(new Date(finish).toISOString())}</span>
      </div>
      <ol aria-label="Agent execution timeline" className="space-y-3">
        {AGENT_ORDER.map((name) => {
          const status = agents[name];
          const span = spans.find((candidate) => candidate.name === name);
          const label = agentStateMeta(status.state).label;
          return (
            <li
              key={name}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_5rem] items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_6rem]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-text">{AGENT_INFO[name].short}</p>
                <p className="text-xs text-text-muted">{label}</p>
              </div>
              <div className="relative h-6 overflow-hidden rounded-sm bg-bg">
                {span ? (
                  <div
                    role="img"
                    aria-label={`${AGENT_INFO[name].short}: ${label}, ${formatDuration(span.end - span.start)}`}
                    className={cn("absolute inset-y-0 rounded-sm", BAR_CLASS[status.state])}
                    style={{
                      left: `${((span.start - origin) / axis) * 100}%`,
                      width: `${Math.max(((span.end - span.start) / axis) * 100, 1)}%`,
                    }}
                  />
                ) : (
                  <span className="flex h-full items-center px-2 text-xs text-text-muted">Not started</span>
                )}
              </div>
              <span className="text-right font-mono text-xs text-text-secondary tabular-nums">
                {span ? formatDuration(span.end - span.start) : "-"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
