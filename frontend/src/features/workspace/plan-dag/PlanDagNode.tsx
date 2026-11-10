// Investigation Plan DAG node — @xyflow/react v12 custom node.
// Register: const nodeTypes = { planStep: PlanDagNode };  <ReactFlow nodeTypes={nodeTypes} ... />
import { memo, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Ban, CheckCircle2, CircleDashed, Clock3, Copy, Check, Loader2,
  Search, GitFork, Radar, Terminal, ShieldCheck, ShieldAlert, Plus,
} from "lucide-react";

export type StepStatus = "queued" | "running" | "awaiting" | "done" | "failed" | "blocked";
export type PolicyGate = "allowed" | "blocked" | "needs_approval";
export type ToolName = "list_signals" | "pivot" | "search_events" | "exec_shell";

export type PlanStepData = {
  stepId: string;            // "S-07"
  tool: ToolName;
  summary: string;           // human sentence: "Pivot from EC2AMAZ-GNG1OJT to parent process tree"
  status: StepStatus;
  policy: PolicyGate;
  policyReason?: string;     // "exec_shell denied: tenant policy P-12 (no remote exec)"
  durationMs?: number;
  evidenceIds?: string[];    // ["EV-10231", "EV-10232"]
  addedInVersion?: number;   // marks nodes introduced by re-planning (v2 diff)
  planVersion: number;
};
export type PlanStepNode = Node<PlanStepData, "planStep">;

const TOOL_ICON: Record<ToolName, typeof Search> = {
  list_signals: Radar, pivot: GitFork, search_events: Search, exec_shell: Terminal,
};

const STATUS: Record<StepStatus, { label: string; ring: string; text: string; bar: string }> = {
  queued:   { label: "Queued",           ring: "",                                  text: "text-fg-subtle",       bar: "bg-state-idle" },
  running:  { label: "Running",          ring: "shadow-glow-accent animate-node-ignite", text: "text-state-running", bar: "bg-state-running" },
  awaiting: { label: "Awaiting analyst", ring: "shadow-glow-awaiting animate-await-pulse", text: "text-state-awaiting", bar: "bg-state-awaiting" },
  done:     { label: "Completed",        ring: "",                                  text: "text-state-verified",  bar: "bg-state-verified" },
  failed:   { label: "Failed",           ring: "shadow-glow-blocked",               text: "text-sev-critical",    bar: "bg-sev-critical" },
  blocked:  { label: "Blocked",          ring: "shadow-glow-blocked",               text: "text-state-blocked",   bar: "bg-state-blocked" },
};

function StatusIcon({ status }: { status: StepStatus }) {
  const cls = "size-3.5 shrink-0";
  switch (status) {
    case "running":
      return (
        <>
          <Loader2 data-motion="loop" className={`${cls} animate-agent-spin text-state-running`} aria-hidden />
          <CircleDashed data-motion="static" className={`${cls} text-state-running`} aria-hidden />
        </>
      );
    case "awaiting": return <Clock3 className={`${cls} text-state-awaiting`} aria-hidden />;
    case "done":     return <CheckCircle2 className={`${cls} text-state-verified`} aria-hidden />;
    case "blocked":
    case "failed":   return <Ban className={`${cls} text-state-blocked`} aria-hidden />;
    default:         return <CircleDashed className={`${cls} text-fg-subtle`} aria-hidden />;
  }
}

function PolicyChip({ policy, reason }: { policy: PolicyGate; reason?: string }) {
  const map = {
    allowed:        { Icon: ShieldCheck, label: "Allowed",           cls: "text-state-verified bg-state-verified/10 ring-state-verified/30" },
    needs_approval: { Icon: ShieldAlert, label: "Needs approval",    cls: "text-state-awaiting bg-state-awaiting/10 ring-state-awaiting/35" },
    blocked:        { Icon: Ban,         label: "Blocked by policy", cls: "text-state-blocked bg-state-blocked/10 ring-state-blocked/40" },
  }[policy];
  return (
    <span title={reason} className={`inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset ${map.cls}`}>
      <map.Icon className="size-3" aria-hidden /> {map.label}
    </span>
  );
}

function EvidenceChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // don't select the node
        navigator.clipboard?.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="nodrag group/chip inline-flex items-center gap-1 rounded-xs bg-inset px-1.5 py-0.5 font-data text-2xs text-accent ring-1 ring-inset ring-line transition-colors duration-150 hover:ring-accent/50"
      aria-label={`Copy evidence ID ${id}`}
    >
      {id}
      {copied
        ? <Check className="size-3 animate-copy-pop text-state-verified" aria-hidden />
        : <Copy className="size-3 opacity-0 transition-opacity group-hover/chip:opacity-70" aria-hidden />}
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
    </button>
  );
}

function PlanDagNodeImpl({ data, selected }: NodeProps<PlanStepNode>) {
  const s = STATUS[data.status];
  const ToolIcon = TOOL_ICON[data.tool];
  const isNew = data.addedInVersion === data.planVersion && data.planVersion > 1;
  const blocked = data.policy === "blocked" || data.status === "blocked";

  return (
    <div
      role="group"
      aria-label={`Step ${data.stepId}, ${data.tool}, ${s.label}`}
      className={[
        "relative w-[260px] overflow-hidden rounded-md border bg-card shadow-card",
        "transition-[transform,box-shadow,border-color] duration-150 ease-out",
        "hover:-translate-y-px hover:shadow-raised hover:border-line-strong",
        selected ? "border-accent/70 ring-2 ring-accent/25" : "border-line",
        isNew ? "border-dashed border-brand/60" : "",
        blocked ? "bg-[repeating-linear-gradient(135deg,transparent_0_8px,rgb(255_77_94/0.04)_8px_16px)]" : "",
        s.ring,
      ].join(" ")}
    >
      {/* status rail */}
      <span className={`absolute inset-y-0 left-0 w-[3px] ${s.bar}`} aria-hidden />

      <Handle type="target" position={Position.Left}  className="!size-2 !border-line-strong !bg-raised" />
      <Handle type="source" position={Position.Right} className="!size-2 !border-line-strong !bg-raised" />

      {/* header */}
      <div className="flex items-center gap-2 border-b border-line-faint px-3 py-2 pl-3.5">
        <span className="grid size-6 place-items-center rounded-sm bg-inset ring-1 ring-inset ring-line">
          <ToolIcon className="size-3.5 text-fg-muted" aria-hidden />
        </span>
        <code className="font-data text-xs font-medium text-fg">{data.tool}</code>
        {isNew && (
          <span className="ml-1 inline-flex items-center gap-0.5 rounded-xs bg-brand/10 px-1 text-2xs font-semibold text-brand">
            <Plus className="size-2.5" aria-hidden />v{data.planVersion}
          </span>
        )}
        <span className="ml-auto font-data text-2xs text-fg-subtle">{data.stepId}</span>
      </div>

      {/* body */}
      <div className="space-y-2 px-3 py-2.5 pl-3.5">
        <p className={`text-sm leading-snug ${blocked ? "text-fg-muted line-through decoration-state-blocked/50" : "text-fg"}`}>
          {data.summary}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <PolicyChip policy={data.policy} reason={data.policyReason} />
          <span className={`inline-flex items-center gap-1 text-2xs font-medium ${s.text}`}>
            <StatusIcon status={data.status} /> {s.label}
          </span>
          {data.durationMs != null && (
            <span className="ml-auto font-data text-2xs text-fg-subtle">{(data.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>

        {blocked && data.policyReason && (
          <p className="rounded-sm bg-state-blocked/8 px-2 py-1 text-2xs text-state-blocked/90 ring-1 ring-inset ring-state-blocked/25">
            {data.policyReason}
          </p>
        )}

        {!!data.evidenceIds?.length && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {data.evidenceIds.slice(0, 3).map((id) => <EvidenceChip key={id} id={id} />)}
            {data.evidenceIds.length > 3 && (
              <span className="font-data text-2xs text-fg-subtle">+{data.evidenceIds.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const PlanDagNode = memo(PlanDagNodeImpl);
export default PlanDagNode;
