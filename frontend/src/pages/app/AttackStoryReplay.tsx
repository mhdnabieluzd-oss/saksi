import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Route } from "lucide-react";
import type { Finding, Graph, Story, StoryStep } from "@/lib/types";
import { findingStatusMeta, formatTs, severityMeta } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { useCase, useGraph, useStory } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Timestamp } from "@/components/ui/timestamp";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { AttackGraph } from "@/components/graph/AttackGraph";
import { attackTechniqueUrl } from "@/components/findings/attack-links";
import { TechniqueChip } from "@/components/findings/TechniqueChip";
import { cn } from "@/lib/utils";

type Tone = "cyan" | "amber" | "red" | "muted";

const BASE_DELAY_MS = 2500;
const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];
const ROW_PX = 44;
const MIN_GAP_PCT = 6;

// Tactic colour groups: entry, foothold, spread and impact. The step number is always shown too.
const TACTIC_TONE: Partial<Record<string, Tone>> = {
  reconnaissance: "cyan",
  "resource-development": "cyan",
  "initial-access": "cyan",
  discovery: "cyan",
  execution: "amber",
  persistence: "amber",
  "privilege-escalation": "amber",
  "defense-evasion": "amber",
  "credential-access": "red",
  "lateral-movement": "red",
  collection: "red",
  "command-and-control": "red",
  exfiltration: "red",
  impact: "red",
};

const MARKER_CLASS: Record<Tone, string> = {
  cyan: "border-cyan/60 bg-cyan/15 text-cyan",
  amber: "border-amber/60 bg-amber/15 text-amber",
  red: "border-red/60 bg-red/15 text-red",
  muted: "border-border bg-surface-elevated text-text-secondary",
};

const tacticTone = (tactic: string): Tone =>
  TACTIC_TONE[tactic.trim().toLowerCase().replace(/\s+/g, "-")] ?? "muted";

/** Marker position by real timestamp between the first and last step. Close steps go on extra rows. */
function layoutTimeline(steps: readonly StoryStep[]): { left: number; row: number }[] {
  const times = steps.map((step) => Date.parse(step.ts));
  const first = Math.min(...times);
  const last = Math.max(...times);
  const span = last - first;
  const rowLast: number[] = [];
  return steps.map((_, index) => {
    const left =
      span > 0
        ? ((times[index] - first) / span) * 100
        : steps.length > 1
          ? (index / (steps.length - 1)) * 100
          : 50;
    let row = rowLast.findIndex((prev) => Math.abs(left - prev) >= MIN_GAP_PCT);
    if (row === -1) row = rowLast.length;
    rowLast[row] = left;
    return { left, row };
  });
}

/** Route /app/cases/:caseId/story. Shows the 404 empty state until the investigation completes. */
export default function AttackStoryReplay() {
  const { caseId = "" } = useParams();
  const storyQuery = useStory(caseId);
  const graphQuery = useGraph(caseId);
  const caseQuery = useCase(caseId);

  const header = (
    <PageHeader title="Attack Story Replay" subtitle="Step through the attack in the order the evidence shows it." />
  );

  if (storyQuery.isPending || caseQuery.isPending) return <ReplaySkeleton />;

  if (storyQuery.error instanceof ApiError && storyQuery.error.status === 404) {
    return (
      <>
        {header}
        <EmptyState
          icon={Route}
          title="No attack story yet. Run the investigation first."
          action={
            <Button asChild variant="secondary">
              <Link to={`/app/cases/${caseId}`}>Go to the investigation</Link>
            </Button>
          }
        />
      </>
    );
  }

  if (storyQuery.isError || caseQuery.isError || graphQuery.isError) {
    const failure = storyQuery.error ?? caseQuery.error ?? graphQuery.error;
    return (
      <>
        {header}
        <ErrorState
          title="Could not load the attack story"
          message={failure instanceof Error ? failure.message : "Unknown error"}
          onRetry={() => {
            void storyQuery.refetch();
            void caseQuery.refetch();
            void graphQuery.refetch();
          }}
        />
      </>
    );
  }

  const story = storyQuery.data;
  const graph = graphQuery.data;
  const detail = caseQuery.data;
  if (!story || !graph || !detail || graphQuery.isPending) return <ReplaySkeleton />;

  return (
    <ReplayView
      caseId={caseId}
      caseTitle={detail.summary.title}
      story={story}
      graph={graph}
      findings={detail.findings}
    />
  );
}

