import type { Graph, GraphNode } from "@/lib/types";
import { isInternalIp } from "./meta";

export const NODE_W = 184;
export const NODE_H = 56;
const COL_W = 228;
const ROW_H = 84;

export interface Point {
  x: number;
  y: number;
}

const timeOf = (node: GraphNode): number => {
  const time = node.first_seen ? Date.parse(node.first_seen) : NaN;
  return Number.isNaN(time) ? Infinity : time;
};

const byFirstSeen = (a: GraphNode, b: GraphNode): number => {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.label.localeCompare(b.label);
};

/** Host a process or file belongs to. Process ids end in "@HOST" by convention. */
const hostSuffix = (id: string): string | null => {
  const at = id.lastIndexOf("@");
  return at >= 0 ? id.slice(at + 1) : null;
};

/**
 * Attack-order layout, left to right: external sources, one column per internal host
 * (host on top, then its users, processes and files by first_seen), external destinations, then anything unplaced.
 */
export function layoutGraph(graph: Graph): Map<string, Point> {
  const nodeById = new Map(graph.nodes.map((node): [string, GraphNode] => [node.id, node]));
  const incoming = new Set(graph.edges.map((edge) => edge.target));
  const edgesOf = (id: string) =>
    graph.edges
      .filter((edge) => edge.source === id || edge.target === id)
      .sort((a, b) => a.ts.localeCompare(b.ts));

  // Host label a node belongs to, or null when it cannot be placed.
  const hostOf = (node: GraphNode): string | null => {
    if (node.kind === "host") return node.label;
    const suffix = hostSuffix(node.id);
    if (suffix !== null) return suffix;
    for (const edge of edgesOf(node.id)) {
      const other = nodeById.get(edge.source === node.id ? edge.target : edge.source);
      if (!other) continue;
      if (other.kind === "host") return other.label;
      const otherSuffix = hostSuffix(other.id);
      if (otherSuffix !== null) return otherSuffix;
    }
    return null;
  };

  const hosts = graph.nodes.filter((node) => node.kind === "host").sort(byFirstSeen);
  const hostColumn = new Map(hosts.map((host, index) => [host.label, index]));
  const columns: GraphNode[][] = [];

  const sources: GraphNode[] = [];
  const destinations: GraphNode[] = [];
  const unplaced: GraphNode[] = [];
  const onHost: GraphNode[][] = hosts.map(() => []);

  for (const node of graph.nodes) {
    if (node.kind === "host") continue;
    const external = (node.kind === "ip" && !isInternalIp(node.label)) || node.kind === "domain";
    if (external) {
      if (incoming.has(node.id)) destinations.push(node);
      else sources.push(node);
      continue;
    }
    const host = hostOf(node);
    const column = host === null ? undefined : hostColumn.get(host);
    if (column === undefined) unplaced.push(node);
    else onHost[column].push(node);
  }

  if (sources.length) columns.push(sources.sort(byFirstSeen));
  hosts.forEach((host, index) => {
    const rest = onHost[index].sort(byFirstSeen);
    columns.push([host, ...rest]);
  });
  if (destinations.length) columns.push(destinations.sort(byFirstSeen));
  if (unplaced.length) columns.push(unplaced.sort(byFirstSeen));

  const positions = new Map<string, Point>();
  columns.forEach((column, col) => {
    column.forEach((node, row) => positions.set(node.id, { x: col * COL_W, y: row * ROW_H }));
  });
  return positions;
}
