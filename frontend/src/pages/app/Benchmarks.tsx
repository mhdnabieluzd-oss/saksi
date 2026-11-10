import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Database,
  Info,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useBenchmarkRuns, useCases, useRunBenchmark } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Timestamp } from "@/components/ui/timestamp";
import { cn } from "@/lib/utils";

function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function formatMsOrNotMeasured(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "Not measured";
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function Benchmarks() {
  const runsQuery = useBenchmarkRuns();
  const casesQuery = useCases();
  const runBench = useRunBenchmark();

  const runs = runsQuery.data ?? [];
  const cases = casesQuery.data ?? [];

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [targetCaseId, setTargetCaseId] = useState<string>("CASE-2026-0001");
  const [targetWorkflow, setTargetWorkflow] = useState<"autonomous_planner" | "fixed_baseline">("autonomous_planner");

  const activeRun = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;
  const autonomousRun = runs.find((r) => r.workflow === "autonomous_planner") ?? null;
  const baselineRun = runs.find((r) => r.workflow === "fixed_baseline") ?? null;

  function handleRunEvaluation() {
    runBench.mutate(
      { case_id: targetCaseId, workflow: targetWorkflow },
      {
        onSuccess: (created) => {
          setSelectedRunId(created.id);
          toast.success(`Benchmark ${created.id} completed (F1: ${pct(created.metrics.f1)})`);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Benchmark failed"),
      },
    );
  }

  return (
    <>
      <PageHeader
        title="Benchmarks"
        subtitle="Compare the Autonomous Planner against the Fixed Baseline on the HQ-Breach scenario answer key."
        breadcrumbs={[{ label: "Command Centre", to: "/app" }, { label: "Benchmarks" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Case to evaluate"
              value={targetCaseId}
              onChange={(e) => setTargetCaseId(e.target.value)}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text"
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} ({c.verified_count} verified)
                </option>
              ))}
              {cases.length === 0 && <option value="CASE-2026-0001">CASE-2026-0001</option>}
            </select>
            <select
              aria-label="Workflow mode"
              value={targetWorkflow}
              onChange={(e) =>
                setTargetWorkflow(e.target.value === "fixed_baseline" ? "fixed_baseline" : "autonomous_planner")
              }
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text"
            >
              <option value="autonomous_planner">Autonomous Planner</option>
              <option value="fixed_baseline">Fixed Pipeline Baseline</option>
            </select>
            <Button variant="primary" size="sm" onClick={handleRunEvaluation} disabled={runBench.isPending}>
              <Play className="size-3.5" />
              {runBench.isPending ? "Evaluating..." : "Run Evaluation"}
            </Button>
          </div>
        }
      />

      {runsQuery.isPending ? (
        <Spinner label="Loading benchmark evaluations" />
      ) : (
        <div className="space-y-6">
          {/* Honest Evaluation Scope Banner */}
          <div
            role="note"
            aria-label="Benchmark scope disclosure"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-4 py-3 text-xs text-text-secondary"
          >
            <span className="flex items-center gap-2">
              <Info className="size-4 shrink-0 text-cyan" />
              <span>
                <strong className="text-text">Evaluation scope:</strong> 1 synthetic scenario (
                <span className="font-mono">HQ-Breach</span>) · 2,138 events · repo answer key (
                <span className="font-mono">scenarios/hq-breach/answer_key.json</span>). Timings and tool counts show{" "}
                <span className="font-mono">Not measured</span> when a run was seeded rather than timed live.
              </span>
            </span>
            <Badge tone="neutral" mono>
              Synthetic scenario benchmark
            </Badge>
          </div>

          {/* Workflow Comparison Banner */}
          {autonomousRun && baselineRun && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-cyan/40 bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-cyan" />
                    <h3 className="text-sm font-semibold text-text">Autonomous Investigation Planner</h3>
                  </div>
                  <Badge tone="cyan" mono>
                    F1 {pct(autonomousRun.metrics.f1)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-text-secondary">{autonomousRun.notes}</p>
                <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
                  <div>
                    <dt className="text-[11px] text-text-muted">Precision</dt>
                    <dd className="font-mono text-sm font-semibold text-green">
                      {pct(autonomousRun.metrics.precision)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Recall</dt>
                    <dd className="font-mono text-sm font-semibold text-cyan">{pct(autonomousRun.metrics.recall)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Grounding</dt>
                    <dd className="font-mono text-sm font-semibold text-green">
                      {pct(autonomousRun.metrics.evidence_grounding_precision)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Techniques</dt>
                    <dd className="font-mono text-sm font-semibold text-text">
                      {autonomousRun.metrics.true_positives}/{autonomousRun.manifest.expected_techniques}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-md border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-text-muted" />
                    <h3 className="text-sm font-semibold text-text">Fixed 4-Step Pipeline Baseline</h3>
                  </div>
                  <Badge tone="neutral" mono>
                    F1 {pct(baselineRun.metrics.f1)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-text-secondary">{baselineRun.notes}</p>
                <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
                  <div>
                    <dt className="text-[11px] text-text-muted">Precision</dt>
                    <dd className="font-mono text-sm font-semibold text-text">
                      {pct(baselineRun.metrics.precision)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Recall</dt>
                    <dd className="font-mono text-sm font-semibold text-amber">{pct(baselineRun.metrics.recall)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Grounding</dt>
                    <dd className="font-mono text-sm font-semibold text-text">
                      {pct(baselineRun.metrics.evidence_grounding_precision)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Techniques</dt>
                    <dd className="font-mono text-sm font-semibold text-amber">
                      {baselineRun.metrics.true_positives}/{baselineRun.manifest.expected_techniques}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {/* Run Selector Tabs */}
          {runs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                    activeRun?.id === run.id
                      ? "border-cyan bg-cyan/10 font-semibold text-cyan"
                      : "border-border bg-surface text-text-secondary hover:text-text",
                  )}
                >
                  <span className="font-mono">{run.id}</span>
                  <span>·</span>
                  <span>{run.workflow === "autonomous_planner" ? "Autonomous Planner" : "Fixed Baseline"}</span>
                  <Badge tone={run.workflow === "autonomous_planner" ? "cyan" : "muted"} mono>
                    F1 {pct(run.metrics.f1)}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {activeRun && (
            <>
              {/* Detailed Metric Grid */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                <Card title="Detection F1">
                  <p className="font-mono text-2xl font-bold text-cyan">{pct(activeRun.metrics.f1)}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    TP {activeRun.metrics.true_positives} · FP {activeRun.metrics.false_positives} · FN{" "}
                    {activeRun.metrics.false_negatives}
                  </p>
                </Card>
                <Card title="Evidence Grounding">
                  <p className="font-mono text-2xl font-bold text-green">
                    {pct(activeRun.metrics.evidence_grounding_precision)}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">Cited event IDs present in case</p>
                </Card>
                <Card title="Citation Overlap">
                  <p className="font-mono text-2xl font-bold text-green">
                    {pct(activeRun.metrics.evidence_citation_precision)}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">Matches answer-key receipts</p>
                </Card>
                <Card title="Evidence Coverage">
                  <p className="font-mono text-2xl font-bold text-cyan">
                    {pct(activeRun.metrics.evidence_coverage)}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">Answer-key events cited</p>
                </Card>
                <Card title="Time to 1st Finding">
                  <p className="font-mono text-xl font-bold text-text">
                    {formatMsOrNotMeasured(activeRun.metrics.time_to_first_finding_ms)}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Total: {formatMsOrNotMeasured(activeRun.metrics.investigation_completion_ms)}
                  </p>
                </Card>
                <Card title="Tool Calls & Gate">
                  <p className="font-mono text-xl font-bold text-text">
                    {activeRun.metrics.tool_calls_total === null || activeRun.metrics.tool_calls_total === undefined
                      ? "Not measured"
                      : activeRun.metrics.tool_calls_total}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {activeRun.metrics.blocked_tool_requests} agent block(s)
                  </p>
                </Card>
              </div>

              {/* Dataset Provenance & Manifest */}
              <Card
                title={`Benchmark Scenario Manifest — ${activeRun.manifest.name}`}
                description="Documented dataset provenance, telemetry layers and known evaluation boundaries."
              >
                <div className="grid gap-4 text-xs md:grid-cols-3">
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 font-medium text-text">
                      <Database className="size-3.5 text-cyan" /> Dataset Source &amp; License
                    </p>
                    <p className="text-text-secondary">{activeRun.manifest.dataset_source}</p>
                    <p className="font-mono text-[11px] text-text-muted">License: {activeRun.manifest.license}</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 font-medium text-text">
                      <Target className="size-3.5 text-cyan" /> Telemetry Layers &amp; Corpus Scale
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeRun.manifest.telemetry_layers.map((layer) => (
                        <Badge key={layer} tone="neutral">
                          {layer}
                        </Badge>
                      ))}
                    </div>
                    <p className="font-mono text-[11px] text-text-muted">
                      {activeRun.manifest.event_count} events · {activeRun.manifest.expected_techniques} ATT&amp;CK
                      techniques · Entities: {activeRun.manifest.expected_entities.join(", ")}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 font-medium text-text">
                      <ShieldCheck className="size-3.5 text-cyan" /> Evaluation Metadata &amp; Limitations
                    </p>
                    <p className="text-text-secondary">{activeRun.manifest.limitations}</p>
                    <p className="text-[11px] text-text-muted">
                      Model: <span className="font-mono text-text">{activeRun.model}</span> · Evaluated{" "}
                      <Timestamp iso={activeRun.evaluated_at} />
                    </p>
                  </div>
                </div>
              </Card>

              {/* Per-Technique Ground-Truth Evaluation Table */}
              <Card
                title={`Per-Technique Answer-Key Evaluation (${activeRun.id})`}
                description="Comparison of SAKSI's verified findings against the 12 MITRE ATT&CK techniques in scenarios/hq-breach/answer_key.json."
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-muted">
                        <th className="py-2 pr-4 font-medium">Technique</th>
                        <th className="py-2 pr-4 font-medium">Tactic</th>
                        <th className="py-2 pr-4 font-medium">Answer-Key Match</th>
                        <th className="py-2 pr-4 font-medium">Predicted Finding</th>
                        <th className="py-2 pr-4 font-medium">Expected Receipts</th>
                        <th className="py-2 pr-4 font-medium">Citation Overlap</th>
                        <th className="py-2 font-medium">Grounding Precision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {activeRun.per_technique.map((row) => (
                        <tr key={row.technique_id}>
                          <td className="py-2.5 pr-4">
                            <span className="font-mono font-semibold text-cyan">{row.technique_id}</span>{" "}
                            <span className="text-text">{row.technique_name}</span>
                          </td>
                          <td className="py-2.5 pr-4 text-text-secondary">{row.tactic}</td>
                          <td className="py-2.5 pr-4">
                            {row.matched ? (
                              <span className="inline-flex items-center gap-1 font-medium text-green">
                                <CheckCircle2 className="size-3.5" /> Matched (TP)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-medium text-red">
                                <XCircle className="size-3.5" /> Missed (FN)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 font-mono">
                            {row.predicted_finding_id ? (
                              <Badge tone="green" mono>
                                {row.predicted_finding_id} ({row.predicted_status})
                              </Badge>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-text-secondary">
                            {row.expected_event_ids.slice(0, 3).join(", ")}
                            {row.expected_event_ids.length > 3 ? ` (+${row.expected_event_ids.length - 3})` : ""}
                          </td>
                          <td className="py-2.5 pr-4 font-mono tabular-nums">
                            {row.citation_overlap} / {row.expected_event_ids.length}
                          </td>
                          <td className="py-2.5 font-mono font-semibold text-green tabular-nums">
                            {row.matched ? pct(row.grounding_precision) : "0.0%"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}