interface ReplayViewProps {
  caseId: string;
  caseTitle: string;
  story: Story;
  graph: Graph;
  findings: readonly Finding[];
}

function ReplayView({ caseId, caseTitle, story, graph, findings }: ReplayViewProps) {
  const steps = useMemo(() => [...story.steps].sort((a, b) => a.order - b.order), [story.steps]);
  const last = Math.max(steps.length - 1, 0);
  const marks = useMemo(() => layoutTimeline(steps), [steps]);
  const rowCount = Math.max(1, ...marks.map((mark) => mark.row + 1));

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const currentIndex = Math.min(index, last);
  const current: StoryStep | undefined = steps[currentIndex];
  const finding = current ? findings.find((item) => item.id === current.finding_id) : undefined;
  const techniqueName = finding?.technique_name ?? "";

  const goTo = useCallback((next: number) => setIndex(Math.min(Math.max(next, 0), last)), [last]);

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (currentIndex >= last) setIndex(0);
    setPlaying(true);
  }, [playing, currentIndex, last]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => {
        if (currentIndex >= last) setPlaying(false);
        else setIndex(currentIndex + 1);
      },
      BASE_DELAY_MS / speed,
    );
    return () => window.clearTimeout(timer);
  }, [playing, currentIndex, last, speed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      }
      if (event.key === " ") {
        if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(currentIndex + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, goTo, currentIndex]);

  const playhead = marks[currentIndex]?.left ?? 0;
  const axisTop = rowCount * ROW_PX + 8;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Investigations", to: "/app/investigations" },
          { label: caseTitle, to: `/app/cases/${caseId}` },
          { label: "Attack story" },
        ]}
        title="Attack Story Replay"
        subtitle={story.summary}
        actions={
          <Button asChild variant="outline">
            <Link to={`/app/cases/${caseId}`}>Back to investigation</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-secondary">
        <span className="font-mono text-cyan">{story.case_id}</span>
        <StatusBadge meta={severityMeta(story.severity)} />
        <span className="tabular-nums">{steps.length} steps</span>
        {steps.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>Time span</span>
            <span className="font-mono">{formatTs(steps[0].ts)}</span>
            <span>to</span>
            <span className="font-mono">{formatTs(steps[last].ts)}</span>
          </span>
        )}
      </div>

      {!current ? (
        <EmptyState icon={Route} title="No steps in this story yet." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <AttackGraph
              graph={graph}
              highlightNodeIds={current.node_ids}
              highlightEdgeIds={current.edge_ids}
              revealUpToStep={current.order}
              selectedNodeId={selectedNodeId}
              height={520}
              onSelectNode={setSelectedNodeId}
            />

            <section aria-label="Attack timeline" className="space-y-4 rounded-md border border-border bg-surface p-4">
              <div role="toolbar" aria-label="Playback controls" className="flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={togglePlay} aria-pressed={playing}>
                  {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
                  {playing ? "Pause" : "Play"}
                </Button>
                <Button variant="secondary" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex <= 0}>
                  <SkipBack aria-hidden />
                  Previous
                </Button>
                <Button variant="secondary" onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= last}>
                  <SkipForward aria-hidden />
                  Next
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPlaying(false);
                    setIndex(0);
                  }}
                >
                  <RotateCcw aria-hidden />
                  Restart
                </Button>
                <div role="group" aria-label="Playback speed" className="flex items-center gap-1">
                  {SPEEDS.map((value) => (
                    <Button
                      key={value}
                      variant="ghost"
                      size="sm"
                      aria-pressed={speed === value}
                      className={cn(speed === value && "border border-cyan/40 text-cyan")}
                      onClick={() => setSpeed(value)}
                    >
                      {value}x
                    </Button>
                  ))}
                </div>
                <p aria-live="polite" className="ml-auto font-mono text-xs text-text-secondary tabular-nums">
                  Step {currentIndex + 1} of {steps.length}
                </p>
              </div>

              <div className="px-6">
                <div className="relative" style={{ height: axisTop + 40 }}>
                  {marks.map((mark, stepIndex) => {
                    const step = steps[stepIndex];
                    const isCurrent = stepIndex === currentIndex;
                    return (
                      <button
                        key={`${step.order}-${step.ts}`}
                        type="button"
                        aria-label={`Step ${step.order}: ${step.title}, ${formatTs(step.ts)}`}
                        aria-current={isCurrent ? "step" : undefined}
                        onClick={() => goTo(stepIndex)}
                        className="absolute flex size-11 -translate-x-1/2 items-center justify-center rounded-full"
                        style={{ left: `${mark.left}%`, top: mark.row * ROW_PX }}
                      >
                        <span
                          className={cn(
                            "flex size-7 items-center justify-center rounded-full border font-mono text-[11px] tabular-nums motion-safe:transition-transform motion-safe:duration-200",
                            MARKER_CLASS[tacticTone(step.tactic)],
                            isCurrent && "scale-125 ring-2 ring-text",
                          )}
                        >
                          {step.order}
                        </span>
                      </button>
                    );
                  })}
                  <div aria-hidden className="absolute inset-x-0 h-0.5 bg-border" style={{ top: axisTop }} />
                  <div
                    aria-hidden
                    className="absolute w-0.5 bg-cyan motion-safe:transition-[left] motion-safe:duration-300 motion-safe:ease-out"
                    style={{ left: `${playhead}%`, top: 0, height: axisTop }}
                  />
                  <div
                    className="absolute inset-x-0 flex justify-between font-mono text-[11px] text-text-muted"
                    style={{ top: axisTop + 10 }}
                  >
                    <span>{formatTs(steps[0].ts)}</span>
                    <span>{formatTs(steps[last].ts)}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside aria-label="Selected step" className="min-w-0">
            <Card title="Selected step">
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-text-secondary">Step {current.order}</p>
                    {finding && <StatusBadge meta={findingStatusMeta(finding.status)} />}
                  </div>
                  <h3 className="text-base leading-snug font-semibold text-text">{current.title}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {current.tactic && (
                    <Badge tone={tacticTone(current.tactic)}>{current.tactic}</Badge>
                  )}
                  {current.technique_id && (
                    <TechniqueChip
                      id={current.technique_id}
                      name={techniqueName}
                      href={attackTechniqueUrl(current.technique_id)}
                      source="MITRE ATT&CK"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Timestamp iso={current.ts} />
                  <span className="font-mono text-[11px] text-text-muted">UTC {current.ts}</span>
                </div>
                <p className="text-sm leading-relaxed text-text-secondary">{current.description}</p>

                <section aria-labelledby="step-receipts" className="space-y-2">
                  <h4 id="step-receipts" className="text-xs font-medium text-text-secondary">
                    Evidence receipts ({current.event_ids.length})
                  </h4>
                  {current.event_ids.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {current.event_ids.map((eventId) => (
                        <li key={eventId}>
                          <EvidenceChip caseId={caseId} eventId={eventId} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-muted">No evidence linked to this step.</p>
                  )}
                </section>

                <section aria-labelledby="step-finding" className="space-y-2">
                  <h4 id="step-finding" className="text-xs font-medium text-text-secondary">
                    Finding basis
                  </h4>
                  {finding ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/app/cases/${caseId}?view=findings&finding=${finding.id}`}
                          className="font-mono text-xs text-cyan hover:underline"
                        >
                          {finding.id}
                        </Link>
                        <StatusBadge meta={findingStatusMeta(finding.status)} />
                      </div>
                      <p className="text-sm text-text">{finding.title}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">This step&apos;s finding is not in this case.</p>
                  )}
                </section>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}

function ReplaySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading attack story" className="space-y-4">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[520px]" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
