import { useMemo, useState, type ReactNode } from "react";
import {
  Background,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitCommitHorizontal, Info, List, Maximize2, Network, RotateCcw, Waypoints, ZoomIn, ZoomOut } from "lucide-react";
import type { Graph, NodeKind } from "@/lib/types";
import { riskMeta } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { EntityNode, type EntityFlowNode } from "./EntityNode";
import { KindToggles } from "./KindToggles";
import { layoutGraph } from "./layout";
import { KIND_META } from "./meta";
import { useControllableState } from "./useControllableState";
import { useReducedMotion } from "./useReducedMotion";

const NODE_TYPES = { entity: EntityNode };
const FIT = { padding: 0.12, maxZoom: 1.2 };
const NO_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>();
const EDGE_IDLE = "#64748b";
const EDGE_LIT = "#22d3ee";
const LABEL_FONT = "IBM Plex Mono, ui-monospace, monospace";

export interface AttackGraphProps {
  graph: Graph;
  /** Nodes to highlight. When empty, the selected node's neighbourhood is highlighted instead. */
  highlightNodeIds?: readonly string[];
  /** Edges to highlight and animate. */
  highlightEdgeIds?: readonly string[];
  /** Edges with step above this are dimmed, and nodes not touched by a revealed edge are dimmed. */
  revealUpToStep?: number | null;
  /** Controlled selection. Pass null for none. */
  selectedNodeId?: string | null;
  onSelectNode?: (id: string | null) => void;
  /** Controlled edge selection. */
  selectedEdgeId?: string | null;
  onSelectEdge?: (id: string | null) => void;
  /** Controlled kind filter. Without it the graph keeps its own. */
  hiddenKinds?: ReadonlySet<NodeKind>;
  onHiddenKindsChange?: (next: ReadonlySet<NodeKind>) => void;
  className?: string;
  /** Rendered first in the toolbar, for page-level controls such as a panel toggle. */
  toolbarExtra?: ReactNode;
  /** Canvas height in px. Workspace uses 560, story page 520. */
  height?: number;
}

