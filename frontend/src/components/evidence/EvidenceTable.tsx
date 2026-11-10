import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSearch, ShieldAlert, ShieldQuestion, TriangleAlert } from "lucide-react";
import type { Event, Finding, Severity, SourceKind } from "@/lib/types";
import { formatTs, severityMeta } from "@/lib/format";
import { formatShortTs } from "@/components/agents/timing";
import { useEvents } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { messageOf, pickOption } from "@/components/agents/helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

const SOURCES: SourceKind[] = ["web", "sysmon", "siem", "generic"];
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];
const FLAGS = ["suspicious", "prompt_injection", "quarantined"] as const;

type SourceFilter = SourceKind | "all";
type SeverityFilter = Severity | "all";
type FlagFilter = (typeof FLAGS)[number] | "all";

const SOURCE_FILTERS: SourceFilter[] = ["all", ...SOURCES];
const SEVERITY_FILTERS: SeverityFilter[] = ["all", ...SEVERITIES];
const FLAG_FILTERS: FlagFilter[] = ["all", ...FLAGS];
const FLAG_LABEL: Record<FlagFilter, string> = {
  all: "All flags",
  suspicious: "Suspicious",
  prompt_injection: "Prompt injection",
  quarantined: "Quarantined",
};

function FlagBadge({ flag }: { flag: string }) {
  if (flag === "quarantined") {
    return (
      <Badge tone="red">
        <ShieldAlert aria-hidden className="size-3" />
        Quarantined
      </Badge>
    );
  }
  if (flag === "prompt_injection") {
    return (
      <Badge tone="red">
        <ShieldQuestion aria-hidden className="size-3" />
        Prompt injection
      </Badge>
    );
  }
  if (flag === "suspicious") {
    return (
      <Badge tone="amber">
        <TriangleAlert aria-hidden className="size-3" />
        Suspicious
      </Badge>
    );
  }
  return <Badge tone="muted" mono>{flag}</Badge>;
}

function EvidenceRow({
  event,
  related,
  selected,
  onSelect,
}: {
  event: Event;
  related: string[];
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  function handleKey(key: KeyboardEvent<HTMLTableRowElement>) {
    if (key.key === "Enter" || key.key === " ") {
      key.preventDefault();
      onSelect(event.id);
    }
  }
  return (
    <TableRow
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(event.id)}
      onKeyDown={handleKey}
      className={cn("cursor-pointer", selected && "bg-surface-elevated")}
    >
      <TableCell className={cn("border-l-2 font-mono text-xs text-cyan", selected ? "border-cyan" : "border-transparent")}>
        {event.id}
      </TableCell>
      <TableCell title={event.source_file}>
        <Badge tone="neutral" mono>
          {event.source}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-xs">{event.event_type}</TableCell>
      <TableCell>
        <time
          dateTime={event.ts}
          title={formatTs(event.ts)}
          className="font-mono text-xs whitespace-nowrap text-text-secondary tabular-nums"
        >
          {formatShortTs(event.ts)}
        </time>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-xs text-text-muted" title={`Stored SHA-256 ${event.sha256}`}>
            Hash recorded
          </span>
          {event.flags.length === 0 ? (
            <span className="text-xs text-text-muted">No flags</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {event.flags.map((flag) => (
                <FlagBadge key={flag} flag={flag} />
              ))}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {related.length === 0 ? (
          <span className="text-xs text-text-muted">None</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {related.map((id) => (
              <li key={id}>
                <Badge tone="cyan" mono>
                  {id}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </TableCell>
    </TableRow>
  );
}

interface EvidenceTableProps {
  caseId: string;
  findings: Finding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Search (synced to the `q` URL parameter, debounced), filters, the evidence table and pagination. */
export function EvidenceTable({ caseId, findings, selectedId, onSelect }: EvidenceTableProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [text, setText] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  // A search from the global bar changes the URL while this table is open: follow it.
  if (q !== lastQ) {
    setLastQ(q);
    setText(q);
  }
  const timer = useRef<number | undefined>(undefined);
  const [source, setSource] = useState<SourceFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [flag, setFlag] = useState<FlagFilter>("all");
  const [page, setPage] = useState(0);

  const events = useEvents(caseId, {
    q: q || undefined,
    source: source === "all" ? undefined : source,
    severity: severity === "all" ? undefined : severity,
    flag: flag === "all" ? undefined : flag,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const relatedByEvent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const finding of findings) {
      for (const evidenceId of finding.evidence_ids) {
        map.set(evidenceId, [...(map.get(evidenceId) ?? []), finding.id]);
      }
    }
    return map;
  }, [findings]);

  function handleSearch(value: string) {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPage(0);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set("q", value);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
  }

  const total = events.data?.total ?? 0;
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  const hasNext = (page + 1) * PAGE_SIZE < total;

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_9.5rem_9.5rem_10rem]">
        <Input
          type="search"
          aria-label="Search evidence"
          placeholder="Search logs, hosts, IPs"
          className="min-w-[220px]"
          value={text}
          onChange={(event) => handleSearch(event.target.value)}
        />
        <Select
          value={source}
          onValueChange={(value) => {
            setSource(pickOption(SOURCE_FILTERS, value, "all"));
            setPage(0);
          }}
        >
          <SelectTrigger aria-label="Filter by source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_FILTERS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? "All sources" : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severity}
          onValueChange={(value) => {
            setSeverity(pickOption(SEVERITY_FILTERS, value, "all"));
            setPage(0);
          }}
        >
          <SelectTrigger aria-label="Filter by severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_FILTERS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? "All severities" : severityMeta(option).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={flag}
          onValueChange={(value) => {
            setFlag(pickOption(FLAG_FILTERS, value, "all"));
            setPage(0);
          }}
        >
          <SelectTrigger aria-label="Filter by flag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLAG_FILTERS.map((option) => (
              <SelectItem key={option} value={option}>
                {FLAG_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {events.isError ? (
        <ErrorState
          title="Could not load evidence"
          message={messageOf(events.error)}
          onRetry={() => void events.refetch()}
        />
      ) : events.isPending ? (
        <Table label="Loading evidence events" aria-busy="true" className="min-w-[44rem]">
          <TableBody>
            {Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index}>
                <TableCell colSpan={6}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : total === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="No evidence matches these filters"
          description="Clear the search or the filters to see every event in the case."
        />
      ) : (
        <div className={cn("transition-opacity", events.isPlaceholderData && "opacity-60")}>
          <Table label="Evidence events" className="min-w-[44rem]" aria-busy={events.isPlaceholderData}>
            <TableHeader>
              <tr>
                <TableHead>Evidence ID</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Event type</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Integrity status</TableHead>
                <TableHead>Related finding</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {events.data.items.map((event) => (
                <EvidenceRow
                  key={event.id}
                  event={event}
                  related={relatedByEvent.get(event.id) ?? []}
                  selected={event.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <nav aria-label="Evidence pagination" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-secondary tabular-nums">
          {total === 0 ? "No events" : `Showing ${first}–${last} of ${total.toLocaleString("en-GB")} events`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
            Next
          </Button>
        </div>
      </nav>
    </div>
  );
}
