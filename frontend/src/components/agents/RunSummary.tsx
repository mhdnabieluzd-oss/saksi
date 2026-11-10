import type { ReactNode } from "react";
import type { RunStatus } from "@/lib/types";
import { Timestamp } from "@/components/ui/timestamp";
import { StatusDot } from "@/components/ui/status-dot";
import { AgentStateBadge } from "./AgentCard";
import { durationMs, formatDuration } from "./timing";

function SummaryField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-xs text-text">{children}</dd>
    </div>
  );
}

interface RunSummaryProps {
  run: RunStatus | null;
  now: number;
  connected: boolean;
}

/** Run state, timing, and live connection status. */
export function RunSummary({ run, now, connected }: RunSummaryProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-2.5 md:flex-row md:items-center md:justify-between">
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <SummaryField label="Status">
          <AgentStateBadge state={run?.state ?? "idle"} />
        </SummaryField>
        <SummaryField label="Started">{run?.started_at ? <Timestamp iso={run.started_at} /> : "-"}</SummaryField>
        <SummaryField label="Finished">
          {run?.finished_at ? <Timestamp iso={run.finished_at} /> : "-"}
        </SummaryField>
        <SummaryField label="Duration">
          <span className="font-mono tabular-nums">
            {formatDuration(durationMs(run?.started_at ?? null, run?.finished_at ?? null, now))}
          </span>
        </SummaryField>
      </dl>
      <StatusDot
        tone={connected ? "ok" : "warn"}
        label={connected ? "Live updates" : "Reconnecting"}
      />
    </div>
  );
}
