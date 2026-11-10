import type { CSSProperties } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { riskMeta } from "@/lib/format";
import type { GraphNode, Risk } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NODE_H, NODE_W } from "./layout";
import { KIND_META, RISK_TEXT } from "./meta";

export type EntityNodeData = {
  node: GraphNode;
  selected: boolean;
  dimmed: boolean;
  shared?: boolean;
  onActivate: (id: string) => void;
};

export type EntityFlowNode = Node<EntityNodeData, "entity">;

// Edges attach to the side facing the other node. Handles are invisible and never interactive.
const HANDLE_STYLE: CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: 0,
  pointerEvents: "none",
};

const GLYPH_RING: Record<Risk, string> = {
  critical: "border-red/60 bg-red/15 text-red",
  high: "border-red/45 bg-red/10 text-red",
  medium: "border-amber/50 bg-amber/10 text-amber",
  low: "border-cyan/50 bg-cyan/10 text-cyan",
  none: "border-border bg-surface-elevated text-text-muted",
};

const NODE_BORDER: Record<Risk, string> = {
  critical: "border-red/55",
  high: "border-red/40",
  medium: "border-amber/45",
  low: "border-cyan/45",
  none: "border-border",
};

export function EntityNode({ data }: NodeProps<EntityFlowNode>) {
  const { node, selected, dimmed, shared, onActivate } = data;
  const { label, Icon, mono } = KIND_META[node.kind];
  const risk = riskMeta(node.risk);
  const evCount = node.event_ids.length;
  // 3 explicit degree/evidence tiers: 1-4 (S), 5-14 (M), 15+ (L)
  const glyphSize = evCount >= 15 ? "size-9" : evCount >= 5 ? "size-8" : "size-7";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label} ${node.label}. Risk: ${risk.label}. ${evCount} events.`}
      onClick={() => onActivate(node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate(node.id);
        }
      }}
      style={{ width: NODE_W, height: NODE_H }}
      className={cn(
        "relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-md border bg-surface px-2.5 text-left shadow-sm transition-all duration-200",
        NODE_BORDER[node.risk],
        shared && !selected && "ring-1 ring-cyan/50",
        selected && "bg-surface-elevated ring-2 ring-cyan",
        dimmed && "opacity-35",
      )}
    >
      <Handle type="target" position={Position.Left} id="target-left" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Right} id="target-right" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Left} id="source-left" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="source-right" isConnectable={false} style={HANDLE_STYLE} />

      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-sm border transition-transform",
          glyphSize,
          GLYPH_RING[node.risk],
        )}
      >
        <Icon className="size-4" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className={cn("truncate text-xs font-semibold text-text", mono && "font-mono")} title={node.label}>
          {node.label}
        </span>
        <span className="flex items-center justify-between gap-1.5 text-xs">
          <span className={cn("font-medium", RISK_TEXT[node.risk])}>{risk.label}</span>
          <span className="rounded-sm bg-bg px-1.5 py-0.2 font-mono text-[11px] text-text-secondary tabular-nums">
            {evCount} ev
          </span>
        </span>
      </span>
    </div>
  );
}
