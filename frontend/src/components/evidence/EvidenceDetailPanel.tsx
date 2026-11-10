import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, CircleX, X } from "lucide-react";
import type { EventDetail, Finding, SignatureStatus, SourceFile } from "@/lib/types";
import { formatBytes, severityMeta } from "@/lib/format";
import { useCase, useEvent, useLedgerVerify } from "@/lib/queries";
import { messageOf } from "@/components/agents/helpers";
import { cn } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { ErrorState } from "@/components/ui/error-state";
import { Hash } from "@/components/ui/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { Timestamp } from "@/components/ui/timestamp";
import { signatureStatusMeta, statusMeta } from "./status";

const NO_FINDINGS: Finding[] = [];
const NO_SOURCES: SourceFile[] = [];

const orDash = (value: string | number | null) => (value === null || value === "" ? "-" : String(value));

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="text-sm font-semibold text-text">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, mono = false, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={cn("min-w-0 break-words text-sm text-text", mono && "font-mono text-xs")}>{children}</dd>
    </>
  );
}

interface DetailBodyProps {
  caseId: string;
  detail: EventDetail;
  findings: Finding[];
  sources: SourceFile[];
  signature: SignatureStatus | undefined;
}

function EvidenceDetailBody({ caseId, detail, findings, sources, signature }: DetailBodyProps) {
  const [payloadView, setPayloadView] = useState<"both" | "normalised" | "raw">("both");
  const { event, integrity, related_finding_ids: relatedIds, custody } = detail;
  const integrityMeta = integrity.match
    ? statusMeta("Hash matches stored record at ingestion", "green", CircleCheck)
    : statusMeta("Hash mismatch against stored record", "red", CircleX);
  const source = sources.find((candidate) => candidate.name === event.source_file);
  const relatedFindings = relatedIds.map((id) => ({
    id,
    title: findings.find((finding) => finding.id === id)?.title ?? "Finding not listed on this case",
  }));

  const fields: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Event type", value: event.event_type, mono: true },
    { label: "Severity", value: severityMeta(event.severity).label },
    { label: "Host", value: orDash(event.host) },
    { label: "User", value: orDash(event.user) },
    { label: "Source IP", value: orDash(event.src_ip), mono: true },
    { label: "Destination IP", value: orDash(event.dst_ip), mono: true },
    { label: "Process", value: orDash(event.process), mono: true },
    { label: "Parent process", value: orDash(event.parent_process), mono: true },
    { label: "Command line", value: orDash(event.command_line), mono: true },
    { label: "URL", value: orDash(event.url), mono: true },
    { label: "Status code", value: orDash(event.status_code) },
    { label: "Bytes out", value: orDash(event.bytes_out) },
    { label: "Message", value: event.message },
  ];

  return (
    <>
      <Section id="ev-integrity" title="SHA-256 ingestion hash">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-muted">
            Compares the hash recorded at ingestion with a hash recomputed from the stored raw log line.
          </p>
          <StatusBadge meta={integrityMeta} />
        </div>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-4 gap-y-2">
          <Field label="Stored">
            <Hash value={integrity.stored_hash} n={16} />
          </Field>
          <Field label="Recomputed">
            <Hash value={integrity.computed_hash} n={16} />
          </Field>
        </dl>
      </Section>

      <div role="group" aria-label="Event representation view" className="inline-flex rounded-md border border-border bg-bg p-0.5 text-xs">
        {(["both", "normalised", "raw"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={payloadView === mode}
            onClick={() => setPayloadView(mode)}
            className={cn(
              "rounded-sm px-2.5 py-1 capitalize transition-colors",
              payloadView === mode ? "bg-surface-elevated font-medium text-cyan" : "text-text-secondary hover:text-text",
            )}
          >
            {mode === "both" ? "Both views" : mode === "normalised" ? "Normalised fields" : "Raw log line"}
          </button>
        ))}
      </div>

      {(payloadView === "both" || payloadView === "raw") && (
        <Section id="ev-raw" title="Original raw log">
          <CodeBlock code={event.raw} label="Original raw log" />
        </Section>
      )}

      {(payloadView === "both" || payloadView === "normalised") && (
        <Section id="ev-normalised" title="Normalised event">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
            <Field label="Timestamp">
              <Timestamp iso={event.ts} />
            </Field>
            {fields.map((field) => (
              <Field key={field.label} label={field.label} mono={field.mono}>
                {field.value}
              </Field>
            ))}
            <Field label="Flags">
              {event.flags.length === 0 ? (
                "-"
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {event.flags.map((flag) => (
                    <Badge key={flag} tone="amber" mono>
                      {flag}
                    </Badge>
                  ))}
                </span>
              )}
            </Field>
          </dl>
        </Section>
      )}

      <Section id="ev-source" title="Source information">
        {source ? (
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
            <Field label="File" mono>
              {source.name}
            </Field>
            <Field label="Kind">{source.kind}</Field>
            <Field label="Events in file">{source.event_count.toLocaleString("en-GB")}</Field>
            <Field label="Size">{formatBytes(source.size_bytes)}</Field>
            <Field label="File SHA-256">
              <Hash value={source.sha256} n={16} />
            </Field>
          </dl>
        ) : (
          <p className="text-sm text-text-secondary">This event&apos;s source file is not listed on the case.</p>
        )}
      </Section>

      <Section id="ev-signature" title="Signature status">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-text-muted">Ledger head signature (ML-DSA-65)</p>
          <StatusBadge meta={signatureStatusMeta(signature)} />
        </div>
        <p className="text-xs text-text-secondary">
          The signature covers the ledger head, which commits to every custody entry. It does not sign this event on
          its own.
        </p>
      </Section>

      <Section id="ev-custody" title="Chain-of-custody events">
        {custody.length === 0 ? (
          <p className="text-sm text-text-secondary">No custody entries reference this event.</p>
        ) : (
          <ol className="divide-y divide-border rounded-md border border-border">
            {custody.map((entry) => (
              <li key={entry.seq} className="space-y-1 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={`/app/cases/${caseId}/evidence?tab=ledger&seq=${entry.seq}`}
                    className="rounded-sm font-mono text-xs text-cyan hover:underline"
                  >
                    Ledger #{entry.seq}
                  </Link>
                  <Badge tone="muted" mono>
                    {entry.kind}
                  </Badge>
                </div>
                <p className="text-sm text-text">{entry.summary}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                  <Timestamp iso={entry.ts} />
                  <span>{entry.actor}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section id="ev-related" title="Related findings">
        {relatedFindings.length === 0 ? (
          <p className="text-sm text-text-secondary">No findings cite this event.</p>
        ) : (
          <ul className="space-y-2">
            {relatedFindings.map((finding) => (
              <li key={finding.id}>
                <Link
                  to={`/app/cases/${caseId}?view=findings&finding=${finding.id}`}
                  className="flex flex-wrap items-center gap-2 rounded-sm text-sm text-text hover:text-cyan"
                >
                  <Badge tone="cyan" mono>
                    {finding.id}
                  </Badge>
                  <span>{finding.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading evidence" className="space-y-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

interface EvidenceDetailPanelProps {
  caseId: string;
  eventId: string;
  onClose: () => void;
}

/** Right-hand evidence panel for the selected row. Sticks beside the table at 1280px and up. */
export function EvidenceDetailPanel({ caseId, eventId, onClose }: EvidenceDetailPanelProps) {
  const detail = useEvent(caseId, eventId);
  const caseQuery = useCase(caseId);
  const verify = useLedgerVerify(caseId);

  return (
    <Card
      title={<span className="font-mono text-base text-cyan">{eventId}</span>}
      actions={
        <Button variant="ghost" size="icon" aria-label="Close evidence details" onClick={onClose}>
          <X aria-hidden />
        </Button>
      }
      className="xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto"
      bodyClassName="space-y-6"
    >
      {detail.isPending ? (
        <DetailSkeleton />
      ) : detail.isError ? (
        <ErrorState
          title="Could not load this evidence item"
          message={messageOf(detail.error)}
          onRetry={() => void detail.refetch()}
        />
      ) : (
        <EvidenceDetailBody
          caseId={caseId}
          detail={detail.data}
          findings={caseQuery.data?.findings ?? NO_FINDINGS}
          sources={caseQuery.data?.summary.sources ?? NO_SOURCES}
          signature={verify.data?.signature}
        />
      )}
    </Card>
  );
}
