import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bot,
  FileCheck2,
  FlaskConical,
  Network,
  PanelLeft,
  Play,
  Route,
  Shield,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { CaseStatus, FindingStatus, NodeKind } from "@/lib/types";
import { formatBytes, severityMeta } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { useCaseFocus, type WorkspaceView as FocusView } from "@/lib/caseFocus";
import {
  useCase,
  useGraph,
  usePlans,
  useResponseProposals,
  useRun,
  useSelfTest,
  useStartRun,
  useToolRegistry,
} from "@/lib/queries";
import { useCaseStream } from "@/lib/ws";
import { PageHeader } from "@/components/layout/PageHeader";
import { AgentPresenceStrip, deriveAllAgentStates } from "@/components/agents/identity";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Hash } from "@/components/ui/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Timestamp } from "@/components/ui/timestamp";
import { InvestigationPlanMap } from "@/components/agents/InvestigationPlanMap";
import { AttackGraph } from "@/components/graph/AttackGraph";
import { EntityDetails } from "@/components/graph/EntityDetails";
import { KindToggles } from "@/components/graph/KindToggles";
import { FindingsList } from "@/components/findings/FindingsList";
import { ShieldAlerts } from "@/components/findings/ShieldAlerts";
import { ResponseQueuePanel } from "@/components/response/ResponseQueuePanel";
import { cn } from "@/lib/utils";

type Tab = "findings" | "responses" | "shield";
type FindingFilter = FindingStatus | "all";

const STATUS_LABEL: Record<CaseStatus, string> = {
  new: "New",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};
const STATUS_TONE: Record<CaseStatus, "neutral" | "cyan" | "green" | "red"> = {
  new: "neutral",
  running: "cyan",
  completed: "green",
  failed: "red",
};
const FILTERS: { value: FindingFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
  { value: "rejected", label: "Rejected" },
];
const NO_IDS: string[] = [];
const COLUMNS_OPEN = "lg:grid-cols-[260px_minmax(0,1fr)_320px]";
const COLUMNS_CLOSED = "lg:grid-cols-[minmax(0,1fr)_320px]";

/** Route /app/cases/:caseId. Keyed by case so selection and filters reset when the case changes. */
export default function InvestigationWorkspace() {
  const { caseId = "" } = useParams();
  return <WorkspaceView key={caseId} caseId={caseId} />;
}

