import { ArrowRight, LoaderCircle } from "lucide-react";
import type { AgentName, AgentState, AgentStatus, RunStatus } from "@/lib/types";
import { agentStateMeta, formatTs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { AGENT_INFO } from "./meta";
import { durationMs, formatDuration, formatShortTs } from "./timing";

/** Short time in the card; the full Malaysia time and UTC are in the title. */
function CardTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatTs(iso)} className="font-mono whitespace-nowrap tabular-nums">
      {formatShortTs(iso)}
    </time>
  );
}

/** State pill with icon and label. A running agent gets a spinning icon. */
export function AgentStateBadge({ state }: { state: AgentState | RunStatus["state"] }) {
  const meta = agentStateMeta(state);
  const { Icon } = meta;
  return (
    <Badge className={meta.className}>
      {state === "running" ? (
        <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <Icon aria-hidden className="size-3.5 shrink-0" />
      )}
      {meta.label}
    </Badge>
  );
}

interface AgentCardProps {
  name: AgentName;
  index: number;
  status: AgentStatus;
  now: number;
  /** Draws the arrow to the next agent. Shown from the 1280px breakpoint up, where the cards sit in one row. */
  connector: boolean;
}

export function AgentCard({ name, index, status, now, connector }: AgentCardProps) {
  const info = AGENT_INFO[name];
  const headingId = `agent-${name}-heading`;
  const running = status.state === "running";
  const progress = Math.round(status.progress);
  return (
    <li className="relative">
      <section
        aria-labelledby={headingId}
        className={cn(
          "flex h-full min-w-0 flex-col gap-4 rounded-md border bg-surface p-4",
          running ? "border-cyan" : "border-border",
        )}
      >
        <header className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</p>
            <AgentStateBadge state={status.state} />
          </div>
          <h3 id={headingId} className="text-sm font-semibold text-text">
            {info.title}
          </h3>
        </header>
        <p className="min-h-[3.5rem] text-xs text-text-secondary">{info.role}</p>
        <div className="space-y-1.5">
          <p className="text-xs text-text-muted">Current task</p>
          <p className="min-h-[2.5rem] text-sm text-text">{status.current_task || "None"}</p>
        </div>
        <div className="flex items-center gap-3">
          <ProgressBar value={status.progress} label={`${info.title} progress`} className="flex-1" />
          <span className="w-10 text-right font-mono text-xs text-text-secondary tabular-nums">{progress}%</span>
        </div>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-text-muted">Started</dt>
          <dd className="text-text-secondary">
            {status.started_at ? <CardTime iso={status.started_at} /> : "Not started"}
          </dd>
          <dt className="text-text-muted">Finished</dt>
          <dd className="text-text-secondary">
            {status.finished_at ? <CardTime iso={status.finished_at} /> : running ? "In progress" : "-"}
          </dd>
          <dt className="text-text-muted">Duration</dt>
          <dd className="font-mono text-text-secondary tabular-nums">
            {formatDuration(durationMs(status.started_at, status.finished_at, now))}
          </dd>
        </dl>
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs text-text-muted">Output</p>
          <p className="min-h-[2.5rem] text-sm text-text-secondary">{status.output_summary || "No output yet"}</p>
        </div>
      </section>
      {connector && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-full z-10 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-cyan xl:flex"
        >
          <ArrowRight className="size-3.5" />
        </span>
      )}
    </li>
  );
}
