import {
  Bot,
  Briefcase,
  FileSearch,
  FileText,
  LayoutDashboard,
  Route as RouteIcon,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { agentStateMeta, severityMeta } from "@/lib/format";
import type { AgentState } from "@/lib/types";

const SIDEBAR_ICONS: LucideIcon[] = [LayoutDashboard, Briefcase, Bot, FileSearch, RouteIcon, FileText, Settings];

// Illustrative snapshot only. No live or case data is shown on the landing page.
const PREVIEW_AGENTS: Array<{ name: string; state: AgentState }> = [
  { name: "Triage", state: "completed" },
  { name: "Investigator", state: "completed" },
  { name: "Verifier", state: "running" },
  { name: "Reporter", state: "queued" },
];

const GRAPH_NODES = [
  { id: "ip", x: 58, y: 48, label: "IP", tone: "var(--color-cyan)" },
  { id: "host", x: 262, y: 44, label: "Host", tone: "var(--color-green)" },
  { id: "user", x: 54, y: 152, label: "User", tone: "var(--color-cyan)" },
  { id: "proc", x: 264, y: 156, label: "Process", tone: "var(--color-green)" },
] as const;

const HUB = { x: 160, y: 100 };

function RelationshipGraph() {
  return (
    <svg viewBox="0 0 320 200" aria-hidden className="h-44 w-full rounded-md border border-border bg-bg">
      {GRAPH_NODES.map((node) => (
        <line
          key={`edge-${node.id}`}
          x1={HUB.x}
          y1={HUB.y}
          x2={node.x}
          y2={node.y}
          style={{ stroke: "var(--color-border)" }}
          strokeWidth="1.5"
        />
      ))}
      <line x1={58} y1={48} x2={54} y2={152} style={{ stroke: "var(--color-cyan)" }} strokeWidth="1" strokeDasharray="4 3" />
      <line x1={262} y1={44} x2={264} y2={156} style={{ stroke: "var(--color-green)" }} strokeWidth="1" strokeDasharray="4 3" />
      {GRAPH_NODES.map((node) => (
        <g key={node.id}>
          <circle cx={node.x} cy={node.y} r="9" style={{ fill: "var(--color-surface-elevated)", stroke: node.tone }} strokeWidth="1.5" />
          <text
            x={node.x}
            y={node.y + 22}
            textAnchor="middle"
            style={{ fill: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}
            fontSize="9"
          >
            {node.label}
          </text>
        </g>
      ))}
      <circle cx={HUB.x} cy={HUB.y} r="22" style={{ fill: "color-mix(in srgb, var(--color-red) 14%, transparent)" }} />
      <circle cx={HUB.x} cy={HUB.y} r="13" style={{ fill: "var(--color-red)" }} />
      <text
        x={HUB.x}
        y={HUB.y + 36}
        textAnchor="middle"
        style={{ fill: "var(--color-text)", fontFamily: "var(--font-mono)" }}
        fontSize="9"
      >
        Alert
      </text>
    </svg>
  );
}

/** Stylised dashboard preview for the landing hero. Labelled as a preview, with no live data. */
export function HeroPreview() {
  return (
    <figure
      aria-label="Product preview of the SAKSI investigation workspace"
      className="w-full md:[transform:perspective(1400px)_rotateY(-6deg)_rotateX(2deg)]"
    >
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_24px_60px_rgb(0_0_0/0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <span className="text-xs font-medium text-text-secondary">SAKSI investigation workspace</span>
          <span className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-text-muted">Product preview</span>
        </div>
        <div className="flex">
          <div aria-hidden className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-border py-3">
            {SIDEBAR_ICONS.map((Icon, index) => (
              <span
                key={index}
                className={
                  index === 1
                    ? "flex size-8 items-center justify-center rounded-md bg-surface-elevated text-cyan"
                    : "flex size-8 items-center justify-center rounded-md text-text-muted"
                }
              >
                <Icon className="size-4" />
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-cyan">Active case</span>
              <StatusBadge meta={severityMeta("critical")} />
            </div>
            <RelationshipGraph />
            <ul className="grid grid-cols-2 gap-2">
              {PREVIEW_AGENTS.map((agent) => (
                <li
                  key={agent.name}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-bg px-2.5 py-2"
                >
                  <span className="truncate text-xs font-medium text-text">{agent.name}</span>
                  <StatusBadge meta={agentStateMeta(agent.state)} className="shrink-0 text-[11px]" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </figure>
  );
}
