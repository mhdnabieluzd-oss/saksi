import { Briefcase, CheckCircle2, FileCheck, ShieldAlert } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import type { CaseSummary, Overview } from "@/lib/types";

export function MetricsRow({
  overview,
  cases = [],
}: {
  overview: Overview;
  cases?: CaseSummary[];
}) {
  const verifiedFindingsTotal = cases.reduce((acc, c) => acc + c.verified_count, 0);
  const candidateFindingsTotal = cases.reduce((acc, c) => acc + c.finding_count, 0);
  const shieldAlertsTotal = cases.reduce((acc, c) => acc + c.shield_alert_count, 0);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard
        label="Investigations"
        value={overview.cases_total}
        icon={Briefcase}
        hint={`${overview.active_investigations} active or new · ${overview.cases_total - overview.active_investigations} completed`}
      />
      <MetricCard
        label="Critical incidents"
        value={overview.critical_incidents}
        icon={ShieldAlert}
        tone={overview.critical_incidents > 0 ? "red" : "neutral"}
        hint={
          shieldAlertsTotal > 0
            ? `${shieldAlertsTotal} prompt-injection attempt(s) quarantined`
            : "Cases with critical verified findings"
        }
      />
      <MetricCard
        label="Findings verified"
        value={`${verifiedFindingsTotal} / ${candidateFindingsTotal}`}
        icon={CheckCircle2}
        tone={verifiedFindingsTotal > 0 ? "green" : "neutral"}
        hint="Verified by independent Verifier against raw events"
      />
      <MetricCard
        label="Evidence hash check"
        value={`${overview.evidence_verified} / ${overview.evidence_total}`}
        icon={FileCheck}
        tone={
          overview.evidence_total > 0 && overview.evidence_verified === overview.evidence_total
            ? "green"
            : "neutral"
        }
        hint="Ingested events matching their stored SHA-256"
      />
    </div>
  );
}
