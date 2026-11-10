import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CasesTable } from "@/components/investigations/CasesTable";
import { NewInvestigationPanel } from "@/components/investigations/NewInvestigationPanel";
import { caseStatusMeta } from "@/components/investigations/caseStatus";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCases, useOverview } from "@/lib/queries";
import type { CaseStatus, Severity, SourceKind } from "@/lib/types";

const STATUS_OPTIONS: CaseStatus[] = ["new", "running", "completed", "failed"];
const SEVERITY_OPTIONS: Severity[] = ["critical", "high", "medium", "low", "info"];
const SOURCE_OPTIONS: SourceKind[] = ["web", "sysmon", "siem", "generic"];
const SEVERITY_RANK: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

type SortKey = "newest" | "severity" | "events" | "findings";

export default function Investigations() {
  const [params] = useSearchParams();
  const cases = useCases();
  const overview = useOverview(false);
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CaseStatus>("all");
  const [severity, setSeverity] = useState<"all" | Severity>("all");
  const [source, setSource] = useState<"all" | SourceKind>("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  const list = cases.data;
  const requestedNew = params.get("new") === "1";
  const showPanel = panelOpen ?? (requestedNew || list?.length === 0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = (list ?? []).filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (severity !== "all" && c.severity !== severity) return false;
      if (source !== "all" && !c.sources.some((s) => s.kind === source)) return false;
      if (
        needle !== "" &&
        !c.id.toLowerCase().includes(needle) &&
        !c.title.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sortBy === "severity") {
        const diff = (SEVERITY_RANK[b.severity ?? ""] ?? 0) - (SEVERITY_RANK[a.severity ?? ""] ?? 0);
        if (diff !== 0) return diff;
      } else if (sortBy === "events") {
        if (b.event_count !== a.event_count) return b.event_count - a.event_count;
      } else if (sortBy === "findings") {
        if (b.verified_count !== a.verified_count) return b.verified_count - a.verified_count;
      }
      return b.created_at.localeCompare(a.created_at);
    });
  }, [list, query, status, severity, source, sortBy]);

  const hasActiveFilters =
    query.trim() !== "" || status !== "all" || severity !== "all" || source !== "all";

  return (
    <>
      <PageHeader
        title="Investigations"
        subtitle="Create a new investigation from sample scenario logs or upload your own log files."
        actions={
          <Button
            variant="primary"
            aria-expanded={showPanel}
            aria-controls="new-investigation-panel"
            onClick={() => setPanelOpen(!showPanel)}
          >
            {showPanel ? "Close panel" : "New investigation"}
          </Button>
        }
      />

      {showPanel && (
        <div id="new-investigation-panel" className="mb-6">
          <NewInvestigationPanel />
        </div>
      )}

      {cases.isError ? (
        <ErrorState message={cases.error.message} onRetry={() => void cases.refetch()} />
      ) : !list ? (
        <div aria-busy="true" className="grid gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-48" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="No investigations yet" description="Create one above to see it listed here." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1 sm:max-w-xs">
              <label htmlFor="case-filter" className="sr-only">
                Filter investigations by ID or title
              </label>
              <Input
                id="case-filter"
                type="search"
                placeholder="Search by case ID or title…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <Select value={status} onValueChange={(value) => setStatus(value as "all" | CaseStatus)}>
              <SelectTrigger aria-label="Filter by status" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {caseStatusMeta(option).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={severity} onValueChange={(value) => setSeverity(value as "all" | Severity)}>
              <SelectTrigger aria-label="Filter by severity" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {SEVERITY_OPTIONS.map((sev) => (
                  <SelectItem key={sev} value={sev}>
                    Severity: {sev}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={source} onValueChange={(value) => setSource(value as "all" | SourceKind)}>
              <SelectTrigger aria-label="Filter by telemetry source" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {SOURCE_OPTIONS.map((src) => (
                  <SelectItem key={src} value={src}>
                    Source: {src.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
              <SelectTrigger aria-label="Sort investigations" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Sort: Newest first</SelectItem>
                <SelectItem value="severity">Sort: Highest severity</SelectItem>
                <SelectItem value="findings">Sort: Verified findings</SelectItem>
                <SelectItem value="events">Sort: Event count</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setSeverity("all");
                  setSource("all");
                }}
              >
                Reset filters
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No cases match these filters"
              description="Clear or adjust the status, severity, or source filters."
            />
          ) : (
            <>
              <p className="mb-2 text-xs text-text-secondary">
                Showing {filtered.length} of {list.length} cases
              </p>
              <CasesTable
                cases={filtered}
                recentEvents={overview.data?.recent_agent_events ?? []}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
