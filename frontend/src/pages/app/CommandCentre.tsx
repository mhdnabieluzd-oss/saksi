import { Plus, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { AgentActivity } from "@/components/command/AgentActivity";
import { FirstRunPanel } from "@/components/command/FirstRunPanel";
import { IncidentsTable } from "@/components/command/IncidentsTable";
import { MetricsRow } from "@/components/command/MetricsRow";
import {
  AgentDesk,
  deriveAllAgentStates,
} from "@/components/agents/identity";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { useConnectionStatus } from "@/components/layout/connection";
import { useActiveCaseId } from "@/lib/activeCase";
import { useCase, useCases, useLedgerVerify, useOverview, useResponseProposals, useRun } from "@/lib/queries";
import { useCaseStream } from "@/lib/ws";

const RECENT_INCIDENT_LIMIT = 10;

export default function CommandCentre() {
  const overview = useOverview(false);
  const cases = useCases();
  const activeCaseId = useActiveCaseId();
  const conn = useConnectionStatus();

  const list = cases.data;
  const focusCaseId = activeCaseId ?? list?.[0]?.id ?? null;
  const focusCase = list?.find((c) => c.id === focusCaseId) ?? null;

  const caseDetail = useCase(focusCaseId ?? undefined);
  const proposalsQuery = useResponseProposals(focusCaseId ?? undefined);
  const runQuery = useRun(focusCaseId ?? undefined);
  const stream = useCaseStream(focusCaseId ?? undefined);
  const ledgerVerify = useLedgerVerify(focusCaseId ?? undefined);

  const failure = overview.error ?? cases.error;
  if (failure) {
    return (
      <>
        <PageHeader title="Command Centre" />
        <ErrorState
          title="Could not load the Command Centre"
          message={failure.message}
          onRetry={() => {
            void overview.refetch();
            void cases.refetch();
          }}
        />
      </>
    );
  }

  const data = overview.data;
  if (!data || !list) {
    return (
      <>
        <PageHeader title="Command Centre" />
        <div aria-busy="true" className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-36" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const activeRun = stream.run ?? runQuery.data ?? null;
  const agentEvents =
    stream.events.length > 0
      ? stream.events
      : data.recent_agent_events.filter((e) => e.case_id === focusCaseId);
  const agentStates = deriveAllAgentStates(
    activeRun?.agents ?? stream.agents,
    activeRun,
    agentEvents,
    focusCaseId ? stream.link : "live",
    conn.backend,
  );

  return (
    <>
      <PageHeader
        title="Command Centre"
        subtitle="Overview of active cases, agent workflow status, and verified evidence."
        actions={
          <>
            {focusCaseId && (
              <Button asChild variant="secondary">
                <Link to={`/app/cases/${encodeURIComponent(focusCaseId)}`}>
                  Open {focusCaseId}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            )}
            <Button asChild variant="primary">
              <Link to="/app/investigations?new=1">
                <Plus aria-hidden />
                New investigation
              </Link>
            </Button>
          </>
        }
      />

      <MetricsRow overview={data} cases={list} />

      {/* Cortex XSIAM-inspired real-count pipeline flow diagram */}
      <section
        aria-label="Telemetry to Response Pipeline"
        className="mt-4 rounded-lg border border-border bg-surface p-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Autonomous Inquiry → Analyst-Supervised Response Flow
            </h2>
            <p className="text-[11px] text-text-muted">
              Real telemetry counts across {data.cases_total} case{data.cases_total === 1 ? "" : "s"}
              {focusCaseId ? ` (active focus: ${focusCaseId})` : ""}
            </p>
          </div>
          <span className="rounded border border-cyan/30 bg-cyan/10 px-2 py-0.5 font-mono text-[11px] text-cyan">
            Autonomous inquiry · Human-approved response
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {[
            {
              stage: "1. Log Sources",
              count: list.reduce((acc, c) => acc + c.sources.length, 0),
              sub: "Ingested files (SHA-256)",
              to: focusCaseId ? `/app/cases/${encodeURIComponent(focusCaseId)}/evidence` : "/app/investigations",
            },
            {
              stage: "2. Normalised Events",
              count: data.evidence_total,
              sub: `${data.evidence_verified} hash-verified`,
              to: focusCaseId ? `/app/cases/${encodeURIComponent(focusCaseId)}/evidence` : "/app/investigations",
            },
            {
              stage: "3. Detections & Shield",
              count: caseDetail.data?.signals.length ?? 0,
              sub: `${list.reduce((acc, c) => acc + c.shield_alert_count, 0)} injection quarantined`,
              to: focusCaseId ? `/app/cases/${encodeURIComponent(focusCaseId)}?view=shield` : "/app/investigations",
            },
            {
              stage: "4. Verified Findings",
              count: list.reduce((acc, c) => acc + c.verified_count, 0),
              sub: `of ${list.reduce((acc, c) => acc + c.finding_count, 0)} candidate claims`,
              to: focusCaseId ? `/app/cases/${encodeURIComponent(focusCaseId)}?view=findings` : "/app/investigations",
            },
            {
              stage: "5. Response Proposals",
              count: proposalsQuery.data?.length ?? 0,
              sub: `${proposalsQuery.data?.filter((p) => p.status === "pending_approval").length ?? 0} awaiting analyst approval`,
              to: focusCaseId ? `/app/cases/${encodeURIComponent(focusCaseId)}?view=responses` : "/app/investigations",
            },
          ].map((stepItem, i) => (
            <Link
              key={stepItem.stage}
              to={stepItem.to}
              className="group relative flex flex-col justify-between rounded-md border border-border bg-surface-elevated/60 p-3 transition-colors hover:border-cyan/60"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-medium text-text-secondary group-hover:text-cyan">
                  {stepItem.stage}
                </span>
                {i < 4 && (
                  <ArrowRight aria-hidden className="hidden size-3.5 text-text-muted/60 sm:inline" />
                )}
              </div>
              <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-text">
                {stepItem.count.toLocaleString()}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-text-muted">{stepItem.sub}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-4">
        <AgentDesk
          caseId={focusCaseId}
          caseTitle={focusCase?.title}
          states={agentStates}
          quarantineCount={focusCase?.shield_alert_count ?? 0}
          verifiedCount={focusCase?.verified_count ?? 0}
          sealed={Boolean(ledgerVerify.data?.signature.valid)}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="recent-incidents" className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-incidents" className="text-sm font-semibold text-text">
              Recent Cases ({list.length})
            </h2>
            <Link to="/app/investigations" className="text-xs font-medium text-cyan hover:underline">
              View all cases
            </Link>
          </div>
          {list.length === 0 ? (
            <FirstRunPanel />
          ) : (
            <IncidentsTable cases={list.slice(0, RECENT_INCIDENT_LIMIT)} />
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card title="Recent Activity">
            <AgentActivity events={data.recent_agent_events} />
          </Card>
        </aside>
      </div>
    </>
  );
}
