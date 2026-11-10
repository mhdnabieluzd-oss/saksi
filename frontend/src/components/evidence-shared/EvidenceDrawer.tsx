import type { ReactNode } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import type { EventDetail, LedgerEntry } from "@/lib/types";
import { useEvent } from "@/lib/queries";
import { severityMeta, type StatusMeta } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Hash } from "@/components/ui/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { Timestamp } from "@/components/ui/timestamp";

const MATCH_META: StatusMeta = {
  label: "Hash match",
  className: "text-green bg-green/10 border-green/30",
  Icon: CircleCheck,
};

const MISMATCH_META: StatusMeta = {
  label: "Hash mismatch",
  className: "text-red bg-red/10 border-red/30",
  Icon: CircleX,
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-text">{children}</dd>
    </>
  );
}

const orDash = (value: string | number | null) => (value === null || value === "" ? "-" : String(value));

function EvidenceBody({ detail }: { detail: EventDetail }) {
  const { event, integrity, related_finding_ids: findings, custody } = detail;
  const integrityMeta = integrity.match ? MATCH_META : MISMATCH_META;
  return (
    <div className="space-y-6">
      <section aria-labelledby="ev-integrity" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 id="ev-integrity" className="text-sm font-semibold text-text">
            Integrity
          </h3>
          <StatusBadge meta={integrityMeta} />
        </div>
        <p className="text-xs text-text-muted">
          The stored SHA-256 is compared with a hash recomputed from the event content.
        </p>
        <dl className="grid grid-cols-[max-content_1fr] items-start gap-x-4 gap-y-2">
          <Field label="Stored">
            <Hash value={integrity.stored_hash} n={16} />
          </Field>
          <Field label="Recomputed">
            <Hash value={integrity.computed_hash} n={16} />
          </Field>
        </dl>
      </section>

      <section aria-labelledby="ev-summary" className="space-y-3">
        <h3 id="ev-summary" className="text-sm font-semibold text-text">
          Event
        </h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
          <Field label="Timestamp">
            <Timestamp iso={event.ts} />
          </Field>
          <Field label="Source">{event.source}</Field>
          <Field label="Source file">
            <span className="font-mono text-xs">{event.source_file}</span>
          </Field>
          <Field label="Event type">{event.event_type}</Field>
          <Field label="Severity">
            <Badge tone="neutral">{severityMeta(event.severity).label}</Badge>
          </Field>
          <Field label="Host">{orDash(event.host)}</Field>
          <Field label="User">{orDash(event.user)}</Field>
          <Field label="Source IP">
            <span className="font-mono text-xs">{orDash(event.src_ip)}</span>
          </Field>
          <Field label="Destination IP">
            <span className="font-mono text-xs">{orDash(event.dst_ip)}</span>
          </Field>
          <Field label="Process">{orDash(event.process)}</Field>
          <Field label="Parent process">{orDash(event.parent_process)}</Field>
          <Field label="Command line">
            <span className="font-mono text-xs break-all">{orDash(event.command_line)}</span>
          </Field>
          <Field label="URL">
            <span className="font-mono text-xs break-all">{orDash(event.url)}</span>
          </Field>
          <Field label="Status code">{orDash(event.status_code)}</Field>
          <Field label="Bytes out">{orDash(event.bytes_out)}</Field>
          <Field label="Message">{event.message}</Field>
          <Field label="Flags">
            {event.flags.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {event.flags.map((flag) => (
                  <Badge key={flag} tone="amber" mono>
                    {flag}
                  </Badge>
                ))}
              </span>
            ) : (
              "-"
            )}
          </Field>
        </dl>
      </section>

      <section aria-labelledby="ev-raw" className="space-y-3">
        <h3 id="ev-raw" className="sr-only">
          Raw log
        </h3>
        <CodeBlock code={event.raw} label="Raw log" />
      </section>

      <section aria-labelledby="ev-findings" className="space-y-2">
        <h3 id="ev-findings" className="text-sm font-semibold text-text">
          Related findings
        </h3>
        {findings.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {findings.map((id) => (
              <li key={id}>
                <Badge tone="cyan" mono>
                  {id}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">No findings reference this event.</p>
        )}
      </section>

      <section aria-labelledby="ev-custody" className="space-y-2">
        <h3 id="ev-custody" className="text-sm font-semibold text-text">
          Chain of custody
        </h3>
        {custody.length > 0 ? (
          <ol className="divide-y divide-border rounded-md border border-border">
            {custody.map((entry: LedgerEntry) => (
              <li key={entry.seq} className="space-y-1 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-text-secondary">#{entry.seq}</span>
                  <Badge tone="muted" mono>
                    {entry.kind}
                  </Badge>
                </div>
                <p className="text-sm text-text">{entry.summary}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                  <Timestamp iso={entry.ts} />
                  <Hash value={entry.entry_hash} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-text-secondary">No custody entries reference this event.</p>
        )}
      </section>
    </div>
  );
}

function EvidenceContent({ caseId, eventId }: { caseId: string; eventId: string }) {
  const query = useEvent(caseId, eventId);
  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading evidence" className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load this evidence item"
        message={query.error instanceof Error ? query.error.message : "Unknown error"}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <EvidenceBody detail={query.data} />;
}

interface EvidenceDrawerProps {
  caseId: string;
  eventId: string;
  /** The element that opens the drawer, such as an EvidenceChip. Focus returns to it on close. */
  children: ReactNode;
}

/** Right-hand drawer with one evidence event: fields, raw log, integrity and custody. */
export function EvidenceDrawer({ caseId, eventId, children }: EvidenceDrawerProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent variant="right" className="p-0">
        <div className="shrink-0 border-b border-border py-4 pr-14 pl-5">
          <DialogTitle className="font-mono text-base text-cyan">{eventId}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-text-secondary">
            Evidence in {caseId}: original log, normalised fields and integrity check.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <EvidenceContent caseId={caseId} eventId={eventId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
