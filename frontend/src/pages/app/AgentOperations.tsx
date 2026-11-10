import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Ban, Bot, Play, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { AgentName, AgentStatus, ToolRiskTier } from "@/lib/types";
import { agentStateMeta } from "@/lib/format";
import {
  useCase,
  useLedger,
  usePauseRun,
  usePlans,
  useResumeRun,
  useRun,
  useStartRun,
  useStopRun,
  useTestToolRequest,
  useToolRegistry,
} from "@/lib/queries";
import { useCaseStream } from "@/lib/ws";
import { PageHeader } from "@/components/layout/PageHeader";
import { AgentDesk, deriveAllAgentStates } from "@/components/agents/identity";
import { ActivityLog } from "@/components/agents/ActivityLog";
import { ExecutionTimeline } from "@/components/agents/ExecutionTimeline";
import { InvestigationPlanMap } from "@/components/agents/InvestigationPlanMap";
import { RunControl } from "@/components/agents/RunControl";
import { RunSummary } from "@/components/agents/RunSummary";
import { ToolExecutions } from "@/components/agents/ToolExecutions";
import { WarningsList } from "@/components/agents/WarningsList";
import { AGENT_INFO, AGENT_ORDER } from "@/components/agents/meta";
import { messageOf } from "@/components/agents/helpers";
import { useNow } from "@/components/agents/timing";
import { useTransitionAnnouncement } from "@/components/agents/useTransitionAnnouncement";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Timestamp } from "@/components/ui/timestamp";

const idleStatus = (name: AgentName): AgentStatus => ({
  name,
  state: "idle",
  current_task: "",
  progress: 0,
  started_at: null,
  finished_at: null,
  output_summary: "",
});

/** Agent statuses from a REST run, with every agent that is missing from it shown as idle. */
function agentRecord(statuses: AgentStatus[] = []): Record<AgentName, AgentStatus> {
  const record: Record<AgentName, AgentStatus> = {
    triage: idleStatus("triage"),
    investigator: idleStatus("investigator"),
    verifier: idleStatus("verifier"),
    reporter: idleStatus("reporter"),
  };
  for (const status of statuses) record[status.name] = status;
  return record;
}

function riskTierTone(tier: ToolRiskTier): "neutral" | "amber" | "red" {
  if (tier === "response_live") return "red";
  if (tier === "elevated_read" || tier === "response_sim") return "amber";
  return "neutral";
}

