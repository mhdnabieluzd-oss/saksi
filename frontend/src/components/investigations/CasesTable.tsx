import { useNavigate, Link } from "react-router-dom";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Timestamp } from "@/components/ui/timestamp";
import { AgentAvatar, AGENT_IDENTITY_META } from "@/components/agents/identity";
import { severityMeta } from "@/lib/format";
import type { AgentEvent, AgentName, CaseSummary } from "@/lib/types";
import { caseStatusMeta } from "./caseStatus";

function latestAgentForCase(c: CaseSummary, recentEvents: AgentEvent[]): { agent: AgentName; ts: string } | null {
  const match = recentEvents.find((e) => e.case_id === c.id);
  if (match) return { agent: match.agent, ts: match.ts };
  if (c.status === "completed") return { agent: "reporter", ts: c.created_at };
  if (c.status === "running") return { agent: "investigator", ts: c.created_at };
  return null;
}

export function CasesTable({
  cases,
  recentEvents = [],
}: {
  cases: CaseSummary[];
  recentEvents?: AgentEvent[];
}) {
  const navigate = useNavigate();
  return (
    <Table label="All investigations">
      <TableHeader>
        <tr>
          <TableHead>Case</TableHead>
          <TableHead>Title & Classification</TableHead>
          <TableHead>Sources</TableHead>
          <TableHead>Events</TableHead>
          <TableHead>Verified Findings</TableHead>
          <TableHead>Shield</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Stage</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Quick Open</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {cases.map((c) => {
          const to = `/app/cases/${encodeURIComponent(c.id)}`;
          const lastStage = latestAgentForCase(c, recentEvents);
          return (
            <TableRow key={c.id} className="cursor-pointer group" onClick={() => navigate(to)}>
              <TableCell>
                <Link
                  to={to}
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-sm font-mono text-xs font-medium whitespace-nowrap text-cyan hover:underline"
                >
                  {c.id}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-text">{c.title}</span>
                  <span className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                    {c.classification}
                  </span>
                  {c.scenario && <Badge tone="muted">Simulated scenario</Badge>}
                  {c.recorded_run && <Badge tone="cyan">Recorded run</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-xs text-text-secondary">
                {c.sources.length} ·{" "}
                {Array.from(new Set(c.sources.map((source) => source.kind))).join(", ") || "none"}
              </TableCell>
              <TableCell className="font-mono text-xs tabular-nums">
                {c.event_count.toLocaleString()}
              </TableCell>
              <TableCell className="font-mono text-xs tabular-nums">
                <span className={c.verified_count > 0 ? "text-emerald-400 font-medium" : "text-text-secondary"}>
                  {c.verified_count}
                </span>{" "}
                / {c.finding_count}
              </TableCell>
              <TableCell className="font-mono text-xs tabular-nums">
                {c.shield_alert_count > 0 ? (
                  <span className="text-amber font-medium">{c.shield_alert_count} quarantined</span>
                ) : (
                  <span className="text-text-muted">0</span>
                )}
              </TableCell>
              <TableCell>
                {c.severity ? (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="xsiam-sev-square" data-sev={c.severity} aria-hidden>
                      {c.severity[0].toUpperCase()}
                    </span>
                    <StatusBadge meta={severityMeta(c.severity)} />
                  </div>
                ) : (
                  <Badge tone="muted">Not scored</Badge>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge meta={caseStatusMeta(c.status)} />
              </TableCell>
              <TableCell>
                {lastStage ? (
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <AgentAvatar role={lastStage.agent} size={16} state="completed" decorative />
                    <span>{AGENT_IDENTITY_META[lastStage.agent].canonicalName}</span>
                  </div>
                ) : (
                  <span className="text-xs text-text-muted">Not started</span>
                )}
              </TableCell>
              <TableCell>
                <Timestamp iso={c.created_at} />
              </TableCell>
              <TableCell
                className="text-right"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="inline-flex items-center gap-2 text-xs">
                  <Link to={to} className="font-medium text-cyan hover:underline">
                    Map
                  </Link>
                  <span className="text-text-muted">·</span>
                  <Link to={`${to}?view=plan`} className="text-text-secondary hover:text-text hover:underline">
                    Plan
                  </Link>
                  <span className="text-text-muted">·</span>
                  <Link to={`${to}?view=responses`} className="text-text-secondary hover:text-text hover:underline">
                    Responses
                  </Link>
                  <span className="text-text-muted">·</span>
                  <Link to={`${to}/reports`} className="text-text-secondary hover:text-text hover:underline">
                    Brief
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
