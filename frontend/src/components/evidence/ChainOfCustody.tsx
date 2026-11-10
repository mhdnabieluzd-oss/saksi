import { Fragment, useEffect, useState } from "react";
import { ChevronRight, CircleX, ShieldX } from "lucide-react";
import { formatTs, shortHash } from "@/lib/format";
import { useLedger, useLedgerVerify } from "@/lib/queries";
import { messageOf } from "@/components/agents/helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ChainOfCustodyProps {
  caseId: string;
  /** Ledger entry to scroll to and highlight, from the `seq` URL parameter. */
  seq: number | null;
}

/** Every ledger entry in order. When the hash chain fails, the broken entry and every later one are marked. */
export function ChainOfCustody({ caseId, seq }: ChainOfCustodyProps) {
  const ledger = useLedger(caseId);
  const verify = useLedgerVerify(caseId);
  const brokenAt = verify.data && !verify.data.ok ? verify.data.broken_at : null;
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(seq === null ? [] : [seq]));

  useEffect(() => {
    if (seq === null || !ledger.data) return;
    document.getElementById(`ledger-${seq}`)?.scrollIntoView({ block: "center" });
  }, [seq, ledger.data]);

  function toggle(entrySeq: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entrySeq)) next.delete(entrySeq);
      else next.add(entrySeq);
      return next;
    });
  }

  if (ledger.isError) {
    return (
      <ErrorState
        title="Could not load the chain of custody"
        message={messageOf(ledger.error)}
        onRetry={() => void ledger.refetch()}
      />
    );
  }

  if (ledger.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading chain of custody" className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const entries = ledger.data;
  if (entries.length === 0) {
    return <EmptyState title="No custody entries yet" description="Ledger entries appear here once the case is created." />;
  }

  return (
    <div className="space-y-4">
      {brokenAt !== null && verify.data && (
        <div role="alert" className="flex flex-col items-start gap-1 rounded-md border border-red/40 bg-red/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-red">
            <ShieldX aria-hidden className="size-4 shrink-0" />
            Chain broken at entry #{brokenAt}
          </p>
          <p className="text-sm text-text-secondary">{verify.data.reason}</p>
        </div>
      )}
      <Table label="Chain of custody entries" className="min-w-[68rem]">
        <TableHeader>
          <tr>
            <TableHead>Entry</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Prev hash</TableHead>
            <TableHead>Entry hash</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const isOpen = expanded.has(entry.seq);
            const selected = entry.seq === seq;
            const broken = brokenAt !== null && entry.seq >= brokenAt;
            const dataId = `ledger-data-${entry.seq}`;
            return (
              <Fragment key={entry.seq}>
                <TableRow
                  id={`ledger-${entry.seq}`}
                  className={cn(selected && "bg-cyan/10", broken && "bg-red/5")}
                >
                  <TableCell
                    className={cn(
                      "border-l-2 align-top",
                      selected ? "border-cyan" : broken ? "border-red" : "border-transparent",
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? dataId : undefined}
                      onClick={() => toggle(entry.seq)}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-sm font-mono text-xs text-text hover:text-cyan"
                    >
                      <ChevronRight aria-hidden className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                      #{entry.seq}
                    </button>
                    {(selected || broken) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selected && <Badge tone="cyan">Linked from evidence</Badge>}
                        {broken && (
                          <Badge tone="red">
                            <CircleX aria-hidden className="size-3" />
                            Broken link
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <time dateTime={entry.ts} className="font-mono text-xs whitespace-nowrap text-text-secondary">
                      {formatTs(entry.ts)}
                    </time>
                  </TableCell>
                  <TableCell>
                    <Badge tone="muted" mono>
                      {entry.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-text-secondary">{entry.actor}</TableCell>
                  <TableCell className="max-w-md break-words">{entry.summary}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-text-secondary" title={entry.prev_hash || undefined}>
                      {entry.prev_hash ? shortHash(entry.prev_hash, 12) : "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-cyan" title={entry.entry_hash}>
                      {shortHash(entry.entry_hash, 12)}
                    </span>
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow id={dataId}>
                    <TableCell colSpan={7}>
                      <CodeBlock code={JSON.stringify(entry.data, null, 2)} label={`Entry #${entry.seq} data`} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