export default function AgentOperations() {
  const { caseId } = useParams();
  const id = caseId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "activity";

  const caseQuery = useCase(id);
  const runQuery = useRun(id);
  const plansQuery = usePlans(id);
  const toolsQuery = useToolRegistry();
  const ledgerQuery = useLedger(id);
  const stream = useCaseStream(id);
  const start = useStartRun(id);
  const pause = usePauseRun(id);
  const resume = useResumeRun(id);
  const stop = useStopRun(id);
  const testTool = useTestToolRequest(id);

  const run = stream.run ?? runQuery.data ?? null;
  const agents = stream.run ? stream.agents : agentRecord(runQuery.data?.agents);
  const running = run?.state === "running";
  const now = useNow(running);
  const hasRun = run !== null && run.state !== "idle";
  const loading = run === null && runQuery.isPending;
  const issues = useMemo(
    () => stream.events.filter((event) => event.kind === "warning" || event.kind === "error"),
    [stream.events],
  );

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const derivedAgents = useMemo(
    () => deriveAllAgentStates(agents, run, stream.events),
    [agents, run, stream.events],
  );

  const blockedLedgerEntries = useMemo(
    () => (ledgerQuery.data ?? []).filter((e) => e.kind === "TOOL_BLOCKED"),
    [ledgerQuery.data],
  );

  const announcement = useTransitionAnnouncement({
    Investigation: agentStateMeta(run?.state ?? "idle").label,
    ...Object.fromEntries(
      AGENT_ORDER.map((name): [string, string] => [AGENT_INFO[name].short, agentStateMeta(agents[name].state).label]),
    ),
  });

  function setTab(next: string) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "activity") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  }

  function startInvestigation() {
    start.mutate(undefined, {
      onSuccess: () => toast.success("Investigation started"),
      onError: (error) => toast.error(messageOf(error)),
    });
  }

  function handleTestBlockedTool() {
    testTool.mutate(
      {
        tool_name: "exec_shell",
        arguments: { host: "FS-LOGISTIK-01", cmd: "netsh advfirewall set allprofiles state on" },
        analyst: "analyst:self_test",
        test: true,
      },
      {
        onSuccess: (res) => {
          if (!res.allowed) {
            toast.warning(`Policy Gate self-test blocked 'exec_shell': ${res.reason}`);
          } else {
            toast.info("Tool request validated");
          }
          void plansQuery.refetch();
          void ledgerQuery.refetch();
        },
        onError: (error) => toast.error(messageOf(error)),
      },
    );
  }

  return (
    <>
      <PageHeader
        title={caseQuery.data?.summary.title ?? "Agent Operations"}
        subtitle={
          <>
            Four-agent workflow and tool log for <span className="font-mono text-cyan">{id}</span>
          </>
        }
        breadcrumbs={[
          { label: "Investigations", to: "/app/investigations" },
          { label: id, to: `/app/cases/${id}` },
          { label: "Agent Operations" },
        ]}
        actions={
          <RunControl
            run={run}
            starting={start.isPending}
            onStart={startInvestigation}
            onPause={() => pause.mutate(undefined, { onSuccess: () => toast.info("Investigation paused") })}
            onResume={() => resume.mutate(undefined, { onSuccess: () => toast.success("Investigation resumed") })}
            onStop={() => stop.mutate(undefined, { onSuccess: () => toast.warning("Investigation stopped") })}
          />
        }
      />

      <div className="space-y-4">
        {caseQuery.isError && (
          <ErrorState
            title="Could not load the investigation"
            message={messageOf(caseQuery.error)}
            onRetry={() => void caseQuery.refetch()}
          />
        )}
        {run === null && runQuery.isError && (
          <ErrorState
            title="Could not load agent status"
            message={messageOf(runQuery.error)}
            onRetry={() => void runQuery.refetch()}
          />
        )}
        {run?.state === "failed" && (
          <ErrorState
            title="Investigation failed"
            message={run.error ?? "The pipeline stopped before it finished."}
            onRetry={startInvestigation}
          />
        )}

        {loading ? (
          <Spinner label="Loading agent status" />
        ) : (
          <>
            <RunSummary run={run} now={now} connected={stream.connected} />

            {/* 4-Agent Identity Desk (Triage, Investigator, Verifier, Reporter — no fake percentage bars) */}
            <AgentDesk
              caseId={id}
              caseTitle={caseQuery.data?.summary.title}
              states={derivedAgents}
              showOperationsLink={false}
            />

            {/* Autonomous Investigation Plan */}
            {plans.length > 0 && (
              <InvestigationPlanMap
                caseId={id}
                plans={plans}
                tools={toolsQuery.data ?? []}
              />
            )}

            {hasRun || activeTab === "registry" ? (
              <Tabs value={activeTab} onValueChange={setTab}>
                <TabsList aria-label="Agent operations views">
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="tools">Tool Calls</TabsTrigger>
                  <TabsTrigger value="registry">
                    <Wrench className="size-3.5" />
                    Allowed Tools
                    <Badge tone="cyan" mono>
                      {toolsQuery.data?.length ?? 8}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="issues">
                    Warnings
                    <Badge tone={issues.length > 0 ? "amber" : "muted"} mono>
                      {issues.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="activity">
                  <ActivityLog caseId={id} events={stream.events} />
                </TabsContent>
                <TabsContent value="tools">
                  <ToolExecutions events={stream.events} />
                </TabsContent>
                <TabsContent value="registry">
                  <div className="space-y-4">
                    <Card
                      title="Typed Tool Registry & Policy Gate"
                      description="The Autonomous Investigator can request capabilities from this allow-listed registry only. Every request is validated for schema, result limits, and loop safety before execution; unapproved tools are denied and recorded as TOOL_BLOCKED in the custody ledger."
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleTestBlockedTool}
                          disabled={testTool.isPending}
                          title="Submit a synthetic unauthorized tool request (exec_shell) tagged as analyst:self_test to verify the Policy Gate blocks it"
                        >
                          <Ban className="size-3.5 text-red" />
                          {testTool.isPending ? "Running self-test..." : "Test policy gate (self-test)"}
                        </Button>
                      }
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border text-text-muted">
                              <th className="py-2 pr-4 font-medium">Tool Name</th>
                              <th className="py-2 pr-4 font-medium">Capability Class</th>
                              <th className="py-2 pr-4 font-medium">Risk Tier</th>
                              <th className="py-2 pr-4 font-medium">Approval Policy</th>
                              <th className="py-2 pr-4 font-medium">Limits</th>
                              <th className="py-2 font-medium">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {(toolsQuery.data ?? []).map((tool) => (
                              <tr key={tool.name}>
                                <td className="py-2.5 pr-4 font-mono font-semibold text-cyan">{tool.name}</td>
                                <td className="py-2.5 pr-4 font-mono text-text-secondary">{tool.capability_class}</td>
                                <td className="py-2.5 pr-4">
                                  <Badge tone={riskTierTone(tool.risk_tier)} mono>
                                    {tool.risk_tier}
                                  </Badge>
                                </td>
                                <td className="py-2.5 pr-4">
                                  {tool.requires_approval ? (
                                    <Badge tone="amber">Analyst approval required</Badge>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-green">
                                      <ShieldCheck className="size-3.5" /> Read-only allow-listed
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-4 font-mono text-text-muted tabular-nums">
                                  max {tool.max_results} · {tool.timeout_seconds}s
                                </td>
                                <td className="py-2.5 text-text-secondary">{tool.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    <Card
                      title={`Policy Gate Denials (TOOL_BLOCKED: ${blockedLedgerEntries.length})`}
                      description="Audit log of unauthorized or out-of-policy tool requests rejected by the Tool Broker."
                    >
                      {blockedLedgerEntries.length === 0 ? (
                        <p className="text-xs text-text-muted">
                          No tool requests have been blocked on this case. Use &ldquo;Test policy gate (self-test)&rdquo;
                          above to verify the gate against an unauthorized <span className="font-mono">exec_shell</span>{" "}
                          request.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border text-xs">
                          {blockedLedgerEntries.map((entry) => (
                            <li key={entry.seq} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                              <div className="space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    to={`/app/cases/${id}/evidence?tab=ledger&seq=${entry.seq}`}
                                    className="font-mono font-semibold text-cyan hover:underline"
                                  >
                                    Ledger #{entry.seq}
                                  </Link>
                                  <Badge tone="red" mono>
                                    TOOL_BLOCKED
                                  </Badge>
                                  <Badge
                                    tone={entry.actor.includes("self_test") ? "amber" : "neutral"}
                                    mono
                                  >
                                    {entry.actor}
                                  </Badge>
                                </div>
                                <p className="text-text-secondary">{entry.summary}</p>
                              </div>
                              <Timestamp iso={entry.ts} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>
                </TabsContent>
                <TabsContent value="timeline">
                  <ExecutionTimeline agents={agents} now={now} />
                </TabsContent>
                <TabsContent value="issues">
                  <WarningsList caseId={id} issues={issues} />
                </TabsContent>
              </Tabs>
            ) : (
              <EmptyState
                icon={Bot}
                title="No investigation has run yet"
                description="Start the investigation to run the four agents in order. Each agent records its actions, tool calls and warnings in this view as it works."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="primary" onClick={startInvestigation} disabled={start.isPending}>
                      <Play aria-hidden />
                      Start investigation
                    </Button>
                    <Button variant="secondary" onClick={() => setTab("registry")}>
                      <Wrench aria-hidden />
                      Inspect Tool Registry
                    </Button>
                  </div>
                }
              />
            )}
          </>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
