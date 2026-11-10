import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { ShieldAlert as ShieldAlertItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { EmptyState } from "@/components/ui/empty-state";
import { Timestamp } from "@/components/ui/timestamp";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { atlasTechniqueUrl } from "./attack-links";
import { TechniqueChip } from "./TechniqueChip";

interface ShieldAlertsProps {
  caseId: string;
  alerts: readonly ShieldAlertItem[];
}

/** Prompt-injection attempts caught in the logs. The excerpt is shown to the analyst; the AI never sees it. */
export function ShieldAlerts({ caseId, alerts }: ShieldAlertsProps) {
  if (alerts.length === 0) {
    return <EmptyState icon={ShieldCheck} title="No manipulation attempts detected" />;
  }

  return (
    <ul className="space-y-3">
      {alerts.map((alert) => (
        <li key={alert.id} className="space-y-3 rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="muted" mono>
              {alert.id}
            </Badge>
            <Badge tone="amber">
              <ShieldAlert aria-hidden className="size-3.5" />
              Quarantined: never shown to the AI
            </Badge>
          </div>

          <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-xs text-text-secondary">Event</dt>
            <dd>
              <EvidenceChip caseId={caseId} eventId={alert.event_id} />
            </dd>
            <dt className="text-xs text-text-secondary">ATLAS technique</dt>
            <dd>
              <TechniqueChip
                id={alert.atlas_technique}
                name={alert.atlas_name}
                href={atlasTechniqueUrl(alert.atlas_technique)}
                source="MITRE ATLAS"
              />
            </dd>
            <dt className="text-xs text-text-secondary">Pattern</dt>
            <dd className="font-mono text-xs break-all text-text">{alert.pattern}</dd>
            <dt className="text-xs text-text-secondary">Detected</dt>
            <dd>
              <Timestamp iso={alert.detected_at} />
            </dd>
          </dl>

          <CodeBlock code={alert.excerpt} label="Excerpt" />
        </li>
      ))}
    </ul>
  );
}
