import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import { toast } from "sonner";
import { useActiveCaseId } from "@/lib/activeCase";
import { useCase, useOverview, useRun } from "@/lib/queries";
import { useSharedCaseStream } from "@/lib/caseStream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import {
  AgentPresenceStrip,
  deriveAllAgentStates,
} from "@/components/agents/identity";
import { useConnectionStatus } from "./connection";
import { AnalystAvatar } from "./AnalystAvatar";
import { useAnalystName } from "./useAnalystName";
import { NotificationBell } from "./NotificationBell";

function WorkspaceLabel({ caseId }: { caseId: string | null }) {
  const caseQuery = useCase(caseId ?? undefined);
  if (!caseId) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <span>No active case</span>
        <Link to="/app/investigations" className="text-cyan hover:underline">
          Select case
        </Link>
      </div>
    );
  }
  const summary = caseQuery.data?.summary;
  return (
    <Link
      to={`/app/cases/${encodeURIComponent(caseId)}`}
      className="flex min-w-0 items-baseline gap-2 rounded-sm hover:opacity-90"
    >
      <span className="shrink-0 font-mono text-xs font-medium text-cyan">{caseId}</span>
      {summary ? (
        <>
          <span className="truncate text-sm font-medium text-text">{summary.title}</span>
          <span className="hidden rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-secondary lg:inline">
            {summary.classification}
          </span>
        </>
      ) : caseQuery.isError ? (
        <span className="truncate text-sm text-text-muted">Details unavailable</span>
      ) : (
        <Skeleton className="h-4 w-40" />
      )}
    </Link>
  );
}

function BackendRunningBadge() {
  return (
    <div
      role="status"
      aria-label="Backend running"
      className="hidden items-center gap-2 rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-text-secondary md:flex"
    >
      <StatusDot tone="ok" label="Backend running" />
    </div>
  );
}

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const navigate = useNavigate();
  const activeCaseId = useActiveCaseId();
  const overview = useOverview(false);
  const runQuery = useRun(activeCaseId ?? undefined);
  const stream = useSharedCaseStream(activeCaseId ?? undefined);
  const conn = useConnectionStatus();
  const analystName = useAnalystName();
  const [search, setSearch] = useState("");

  const activeRun = stream.run ?? runQuery.data ?? null;
  const agentStates = deriveAllAgentStates(
    activeRun?.agents ?? stream.agents,
    activeRun,
    stream.events,
    stream.link,
    conn.backend,
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    if (!activeCaseId) {
      toast.info("Open an investigation to search its evidence.");
      return;
    }
    navigate(`/app/cases/${encodeURIComponent(activeCaseId)}/evidence?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-5">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={onOpenMobileNav}>
        <Menu />
      </Button>

      <div className="min-w-0 flex-1">
        <WorkspaceLabel caseId={activeCaseId} />
      </div>

      {activeCaseId && (
        <div className="hidden xl:block">
          <AgentPresenceStrip caseId={activeCaseId} states={agentStates} compact />
        </div>
      )}

      <form role="search" onSubmit={handleSearch} className="w-36 shrink-0 sm:w-56">
        <label htmlFor="global-search" className="sr-only">
          Search evidence in the open investigation
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            id="global-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search case evidence…"
            className="h-8 pl-9 text-xs"
          />
        </div>
      </form>

      <NotificationBell events={overview.data?.recent_agent_events ?? []} />
      <BackendRunningBadge />

      <Link
        to="/app/settings"
        aria-label={`Profile and settings, ${analystName}`}
        className="rounded-full transition-opacity hover:opacity-90"
      >
        <AnalystAvatar />
      </Link>
    </header>
  );
}