/** Attack relationship graph: layout by step and kind, selection neighbourhood, kind filter and reveal. */
export function AttackGraph(props: AttackGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({
  graph,
  highlightNodeIds,
  highlightEdgeIds,
  revealUpToStep = null,
  selectedNodeId,
  onSelectNode,
  selectedEdgeId,
  onSelectEdge,
  hiddenKinds,
  onHiddenKindsChange,
  className,
  toolbarExtra,
  height = 560,
}: AttackGraphProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const reduced = useReducedMotion();
  const duration = reduced ? 0 : 200;
  const [selected, setSelected] = useControllableState<string | null>(selectedNodeId, onSelectNode, null);
  const [selectedEdge, setSelectedEdge] = useControllableState<string | null>(selectedEdgeId, onSelectEdge, null);
  const [hidden, setHidden] = useControllableState<ReadonlySet<NodeKind>>(hiddenKinds, onHiddenKindsChange, NO_KINDS);
  const [expand, setExpand] = useState(false);
  const [sharedOnly, setSharedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"canvas" | "list">("canvas");
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [provenanceFilter, setProvenanceFilter] = useState<"all" | "observed" | "inferred" | "contextual">("all");

  const positions = useMemo(() => layoutGraph(graph), [graph]);

  const sharedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (node.finding_ids.length >= 2) ids.add(node.id);
    }
    return ids;
  }, [graph.nodes]);

  const neighbourhood = useMemo(() => {
    if (!selected) return null;
    const nodeIds = new Set<string>([selected]);
    const edgeIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.source !== selected && edge.target !== selected) continue;
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
      edgeIds.add(edge.id);
    }
    return { nodeIds, edgeIds };
  }, [graph.edges, selected]);

  const litNodes = useMemo(() => {
    if (highlightNodeIds?.length) return new Set(highlightNodeIds);
    return neighbourhood?.nodeIds ?? null;
  }, [highlightNodeIds, neighbourhood]);

  const litEdges = useMemo(() => {
    if (highlightEdgeIds?.length) return new Set(highlightEdgeIds);
    return neighbourhood?.edgeIds ?? null;
  }, [highlightEdgeIds, neighbourhood]);

  const revealed = useMemo(() => {
    if (revealUpToStep === null) return null;
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.step === null || edge.step > revealUpToStep) continue;
      edgeIds.add(edge.id);
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    }
    return { nodeIds, edgeIds };
  }, [graph.edges, revealUpToStep]);

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (hidden.has(node.kind)) continue;
      if (sharedOnly && !sharedNodeIds.has(node.id)) continue;
      if (expand && neighbourhood && !neighbourhood.nodeIds.has(node.id)) continue;
      ids.add(node.id);
    }
    return ids;
  }, [graph.nodes, hidden, sharedOnly, sharedNodeIds, expand, neighbourhood]);

  const flowNodes = useMemo<EntityFlowNode[]>(
    () =>
      graph.nodes
        .filter((node) => visibleNodeIds.has(node.id))
        .map((node) => ({
          id: node.id,
          type: "entity",
          position: positions.get(node.id) ?? { x: 0, y: 0 },
          draggable: false,
          selectable: true,
          connectable: false,
          selected: node.id === selected,
          data: {
            node,
            selected: node.id === selected,
            shared: sharedNodeIds.has(node.id),
            dimmed:
              (litNodes !== null && !litNodes.has(node.id)) ||
              (revealed !== null && !revealed.nodeIds.has(node.id)),
            onActivate: (id: string) => {
              setSelectedEdge(null);
              setSelected(selected === id ? null : id);
            },
          },
        })),
    [graph.nodes, visibleNodeIds, positions, selected, sharedNodeIds, litNodes, revealed, setSelected, setSelectedEdge],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      graph.edges
        .filter(
          (edge) =>
            visibleNodeIds.has(edge.source) &&
            visibleNodeIds.has(edge.target) &&
            (provenanceFilter === "all" || (edge.provenance ?? "observed") === provenanceFilter) &&
            (!expand || !neighbourhood || neighbourhood.edgeIds.has(edge.id)),
        )
        .map((edge) => {
          const from = positions.get(edge.source);
          const to = positions.get(edge.target);
          const fromX = from?.x ?? 0;
          const toX = to?.x ?? 0;
          const isEdgeSelected = selectedEdge === edge.id;
          const lit = isEdgeSelected || (litEdges?.has(edge.id) ?? false);
          const dimmed = (litEdges !== null && !lit) || (revealed !== null && !revealed.edgeIds.has(edge.id));
          const prov = edge.provenance ?? "observed";
          const color = lit ? EDGE_LIT : prov === "inferred" ? "#f59e0b" : EDGE_IDLE;
          const dashArray = prov === "inferred" ? "6 4" : prov === "contextual" ? "2 4" : undefined;
          const provTag = prov === "inferred" ? " [Inferred]" : prov === "contextual" ? " [Contextual]" : "";
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: fromX > toX ? "source-left" : "source-right",
            targetHandle: fromX < toX ? "target-left" : "target-right",
            type: "smoothstep",
            animated: lit && !reduced,
            label: (lit || hoveredEdge === edge.id) && !dimmed ? `${edge.label}${provTag}` : undefined,
            selectable: true,
            style: {
              stroke: color,
              strokeWidth: isEdgeSelected ? 3 : lit ? 2.5 : 1.6,
              strokeDasharray: dashArray,
              opacity: dimmed ? 0.2 : 1,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
            labelStyle: { fill: "#e2e8f0", fontFamily: LABEL_FONT, fontSize: 11 },
            labelBgStyle: { fill: "#111c2d", stroke: "#263449" },
            labelBgPadding: [6, 3] as [number, number],
            labelBgBorderRadius: 4,
          };
        }),
    [
      graph.edges,
      visibleNodeIds,
      provenanceFilter,
      expand,
      neighbourhood,
      positions,
      selectedEdge,
      litEdges,
      revealed,
      reduced,
      hoveredEdge,
    ],
  );

  const onEdgeEnter: EdgeMouseHandler = (_event, edge) => setHoveredEdge(edge.id);
  const onEdgeLeave = () => setHoveredEdge(null);

  function reset() {
    setHidden(NO_KINDS);
    setExpand(false);
    setSharedOnly(false);
    setSelected(null);
    setSelectedEdge(null);
    void fitView({ duration, ...FIT });
  }

  if (graph.nodes.length === 0) {
    return <EmptyState icon={Network} title="No entities in the graph" />;
  }

  const totalNodes = graph.total_nodes ?? graph.nodes.length;
  const isTruncated = graph.truncated === true || totalNodes > graph.nodes.length;

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {isTruncated && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber"
        >
          <span className="flex items-center gap-2">
            <Info className="size-3.5 shrink-0" />
            Showing {graph.nodes.length} of {totalNodes} discovered entities (ranked by risk and evidence volume).
          </span>
          <span className="font-mono text-[11px]">Cap: 60 nodes</span>
        </div>
      )}

      <div role="toolbar" aria-label="Graph controls" className="flex flex-wrap items-center gap-2">
        {toolbarExtra}
        <div role="group" aria-label="Graph display mode" className="inline-flex rounded-md border border-border bg-surface p-0.5">
          <button
            type="button"
            aria-pressed={viewMode === "canvas"}
            onClick={() => setViewMode("canvas")}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
              viewMode === "canvas" ? "bg-surface-elevated text-cyan" : "text-text-secondary hover:text-text",
            )}
          >
            <Network className="size-3.5" />
            Graph
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
              viewMode === "list" ? "bg-surface-elevated text-cyan" : "text-text-secondary hover:text-text",
            )}
          >
            <List className="size-3.5" />
            List ({flowNodes.length})
          </button>
        </div>

        {viewMode === "canvas" && (
          <>
            <Button variant="secondary" size="sm" aria-label="Zoom in" onClick={() => void zoomIn({ duration })}>
              <ZoomIn />
            </Button>
            <Button variant="secondary" size="sm" aria-label="Zoom out" onClick={() => void zoomOut({ duration })}>
              <ZoomOut />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void fitView({ duration, ...FIT })}>
              <Maximize2 />
              Fit view
            </Button>
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={expand}
          disabled={!selected}
          onClick={() => setExpand((value) => !value)}
        >
          <Waypoints />
          Expand neighbours
        </Button>
        {sharedNodeIds.size > 0 && (
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={sharedOnly}
            onClick={() => setSharedOnly((v) => !v)}
            title="Show only entities that correlate across 2 or more findings"
          >
            <GitCommitHorizontal />
            Shared entities ({sharedNodeIds.size})
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={reset}>
          <RotateCcw />
          Reset
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <KindToggles nodes={graph.nodes} hidden={hidden} onChange={setHidden} inline />
        <div role="group" aria-label="Edge provenance filter" className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <button
            type="button"
            onClick={() => setProvenanceFilter("all")}
            className={cn(
              "rounded border px-2 py-1 text-xs transition-colors",
              provenanceFilter === "all" ? "border-cyan bg-cyan/10 text-cyan" : "border-border bg-surface hover:text-text",
            )}
          >
            All edges ({graph.edges.length})
          </button>
          <button
            type="button"
            onClick={() => setProvenanceFilter("observed")}
            className={cn(
              "flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors",
              provenanceFilter === "observed" ? "border-cyan bg-cyan/10 text-cyan" : "border-border bg-surface hover:text-text",
            )}
          >
            <span className="inline-block h-0.5 w-3.5 bg-text-secondary" />
            Observed
          </button>
          <button
            type="button"
            onClick={() => setProvenanceFilter("inferred")}
            className={cn(
              "flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors",
              provenanceFilter === "inferred" ? "border-amber bg-amber/10 text-amber" : "border-border bg-surface hover:text-text",
            )}
          >
            <span className="inline-block h-0.5 w-3.5 border-b-2 border-dashed border-amber" />
            Inferred
          </button>
          <button
            type="button"
            onClick={() => setProvenanceFilter("contextual")}
            className={cn(
              "flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors",
              provenanceFilter === "contextual" ? "border-cyan bg-cyan/10 text-cyan" : "border-border bg-surface hover:text-text",
            )}
          >
            <span className="inline-block h-0.5 w-3.5 border-b-2 border-dotted border-text-muted" />
            Contextual
          </button>
        </div>
      </div>

      {viewMode === "list" ? (
        <div
          role="region"
          aria-label="Entity list view"
          className="overflow-x-auto rounded-md border border-border bg-surface"
        >
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 font-medium">Evidence</th>
                <th className="px-3 py-2 font-medium">Findings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {flowNodes.map(({ data: { node } }) => {
                const k = KIND_META[node.kind];
                const isSel = selected === node.id;
                return (
                  <tr
                    key={node.id}
                    onClick={() => {
                      setSelectedEdge(null);
                      setSelected(isSel ? null : node.id);
                    }}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-surface-elevated",
                      isSel && "bg-cyan/10",
                    )}
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-text">{node.label}</td>
                    <td className="px-3 py-2 text-text-secondary">{k.label}</td>
                    <td className="px-3 py-2">
                      <StatusBadge meta={riskMeta(node.risk)} />
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">{node.event_ids.length} ev</td>
                    <td className="px-3 py-2 font-mono text-cyan">{node.finding_ids.join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          role="region"
          aria-label="Attack relationship graph"
          className="relative min-w-0 overflow-hidden rounded-md border border-border bg-surface"
          style={{ height }}
        >
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            colorMode="dark"
            fitView
            fitViewOptions={FIT}
            minZoom={0.3}
            maxZoom={2}
            style={{ backgroundColor: "var(--color-surface)" }}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            elementsSelectable
            edgesFocusable
            onNodeClick={(_event, node) => {
              setSelectedEdge(null);
              setSelected(selected === node.id ? null : node.id);
            }}
            onEdgeClick={(_event, edge) => {
              setSelected(null);
              setSelectedEdge(selectedEdge === edge.id ? null : edge.id);
            }}
            onPaneClick={() => {
              setSelected(null);
              setSelectedEdge(null);
            }}
            onEdgeMouseEnter={onEdgeEnter}
            onEdgeMouseLeave={onEdgeLeave}
          >
            <Background color="#263449" gap={24} size={1.2} />
          </ReactFlow>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <span>
          Glyph scale: <span className="font-mono">S</span> (1–4 ev) · <span className="font-mono">M</span> (5–14 ev) ·{" "}
          <span className="font-mono">L</span> (15+ ev)
        </span>
        {selectedEdge && (
          <Badge tone="cyan" mono>
            Selected edge: {selectedEdge}
          </Badge>
        )}
      </div>
    </div>
  );
}
