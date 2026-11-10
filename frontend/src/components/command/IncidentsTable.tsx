import { Link, useNavigate } from "react-router-dom";
import { caseStatusMeta } from "@/components/investigations/caseStatus";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Timestamp } from "@/components/ui/timestamp";
import { formatRelative, severityMeta } from "@/lib/format";
import type { CaseSummary } from "@/lib/types";

export function IncidentsTable({ cases }: { cases: CaseSummary[] }) {
  const navigate = useNavigate();
  return (
    <Table label="Recent incidents">
      <TableHeader>
        <tr>
          <TableHead>Case</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {cases.map((c) => {
          const to = `/app/cases/${c.id}`;
          return (
            <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(to)}>
              <TableCell>
                <Link
                  to={to}
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-sm font-mono text-xs whitespace-nowrap text-cyan hover:underline"
                >
                  {c.id}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{c.title}</span>
                  {c.scenario && <Badge tone="muted">Simulated scenario</Badge>}
                  {c.recorded_run && <Badge tone="cyan">Recorded run</Badge>}
                </div>
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
                <div className="text-xs text-text-secondary">{formatRelative(c.created_at)}</div>
                <Timestamp iso={c.created_at} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
