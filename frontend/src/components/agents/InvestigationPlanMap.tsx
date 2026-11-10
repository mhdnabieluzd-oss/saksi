import { useCallback, useMemo, useState, type CSSProperties } from "react";
import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Ban,
  CheckCircle2,
  Clock,
  GitBranch,
  History,
  LoaderCircle,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { InvestigationPlan, PlanTask, TaskStatus, ToolDefinition } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { Timestamp } from "@/components/ui/timestamp";
import { cn } from "@/lib/utils";

type TaskNodeData = {
  task: PlanTask;
  selected: boolean;
  onSelect: (taskId: string) => void;
};

type TaskFlowNode = Node<TaskNodeData, "planTask">;

const HANDLE_STYLE: CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: 0,
  pointerEvents: "none",
};

const STATUS_STYLE: Record<
  TaskStatus,
  {
    label: string;
    tone: "green" | "cyan" | "amber" | "red" | "neutral" | "muted";
    ring: string;
    Icon: typeof CheckCircle2;
  }
> = {
  completed: {
    label: "Completed",
    tone: "green",
    ring: "border-green/50 bg-surface",
    Icon: CheckCircle2,
  },
  running: {
    label: "Running",
    tone: "cyan",
    ring: "border-cyan ring-2 ring-cyan/30 bg-surface-elevated",
    Icon: LoaderCircle,
  },
  waiting_approval: {
    label: "Awaiting Approval",
    tone: "amber",
    ring: "border-amber/60 bg-amber/5",
    Icon: Lock,
  },
  blocked: {
    label: "Blocked by Policy",
    tone: "red",
    ring: "border-red/60 bg-red/5",
    Icon: Ban,
  },
  failed: {
    label: "Failed",
    tone: "red",
    ring: "border-red/60 bg-red/5",
    Icon: ShieldAlert,
  },
  ready: {
    label: "Ready",
    tone: "cyan",
    ring: "border-cyan/40 border-dashed bg-surface",
    Icon: Clock,
  },
  planned: {
    label: "Planned",
    tone: "neutral",
    ring: "border-border border-dashed bg-surface",
    Icon: Clock,
  },
  skipped: {
    label: "Skipped",
    tone: "muted",
    ring: "border-border bg-surface opacity-60",
    Icon: Clock,
  },
  cancelled: {
    label: "Cancelled",
    tone: "muted",
    ring: "border-border bg-surface opacity-60",
    Icon: Ban,
  },
};

