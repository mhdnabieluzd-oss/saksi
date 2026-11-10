import { Link } from "react-router-dom";
import type { AgentEvent } from "@/lib/types";
import { formatTs, formatTsUtc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { AGENT_INFO, KIND_INFO } from "./meta";

/** One agent event: time, agent, kind (icon and label), message, evidence, tool arguments and ledger link. */
export function EventRow({ caseId, event }: { caseId: string; event: AgentEvent }) {
  const kind = KIND_INFO[event.kind];
  const KindIcon = kind.Icon;
  return (
    <li className="grid items-start gap-x-4 gap-y-1.5 px-4 py-3 md:grid-cols-[13rem_9rem_minmax(0,1fr)]">
      <time
        dateTime={event.ts}
        title={formatTsUtc(event.ts)}
        className="min-h-6 font-mono text-xs leading-6 whitespace-nowrap text-text-secondary tabular-nums"
      >
        {formatTs(event.ts)}
      </time>
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        <Badge tone="cyan" mono>
          {AGENT_INFO[event.agent].short}
        </Badge>
        <span className={cn("inline-flex items-center gap-1.5 text-xs", kind.className)}>
          <KindIcon aria-hidden className="size-3.5 shrink-0" />
          {kind.label}
        </span>
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm break-words text-text">{event.message}</p>
        {event.tool && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge mono>{event.tool}</Badge>
            {event.args && (
              <details className="min-w-0 flex-1">
                <summary className="inline-flex min-h-7 cursor-pointer items-center text-xs text-text-secondary hover:text-text">
                  Arguments
                </summary>
                <CodeBlock className="mt-2" code={JSON.stringify(event.args, null, 2)} label="Tool arguments" />
              </details>
            )}
          </div>
        )}
        {event.evidence_ids.length > 0 && (
          <ul aria-label="Evidence" className="flex flex-wrap gap-1.5">
            {event.evidence_ids.map((id) => (
              <li key={id}>
                <EvidenceChip caseId={caseId} eventId={id} />
              </li>
            ))}
          </ul>
        )}
        {event.ledger_seq !== null && (
          <Link
            to={`/app/cases/${caseId}/evidence?tab=ledger&seq=${event.ledger_seq}`}
            className="inline-flex min-h-7 items-center rounded-sm border border-border px-2 font-mono text-xs text-text-secondary transition-colors hover:border-cyan hover:text-cyan"
          >
            Ledger #{event.ledger_seq}
          </Link>
        )}
      </div>
    </li>
  );
}