function WorkspaceView({ caseId }: { caseId: string }) {
  const { focus, updateFocus } = useCaseFocus();
  const caseQuery = useCase(caseId);
  const graphQuery = useGraph(caseId);
  const plansQuery = usePlans(caseId);
  const toolsQuery = useToolRegistry();
  const proposalsQuery = useResponseProposals(caseId);
  const runQuery = useRun(caseId);
  const stream = useCaseStream(caseId);
  const startRun = useStartRun(caseId);
  const selfTest = useSelfTest(caseId);

  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<NodeKind>>(() => new Set<NodeKind>());
  const [statusFilter, setStatusFilter] = useState<FindingFilter>("all");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedTactic, setSelectedTactic] = useState<string | null>(null);
  const [lowerTab, setLowerTab] = useState<Tab>("findings");
  const [contextOpen, setContextOpen] = useState(() => window.matchMedia("(min-width: 1600px)").matches);

  const activeView: FocusView = focus.view ?? "map";
  const selectedNodeId = focus.entityId;
  const activeFindingId = focus.findingId;
  const selectedTaskId = focus.taskId;

  const detail = caseQuery.data;
  const graph = graphQuery.data;
  const run = stream.run ?? runQuery.data ?? null;
  const running = detail?.summary.status === "running" || run?.state === "running";

  const derivedAgents = useMemo(
    () => deriveAllAgentStates(stream.agents, run, stream.events),
    [stream.agents, run, stream.events],
  );

  const tactics = useMemo(() => {
    if (!detail) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const f of detail.findings) {
      if (f.status !== "rejected" && f.tactic && !seen.has(f.tactic)) {
        seen.add(f.tactic);
        list.push(f.tactic);
      }
    }
    return list;
  }, [detail]);

  const activeFinding = detail?.findings.find((finding) => finding.id === activeFindingId);
  const focusNodeIds = useMemo(() => {
    if (!graph) return NO_IDS;
    if (activeFinding) {
      const evidence = new Set(activeFinding.evidence_ids);
      const entities = new Set(activeFinding.entities);
      return graph.nodes
        .filter((node) => entities.has(node.id) || node.event_ids.some((id) => evidence.has(id)))
        .map((node) => node.id);
    }
    if (selectedTactic && detail) {
      const tacticFindings = detail.findings.filter((f) => f.tactic === selectedTactic && f.status !== "rejected");
      const evidence = new Set(tacticFindings.flatMap((f) => f.evidence_ids));
      const entities = new Set(tacticFindings.flatMap((f) => f.entities));
      return graph.nodes
        .filter((node) => entities.has(node.id) || node.event_ids.some((id) => evidence.has(id)))
        .map((node) => node.id);
    }
    return NO_IDS;
  }, [graph, activeFinding, selectedTactic, detail]);

  const focusEdgeIds = useMemo(() => {
    if (!graph) return NO_IDS;
    if (activeFinding) {
      const evidence = new Set(activeFinding.evidence_ids);
      return graph.edges.filter((edge) => edge.event_ids.some((id) => evidence.has(id))).map((edge) => edge.id);
    }
    if (selectedTactic && detail) {
      const tacticFindings = detail.findings.filter((f) => f.tactic === selectedTactic && f.status !== "rejected");
      const evidence = new Set(tacticFindings.flatMap((f) => f.evidence_ids));
      return graph.edges.filter((edge) => edge.event_ids.some((id) => evidence.has(id))).map((edge) => edge.id);
    }
    return NO_IDS;
  }, [graph, activeFinding, selectedTactic, detail]);

  if (caseQuery.isPending) return <WorkspaceSkeleton />;
  if (caseQuery.isError || !detail) {
    return (
      <>
        <PageHeader title="Investigation Workspace" />
        <ErrorState
          title="Could not load this case"
          message={caseQuery.error instanceof Error ? caseQuery.error.message : "Unknown error"}
          onRetry={() => void caseQuery.refetch()}
        />
      </>
    );
  }

  const { summary, stats, findings } = detail;
  const canStart = !running && (summary.status === "new" || summary.status === "failed");
  const graphMissing = graphQuery.error instanceof ApiError && graphQuery.error.status === 404;
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = graph?.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  function setView(nextView: FocusView) {
    updateFocus({ view: nextView });
    if (nextView === "findings" || nextView === "responses" || nextView === "shield") {
      setLowerTab(nextView);
    }
  }

  function selectNode(id: string | null) {
    setSelectedEdgeId(null);
    updateFocus({ entityId: id, findingId: id !== null ? null : activeFindingId });
  }

  function selectEdge(id: string | null) {
    setSelectedEdgeId(id);
    if (id !== null) updateFocus({ entityId: null });
  }

  function toggleFinding(id: string) {
    updateFocus({ findingId: activeFindingId === id ? null : id });
  }

  function openFinding(id: string) {
    setLowerTab("findings");
    updateFocus({ findingId: id });
  }

  const startButton: ReactNode = canStart ? (
    <Button variant="primary" onClick={() => startRun.mutate()} disabled={startRun.isPending}>
      <Play aria-hidden />
      {startRun.isPending ? "Starting..." : "Start investigation"}
    </Button>
  ) : null;

  let graphArea: ReactNode;
  if (graph) {
    graphArea = (
      <AttackGraph
        graph={graph}
        highlightNodeIds={focusNodeIds}
        highlightEdgeIds={focusEdgeIds}
        selectedNodeId={selectedNodeId}
        onSelectNode={selectNode}
        selectedEdgeId={selectedEdgeId}
        onSelectEdge={selectEdge}
        hiddenKinds={hiddenKinds}
        onHiddenKindsChange={setHiddenKinds}
        height={480}
        toolbarExtra={
          <Button variant="secondary" size="sm" aria-pressed={contextOpen} onClick={() => setContextOpen((open) => !open)}>
            <PanelLeft aria-hidden />
            Context
          </Button>
        }
      />
    );
  } else if (graphMissing) {
    graphArea = (
      <EmptyState
        icon={Network}
        title={running ? "Investigation in progress" : "Run the investigation to build the attack graph"}
        description={running ? "The graph appears when the run completes." : undefined}
        action={
          startButton ?? (
            <Button asChild variant="secondary">
              <Link to={`/app/cases/${caseId}/agents`}>
                <Bot aria-hidden />
                View agents
              </Link>
            </Button>
          )
        }
      />
    );
  } else if (graphQuery.isError) {
    graphArea = (
      <ErrorState
        title="Could not load the attack graph"
        message={graphQuery.error instanceof Error ? graphQuery.error.message : "Unknown error"}
        onRetry={() => void graphQuery.refetch()}
      />
    );
  } else {
    graphArea = (
      <div aria-busy="true" aria-label="Loading attack graph">
        <Skeleton className="h-[580px] w-full" />
      </div>
    );
  }

  const effectiveLowerTab: Tab =
    activeView === "findings" || activeView === "responses" || activeView === "shield" ? activeView : lowerTab;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Investigations", to: "/app/investigations" }, { label: summary.title }]}
        title={summary.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-cyan">{summary.id}</span>
            <Badge tone={STATUS_TONE[summary.status]}>{STATUS_LABEL[summary.status]}</Badge>
            {summary.severity ? (
              <StatusBadge meta={severityMeta(summary.severity)} />
            ) : (
              <Badge tone="muted">Severity pending</Badge>
            )}
            <Badge tone="neutral">{summary.classification}</Badge>
            {summary.scenario && (
              <Badge tone="amber">
                <FlaskConical aria-hidden className="size-3.5" />
                Simulated scenario
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            {startButton}
            <Button asChild variant="outline">
              <Link to={`/app/cases/${caseId}/agents`}>
                <Bot aria-hidden />
                View agents
              </Link>
            </Button>
            {summary.status === "completed" && (
              <Button asChild variant="secondary">
                <Link to={`/app/cases/${caseId}/story`}>
                  <Route aria-hidden />
                  Replay attack story
                </Link>
              </Button>
            )}
          </>
        }
      />

      {startRun.isSuccess && (
        <p role="status" className="mb-4 text-xs text-green">
          Investigation started. Follow the agents in Agent Operations.
        </p>
      )}
      {startRun.isError && (
        <p role="alert" className="mb-4 text-xs text-red">
          Could not start the investigation: {startRun.error.message}
        </p>
      )}
      {running && (
        <div className="mb-4">
          <AgentPresenceStrip caseId={caseId} states={derivedAgents} compact={false} />
        </div>
      )}
      {run?.state === "failed" && run.error !== null && (
        <div className="mb-4">
          <ErrorState title="Investigation failed" message={run.error} />
        </div>
      )}

      <div className={cn("mt-4 grid gap-4", contextOpen ? COLUMNS_OPEN : COLUMNS_CLOSED)}>
        {contextOpen && (
          <aside aria-label="Investigation context" className="min-w-0 space-y-4">
            <Card title="Case">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-xs text-text-secondary">Created</dt>
                <dd>
                  <Timestamp iso={summary.created_at} />
                </dd>
                <dt className="text-xs text-text-secondary">Time span</dt>
                <dd>
                  {stats.time_start && stats.time_end ? (
                    <span className="flex flex-col gap-0.5">
                      <Timestamp iso={stats.time_start} />
                      <Timestamp iso={stats.time_end} />
                    </span>
                  ) : (
                    "-"
                  )}
                </dd>
                <dt className="text-xs text-text-secondary">Events</dt>
                <dd className="font-mono tabular-nums">{summary.event_count}</dd>
                <dt className="text-xs text-text-secondary">Verified</dt>
                <dd className="tabular-nums">
                  {summary.verified_count} of {summary.finding_count}
                </dd>
                <dt className="text-xs text-text-secondary">Shield alerts</dt>
                <dd className="tabular-nums">{summary.shield_alert_count}</dd>
              </dl>
            </Card>

            <Card title="Log sources">
              {summary.sources.length > 0 ? (
                <ul className="space-y-3">
                  {summary.sources.map((source) => (
                    <li key={`${source.name}-${source.sha256}`} className="min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm text-text" title={source.name}>
                          {source.name}
                        </span>
                        <Badge tone="muted" mono>
                          {source.kind}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-secondary tabular-nums">
                        {source.event_count} events, {formatBytes(source.size_bytes)}
                      </p>
                      <Hash value={source.sha256} n={12} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-muted">No log sources.</p>
              )}
            </Card>

            <Card title="Entities discovered" description="Toggle a kind to show or hide it in the graph.">
              {graph ? (
                <KindToggles nodes={graph.nodes} hidden={hiddenKinds} onChange={setHiddenKinds} />
              ) : (
                <p className="text-xs text-text-muted">Available when the investigation completes.</p>
              )}
            </Card>

            <Card title="Filters" description="Finding status filters the findings list.">
              <div role="group" aria-label="Finding status" className="grid grid-cols-2 gap-1.5">
                {FILTERS.map((filter) => (
                  <Button
                    key={filter.value}
                    variant="outline"
                    size="sm"
                    aria-pressed={statusFilter === filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn("justify-start", statusFilter === filter.value && "border-cyan text-cyan")}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
            </Card>

            <Card title="Triage scope">
              <p className="text-sm leading-relaxed text-text-secondary">{detail.scope || "No scope recorded."}</p>
            </Card>
          </aside>
        )}

        <div className="min-w-0 space-y-4">
          {/* Primary Workspace Mode Bar (?view=map|plan|findings|responses|shield) + Tactic Ribbon */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-3.5 py-2.5">
            <div role="group" aria-label="Investigation workspace view" className="flex flex-wrap items-center gap-1.5">
              <Button
                variant={activeView === "map" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setView("map")}
              >
                <Network className="size-3.5" />
                Evidence Map
              </Button>
              <Button
                variant={activeView === "plan" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setView("plan")}
              >
                <Sparkles className="size-3.5" />
                Investigation Plan
              </Button>
              <Button
                variant={activeView === "findings" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setView("findings")}
              >
                <FileCheck2 className="size-3.5" />
                Findings ({findings.length})
              </Button>
              <Button
                variant={activeView === "responses" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setView("responses")}
              >
                <Shield className="size-3.5" />
                Response Actions ({proposalsQuery.data?.length ?? 0})
              </Button>
              <Button
                variant={activeView === "shield" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setView("shield")}
              >
                <ShieldAlert className="size-3.5" />
                AI Shield ({detail.shield_alerts.length})
              </Button>
            </div>

            {activeView === "map" && tactics.length > 0 && (
              <div role="group" aria-label="Attack stage filter" className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedTactic(null)}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-colors",
                    selectedTactic === null
                      ? "border border-cyan/40 bg-cyan/15 text-cyan"
                      : "text-text-secondary hover:text-text",
                  )}
                >
                  All stages
                </button>
                {tactics.map((tactic) => (
                  <button
                    key={tactic}
                    type="button"
                    onClick={() => setSelectedTactic((cur) => (cur === tactic ? null : tactic))}
                    className={cn(
                      "rounded px-2 py-1 text-xs transition-colors",
                      selectedTactic === tactic
                        ? "border border-cyan/40 bg-cyan/15 font-semibold text-cyan"
                        : "text-text-secondary hover:text-text",
                    )}
                  >
                    {tactic}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeView === "plan" ? (
            <InvestigationPlanMap
              caseId={caseId}
              plans={plansQuery.data ?? []}
              tools={toolsQuery.data ?? []}
              selectedTaskId={selectedTaskId}
              onSelectTask={(tid) => updateFocus({ taskId: tid })}
            />
          ) : activeView === "map" ? (
            graphArea
          ) : null}

          <Tabs
            value={effectiveLowerTab}
            onValueChange={(value) => {
              const next = value === "shield" ? "shield" : value === "responses" ? "responses" : "findings";
              setLowerTab(next);
              if (activeView === "findings" || activeView === "responses" || activeView === "shield") {
                updateFocus({ view: next });
              }
            }}
          >
            <TabsList aria-label="Investigation views">
              <TabsTrigger value="findings">
                Findings
                <Badge tone="muted" mono>
                  {findings.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="responses">
                <Shield className="size-3.5 text-cyan" />
                Response Actions
                <Badge tone="amber" mono>
                  {proposalsQuery.data?.length ?? 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="shield">
                AI Shield
                <Badge tone="muted" mono>
                  {detail.shield_alerts.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="findings">
              <FindingsList
                caseId={caseId}
                findings={findings}
                statusFilter={statusFilter}
                activeFindingId={activeFindingId}
                onToggleFinding={toggleFinding}
                selfTest={{
                  finding: selfTest.data ?? null,
                  pending: selfTest.isPending,
                  error: selfTest.error?.message ?? null,
                  onRun: () => selfTest.mutate(),
                }}
              />
            </TabsContent>
            <TabsContent value="responses">
              <ResponseQueuePanel caseId={caseId} />
            </TabsContent>
            <TabsContent value="shield">
              <ShieldAlerts caseId={caseId} alerts={detail.shield_alerts} />
            </TabsContent>
          </Tabs>
        </div>

        <aside aria-label="Entity details" className="min-w-0">
          <Card title={selectedEdge && !selectedNode ? "Relationship details" : "Entity details"}>
            <EntityDetails
              caseId={caseId}
              node={selectedNode}
              edge={selectedEdge}
              graph={graph}
              findings={findings}
              onSelectNode={(id) => selectNode(id)}
              onOpenFinding={openFinding}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}

function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading investigation" className="space-y-4">
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-4 w-96" />
      <div className={cn("grid gap-4", COLUMNS_OPEN)}>
        <Skeleton className="h-96" />
        <Skeleton className="h-[580px]" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