function PlanTaskNode({ data }: NodeProps<TaskFlowNode>) {
  const { task, selected, onSelect } = data;
  const meta = STATUS_STYLE[task.status] ?? STATUS_STYLE.planned;
  const Icon = meta.Icon;
  const policyBlocked = task.status === "blocked" || Boolean(task.blocked_reason);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(task.task_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(task.task_id);
        }
      }}
      style={{ width: 252, minHeight: 112 }}
      className={cn(
        "relative flex cursor-pointer flex-col justify-between rounded-md border px-3.5 py-2.5 text-left shadow-sm transition-all",
        meta.ring,
        selected && "ring-2 ring-cyan bg-surface-elevated",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} style={HANDLE_STYLE} />

      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-cyan">
          {task.task_id}
          {task.plan_version_added > 1 && (
            <span className="rounded-sm border border-cyan/40 bg-cyan/10 px-1.5 py-0.5 text-[11px] text-cyan">
              +v{task.plan_version_added}
            </span>
          )}
        </span>
        <Badge tone={meta.tone} className="px-1.5 py-0.5 text-xs">
          <Icon className={cn("size-3", task.status === "running" && "animate-spin")} />
          {meta.label}
        </Badge>
      </div>

      <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-text" title={task.title}>
        {task.title}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1 truncate font-mono text-xs text-text-muted">
          <Wrench className="size-3 shrink-0 text-cyan" />
          {task.tool_name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
          {policyBlocked ? (
            <span className="inline-flex items-center gap-1 text-red" title="Blocked by Tool Policy Gate">
              <Ban className="size-3" />
              Gate denied
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-green" title="Allowed by Tool Policy Gate">
              <ShieldCheck className="size-3" />
              {task.evidence_ids.length} ev
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

const NODE_TYPES = { planTask: PlanTaskNode };

function layoutPlanTasks(tasks: readonly PlanTask[]): Map<string, { x: number; y: number }> {
  const depth = new Map<string, number>();
  const byId = new Map(tasks.map((t) => [t.task_id, t]));

  function getDepth(id: string, visited = new Set<string>()): number {
    if (depth.has(id)) return depth.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const task = byId.get(id);
    if (!task || task.depends_on.length === 0) {
      depth.set(id, 0);
      return 0;
    }
    const d = 1 + Math.max(...task.depends_on.map((dep) => getDepth(dep, visited)));
    depth.set(id, d);
    return d;
  }

  tasks.forEach((t) => getDepth(t.task_id));

  const columns = new Map<number, PlanTask[]>();
  for (const task of tasks) {
    const col = depth.get(task.task_id) ?? 0;
    const list = columns.get(col) ?? [];
    list.push(task);
    columns.set(col, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [col, list] of columns.entries()) {
    list.forEach((task, row) => {
      positions.set(task.task_id, { x: col * 304, y: row * 140 });
    });
  }
  return positions;
}

export interface InvestigationPlanMapProps {
  caseId: string;
  plans: readonly InvestigationPlan[];
  tools?: readonly ToolDefinition[];
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string | null) => void;
  onTestBlockedTool?: () => void;
  testingBlockedTool?: boolean;
}

export function InvestigationPlanMap({
  caseId,
  plans,
  tools = [],
  selectedTaskId: controlledTaskId,
  onSelectTask,
  onTestBlockedTool,
  testingBlockedTool = false,
}: InvestigationPlanMapProps) {
  const latestVersion = plans.length > 0 ? plans[plans.length - 1].version : 1;
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const activeVersion = selectedVersion ?? latestVersion;
  const plan = plans.find((p) => p.version === activeVersion) ?? plans[plans.length - 1] ?? null;

  const [internalTaskId, setInternalTaskId] = useState<string | null>(null);
  const effectiveTaskId = controlledTaskId !== undefined ? controlledTaskId : internalTaskId;
  const handleSelectTask = useCallback(
    (taskId: string) => {
      setInternalTaskId(taskId);
      onSelectTask?.(taskId);
    },
    [onSelectTask],
  );

  const selectedTask = useMemo(() => {
    if (!plan) return null;
    return plan.tasks.find((t) => t.task_id === effectiveTaskId) ?? plan.tasks[0] ?? null;
  }, [plan, effectiveTaskId]);

  const addedInActiveVersion = useMemo(() => {
    if (!plan || plan.version <= 1) return [];
    return plan.tasks.filter((t) => t.plan_version_added === plan.version);
  }, [plan]);

  const positions = useMemo(() => layoutPlanTasks(plan?.tasks ?? []), [plan]);

  const flowNodes = useMemo<TaskFlowNode[]>(() => {
    if (!plan) return [];
    return plan.tasks.map((task) => ({
      id: task.task_id,
      type: "planTask",
      position: positions.get(task.task_id) ?? { x: 0, y: 0 },
      draggable: false,
      selectable: true,
      connectable: false,
      selected: selectedTask?.task_id === task.task_id,
      data: {
        task,
        selected: selectedTask?.task_id === task.task_id,
        onSelect: handleSelectTask,
      },
    }));
  }, [plan, positions, selectedTask, handleSelectTask]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (!plan) return [];
    const edges: Edge[] = [];
    for (const task of plan.tasks) {
      for (const dep of task.depends_on) {
        const isReplan = task.plan_version_added > 1;
        const isBlocked = task.status === "blocked";
        const color = isBlocked ? "#ef4444" : isReplan ? "#22d3ee" : "#64748b";
        edges.push({
          id: `${dep}->${task.task_id}`,
          source: dep,
          target: task.task_id,
          sourceHandle: "out",
          targetHandle: "in",
          type: "smoothstep",
          animated: task.status === "running",
          label: isReplan ? `+v${task.plan_version_added}` : undefined,
          style: {
            stroke: color,
            strokeWidth: isReplan || isBlocked ? 2 : 1.5,
            strokeDasharray: task.status === "planned" || task.status === "ready" ? "5 4" : undefined,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
          labelStyle: { fill: "#22d3ee", fontFamily: "IBM Plex Mono, monospace", fontSize: 11 },
          labelBgStyle: { fill: "#111c2d", stroke: "#263449" },
          labelBgPadding: [5, 2] as [number, number],
          labelBgBorderRadius: 4,
        });
      }
    }
    return edges;
  }, [plan]);

  if (!plan) {
    return (
      <Card title="Investigation Plan">
        <p className="text-xs text-text-muted">No investigation plan recorded yet.</p>
      </Card>
    );
  }

  const selectedToolDef = tools.find((t) => t.name === selectedTask?.tool_name);
  const completedCount = plan.tasks.filter((t) => t.status === "completed").length;
  const totalTasks = Math.max(1, plan.tasks.length);
  const progressRatio = Math.min(1, completedCount / totalTasks);
  const ringCircumference = 2 * Math.PI * 14;
  const ringOffset = ringCircumference * (1 - progressRatio);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div
              className="relative flex size-10 shrink-0 items-center justify-center"
              title={`Plan progress: step ${completedCount} of ${plan.tasks.length} completed`}
            >
              <svg className="size-10 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.22)"
                  strokeWidth="3"
                  strokeDasharray="19 3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#00cc66"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  style={{ transition: "stroke-dashoffset 260ms ease-out" }}
                />
              </svg>
              <span className="font-mono text-[10px] font-semibold text-text tabular-nums">
                {completedCount}/{plan.tasks.length}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="size-4 text-cyan" />
                <h3 className="text-sm font-semibold text-text">Investigation Plan</h3>
                <Badge tone="cyan" mono>
                  v{plan.version}
                </Badge>
                <Badge tone="muted" mono>
                  Step {completedCount} of {plan.tasks.length}
                </Badge>
                {plan.reconstructed ? (
                  <Badge tone="neutral" title="Built from completed findings and evidence">
                    <History className="size-3" />
                    Saved plan
                  </Badge>
                ) : (
                  <Badge tone="green">Active plan</Badge>
                )}
                {plan.revised_at && (
                  <span className="text-xs text-text-muted">
                    Updated <Timestamp iso={plan.revised_at} />
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary">
                {plan.revision_reason}
              </p>
              {addedInActiveVersion.length > 0 && (
                <p className="text-xs text-cyan">
                  v{plan.version - 1} → v{plan.version}: added {addedInActiveVersion.length} step(s) ({" "}
                  <span className="font-mono">{addedInActiveVersion.map((t) => t.task_id).join(", ")}</span>)
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {plans.length > 1 && (
              <div
                role="group"
                aria-label="Plan versions"
                className="flex items-center gap-1 rounded-md border border-border bg-bg p-1"
              >
                <GitBranch className="ml-1.5 size-3.5 text-text-muted" />
                {plans.map((p) => (
                  <button
                    key={p.version}
                    type="button"
                    aria-pressed={p.version === activeVersion}
                    onClick={() => setSelectedVersion(p.version)}
                    className={cn(
                      "rounded px-2.5 py-1 font-mono text-xs transition-colors",
                      p.version === activeVersion
                        ? "border border-cyan/40 bg-cyan/15 font-semibold text-cyan"
                        : "text-text-secondary hover:text-text",
                    )}
                  >
                    v{p.version} ({p.tasks.length})
                  </button>
                ))}
              </div>
            )}
            {onTestBlockedTool && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTestBlockedTool}
                disabled={testingBlockedTool}
                title="Run Policy Gate self-test: submit an unapproved tool call (exec_shell) and verify TOOL_BLOCKED is recorded"
              >
                <Ban className="size-3.5 text-red" />
                {testingBlockedTool ? "Running self-test..." : "Test policy gate (self-test)"}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-green" /> Completed task
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-cyan" /> Active / Re-plan (+v2)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm border border-dashed border-text-secondary" /> Planned / Ready
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-red" /> Blocked by Tool Policy Gate
          </span>
          <span className="ml-auto font-mono text-xs text-text-muted">
            Budget: {plan.tasks.length}/{plan.limits.max_steps} steps · max {plan.limits.max_tool_calls} tool calls
          </span>
        </div>

        <div
          role="region"
          aria-label="Investigation plan task graph"
          className="mt-3 overflow-hidden rounded-md border border-border bg-bg"
          style={{ height: 400 }}
        >
          <ReactFlowProvider>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={NODE_TYPES}
              colorMode="dark"
              fitView
              fitViewOptions={{ padding: 0.14, maxZoom: 1.1 }}
              minZoom={0.35}
              maxZoom={1.6}
              style={{ backgroundColor: "var(--color-bg)" }}
              nodesDraggable={false}
              nodesConnectable={false}
            >
              <Background color="#263449" gap={22} size={1.2} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>

      {selectedTask && (
        <Card
          title={`Selected Task Inspector — ${selectedTask.task_id}: ${selectedTask.title}`}
          description="Select any task node in the Investigation Plan DAG above to inspect its objective, tool policy check, and evidence receipts."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-secondary">Objective &amp; Rationale</p>
              <p className="text-sm text-text">{selectedTask.objective}</p>
              <p className="text-xs text-text-muted">{selectedTask.rationale}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge tone={STATUS_STYLE[selectedTask.status]?.tone ?? "neutral"}>
                  {STATUS_STYLE[selectedTask.status]?.label ?? selectedTask.status}
                </Badge>
                <Badge tone="muted" mono>
                  Added in Plan v{selectedTask.plan_version_added}
                </Badge>
                {selectedTask.depends_on.length > 0 && (
                  <Badge tone="neutral" mono>
                    Depends on: {selectedTask.depends_on.join(", ")}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-text-secondary">Tool Broker &amp; Policy Gate</p>
              <div className="rounded-sm border border-border bg-bg p-2.5 font-mono text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-cyan">{selectedTask.tool_name}</span>
                  <Badge tone={selectedTask.status === "blocked" ? "red" : "green"} mono>
                    {selectedTask.status === "blocked" ? "Policy: DENIED" : `Policy: ALLOWED (${selectedTask.risk})`}
                  </Badge>
                </div>
                {selectedToolDef && (
                  <p className="mt-1 font-sans text-xs text-text-secondary">{selectedToolDef.description}</p>
                )}
                <p className="mt-2 text-xs text-text-muted">Input: {JSON.stringify(selectedTask.input)}</p>
                <p className="mt-1 text-xs text-text-muted">
                  Limits: max {selectedTask.max_results} rows · timeout {selectedTask.timeout_seconds}s
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-text-secondary">Execution Result &amp; Evidence Receipts</p>
              {selectedTask.blocked_reason ? (
                <div className="rounded-sm border border-red/40 bg-red/10 p-2.5 text-xs text-red">
                  <p className="font-semibold">Blocked by Policy Gate (logged as TOOL_BLOCKED)</p>
                  <p className="mt-1">{selectedTask.blocked_reason}</p>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  {selectedTask.output_summary || "No output recorded yet."}
                </p>
              )}
              {selectedTask.evidence_ids.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs text-text-muted">
                    Evidence receipts ({selectedTask.evidence_ids.length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTask.evidence_ids.slice(0, 12).map((eid) => (
                      <EvidenceChip key={eid} caseId={caseId} eventId={eid} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
