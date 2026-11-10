import { ArrowRight, MousePointerClick } from "lucide-react";
import type { Finding, Graph, GraphEdge, GraphNode } from "@/lib/types";
import { riskMeta } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Timestamp } from "@/components/ui/timestamp";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { cn } from "@/lib/utils";
import { KIND_META } from "./meta";

const EVIDENCE_PREVIEW = 40;

interface EntityDetailsProps {
  caseId: string;
  node: GraphNode | null;
  edge?: GraphEdge | null;
  graph: Graph | undefined;
  findings: readonly Finding[];
  onSelectNode: (id: string) => void;
  onOpenFinding: (id: string) => void;
}

/** Right-hand panel for the selected graph node or edge. Every text here comes from the graph or findings data. */
export function EntityDetails({
  caseId,
  node,
  edge = null,
  graph,
  findings,
  onSelectNode,
  onOpenFinding,
}: EntityDetailsProps) {
  if (!graph) {
    return (
      <EmptyState
        icon={MousePointerClick}
        title="No entity selected"
        description="Select a node or edge in the graph to inspect its evidence, timing and connections."
      />
    );
  }

  const byId = new Map(graph.nodes.map((item): [string, GraphNode] => [item.id, item]));

  if (!node && edge) {
    const src = byId.get(edge.source);
    const dst = byId.get(edge.target);
    const prov = edge.provenance ?? "observed";
    const provTone = prov === "observed" ? "cyan" : prov === "inferred" ? "amber" : "neutral";
    const evidence = edge.event_ids.slice(0, EVIDENCE_PREVIEW);

    return (
      <div className="space-y-5">
        <section aria-labelledby="edge-identity" className="space-y-2">
          <p id="edge-identity" className="text-xs font-medium text-text-secondary">
            Relationship Edge
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-text">
            <button
              type="button"
              onClick={() => onSelectNode(edge.source)}
              className="rounded px-1 font-mono text-xs text-cyan hover:underline"
            >
              {src?.label ?? edge.source}
            </button>
            <ArrowRight className="size-3.5 text-text-muted" />
            <button
              type="button"
              onClick={() => onSelectNode(edge.target)}
              className="rounded px-1 font-mono text-xs text-cyan hover:underline"
            >
              {dst?.label ?? edge.target}
            </button>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 pt-1 text-sm">
            <dt className="text-xs text-text-secondary">Relation</dt>
            <dd className="font-mono text-xs text-text">{edge.relation ?? edge.label}</dd>
            <dt className="text-xs text-text-secondary">Provenance</dt>
            <dd>
              <Badge tone={provTone} mono>
                {prov}
              </Badge>
            </dd>
            <dt className="text-xs text-text-secondary">First seen</dt>
            <dd>{edge.ts ? <Timestamp iso={edge.ts} /> : "-"}</dd>
            <dt className="text-xs text-text-secondary">Last seen</dt>
            <dd>{edge.last_ts ? <Timestamp iso={edge.last_ts} /> : edge.ts ? <Timestamp iso={edge.ts} /> : "-"}</dd>
          </dl>
        </section>

        <section aria-labelledby="edge-evidence" className="space-y-2">
          <h3 id="edge-evidence" className="text-sm font-semibold text-text">
            Supporting evidence ({edge.event_ids.length})
          </h3>
          {evidence.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {evidence.map((eventId) => (
                <li key={eventId}>
                  <EvidenceChip caseId={caseId} eventId={eventId} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted">No linked evidence.</p>
          )}
        </section>
      </div>
    );
  }

  if (!node) {
    return (
      <EmptyState
        icon={MousePointerClick}
        title="No entity selected"
        description="Select a node or edge in the graph to inspect its evidence, timing and connections."
      />
    );
  }

  const { label, Icon, mono } = KIND_META[node.kind];
  const viaByNeighbour = new Map<string, string>();
  for (const e of graph.edges) {
    const other = e.source === node.id ? e.target : e.target === node.id ? e.source : null;
    if (other !== null && !viaByNeighbour.has(other)) viaByNeighbour.set(other, e.label);
  }
  const connections = [...viaByNeighbour].flatMap(([id, via]) => {
    const neighbour = byId.get(id);
    return neighbour ? [{ neighbour, via }] : [];
  });

  const findingById = new Map(findings.map((finding): [string, Finding] => [finding.id, finding]));
  const linked = node.finding_ids.flatMap((id) => {
    const finding = findingById.get(id);
    return finding ? [finding] : [];
  });
  const evidence = node.event_ids.slice(0, EVIDENCE_PREVIEW);
  const attrs = node.attributes ? Object.entries(node.attributes) : [];

  return (
    <div className="space-y-5">
      <section aria-labelledby="entity-identity" className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Icon aria-hidden className="size-3.5" />
          <span id="entity-identity">{label}</span>
        </p>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className={cn("min-w-0 break-all text-sm font-medium text-text", mono && "font-mono")}>{node.label}</p>
          <CopyButton value={node.label} label={`Copy ${label.toLowerCase()} ${node.label}`} />
        </div>
        <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 pt-1 text-sm">
          <dt className="text-xs text-text-secondary">Risk</dt>
          <dd>
            <StatusBadge meta={riskMeta(node.risk)} />
          </dd>
          <dt className="text-xs text-text-secondary">First seen</dt>
          <dd>{node.first_seen ? <Timestamp iso={node.first_seen} /> : "-"}</dd>
          <dt className="text-xs text-text-secondary">Last seen</dt>
          <dd>{node.last_seen ? <Timestamp iso={node.last_seen} /> : "-"}</dd>
          {attrs.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs text-text-secondary capitalize">{k.replaceAll("_", " ")}</dt>
              <dd className="font-mono text-xs text-text">{String(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="entity-evidence" className="space-y-2">
        <h3 id="entity-evidence" className="text-sm font-semibold text-text">
          Related evidence ({node.event_ids.length})
        </h3>
        {evidence.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {evidence.map((eventId) => (
              <li key={eventId}>
                <EvidenceChip caseId={caseId} eventId={eventId} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">No linked evidence.</p>
        )}
        {node.event_ids.length > evidence.length && (
          <p className="text-xs text-text-muted">
            Showing {evidence.length} of {node.event_ids.length}.
          </p>
        )}
      </section>

      <section aria-labelledby="entity-connections" className="space-y-2">
        <h3 id="entity-connections" className="text-sm font-semibold text-text">
          Connected entities ({connections.length})
        </h3>
        {connections.length > 0 ? (
          <ul className="space-y-1">
            {connections.map(({ neighbour, via }) => {
              const kind = KIND_META[neighbour.kind];
              return (
                <li key={neighbour.id}>
                  <button
                    type="button"
                    onClick={() => onSelectNode(neighbour.id)}
                    className="flex min-h-9 w-full items-center justify-between gap-2 rounded-sm border border-border px-2 text-left text-xs transition-colors hover:border-text-muted"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <kind.Icon aria-hidden className="size-3.5 shrink-0 text-text-muted" />
                      <span className={cn("truncate text-text", kind.mono && "font-mono")}>{neighbour.label}</span>
                    </span>
                    <span className="shrink-0 truncate font-mono text-[11px] text-text-muted">{via}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">No connected entities.</p>
        )}
      </section>

      <section aria-labelledby="entity-findings" className="space-y-2">
        <h3 id="entity-findings" className="text-sm font-semibold text-text">
          Related findings ({linked.length})
        </h3>
        {linked.length > 0 ? (
          <ul className="space-y-1">
            {linked.map((finding) => (
              <li key={finding.id}>
                <button
                  type="button"
                  onClick={() => onOpenFinding(finding.id)}
                  aria-label={`Open finding ${finding.id}: ${finding.title}`}
                  className="flex min-h-9 w-full items-center justify-between gap-2 rounded-sm border border-border px-2 text-left text-xs transition-colors hover:border-text-muted"
                >
                  <span className="min-w-0 truncate text-text">{finding.title}</span>
                  <Badge tone="cyan" mono>
                    {finding.id}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">No finding cites this entity.</p>
        )}
      </section>

      <section aria-labelledby="entity-explanation" className="space-y-2">
        <h3 id="entity-explanation" className="text-sm font-semibold text-text">
          Explanation from findings
        </h3>
        {linked.length > 0 ? (
          <ul className="space-y-3">
            {linked.map((finding) => (
              <li key={finding.id} className="space-y-1">
                <Badge tone="muted" mono>
                  {finding.id}
                </Badge>
                <p className="text-sm leading-relaxed text-text-secondary">{finding.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">No explanation yet. Findings that cite this entity appear here.</p>
        )}
      </section>
    </div>
  );
}
