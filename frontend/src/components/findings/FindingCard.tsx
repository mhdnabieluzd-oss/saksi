import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleCheck, CircleDashed, CircleX, Network } from "lucide-react";
import type { Finding } from "@/lib/types";
import { findingStatusMeta, type StatusMeta } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Timestamp } from "@/components/ui/timestamp";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { useReducedMotion } from "@/components/graph/useReducedMotion";
import { cn } from "@/lib/utils";
import { attackTechniqueUrl } from "./attack-links";
import { TechniqueChip } from "./TechniqueChip";

const ORIGIN_LABEL: Record<Finding["origin"], string> = {
  investigator: "AI investigator",
  triage_fallback: "Rule-based fallback",
  self_test: "Verifier self-test",
};

const CHECK_META: Record<"pass" | "fail" | "skipped", StatusMeta> = {
  pass: { label: "Pass", className: "text-green bg-green/10 border-green/30", Icon: CircleCheck },
  fail: { label: "Fail", className: "text-red bg-red/10 border-red/30", Icon: CircleX },
  skipped: { label: "Skipped", className: "text-text-muted bg-transparent border-border", Icon: CircleDashed },
};

const checkState = (passed: boolean | null): keyof typeof CHECK_META =>
  passed === null ? "skipped" : passed ? "pass" : "fail";

interface FindingCardProps {
  caseId: string;
  finding: Finding;
  /** True when this finding's evidence is highlighted in the graph. */
  focused: boolean;
  onToggleFocus: (id: string) => void;
}

/** One finding with its technique, status, evidence receipts and the verifier's checks. */
export function FindingCard({ caseId, finding, focused, onToggleFocus }: FindingCardProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [checksOpen, setChecksOpen] = useState(false);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [focused, reduced]);

  const rejected = finding.status === "rejected";
  const verification = finding.verification;
  const checksId = `checks-${finding.id}`;

  return (
    <article
      ref={ref}
      id={`finding-${finding.id}`}
      aria-labelledby={`finding-title-${finding.id}`}
      className={cn(
        "scroll-mt-4 space-y-3 rounded-md border bg-surface p-4",
        rejected ? "border-red/40" : "border-border",
        focused && "border-cyan",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="xsiam-sev-square"
            data-sev={
              rejected
                ? "low"
                : finding.confidence === "high"
                  ? "critical"
                  : finding.confidence === "medium"
                    ? "high"
                    : "medium"
            }
            title={`Confidence: ${finding.confidence}`}
          >
            {rejected ? "R" : finding.confidence === "high" ? "H" : finding.confidence === "medium" ? "M" : "L"}
          </span>
          <h3
            id={`finding-title-${finding.id}`}
            className={cn("min-w-0 text-sm font-semibold text-text", rejected && "text-text-secondary line-through")}
          >
            {finding.title}
          </h3>
        </div>
        <StatusBadge meta={findingStatusMeta(finding.status)} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {finding.technique_id && (
          <TechniqueChip
            id={finding.technique_id}
            name={finding.technique_name}
            href={attackTechniqueUrl(finding.technique_id)}
            source="MITRE ATT&CK"
          />
        )}
        {finding.tactic && <Badge tone="muted">{finding.tactic}</Badge>}
        <Badge tone="muted" title={verification?.verdict_reason || "Verifier confidence check"}>
          Confidence: {finding.confidence}
          {verification ? ` (${verification.checks.filter((c) => c.passed).length}/${verification.checks.length} checks)` : ""}
        </Badge>
        <Badge tone={finding.origin === "self_test" ? "cyan" : "muted"}>{ORIGIN_LABEL[finding.origin]}</Badge>
      </div>

      <p className="text-sm leading-relaxed text-text-secondary">{finding.summary}</p>

      {(finding.first_seen || finding.last_seen) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
          {finding.first_seen && (
            <span className="inline-flex items-center gap-1.5">
              First seen <Timestamp iso={finding.first_seen} />
            </span>
          )}
          {finding.last_seen && (
            <span className="inline-flex items-center gap-1.5">
              Last seen <Timestamp iso={finding.last_seen} />
            </span>
          )}
        </p>
      )}

      <section aria-labelledby={`receipts-${finding.id}`} className="space-y-2">
        <h4 id={`receipts-${finding.id}`} className="text-xs font-medium text-text-secondary">
          Evidence receipts ({finding.evidence_ids.length})
        </h4>
        {finding.evidence_ids.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {finding.evidence_ids.map((eventId) => (
              <li key={eventId}>
                <EvidenceChip caseId={caseId} eventId={eventId} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">No evidence cited.</p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" aria-expanded={checksOpen} aria-controls={checksId} onClick={() => setChecksOpen((open) => !open)}>
          <ChevronDown aria-hidden className={cn("transition-transform", checksOpen && "rotate-180")} />
          Verification checks ({verification?.checks.length ?? 0})
        </Button>
        <Button variant="secondary" size="sm" aria-pressed={focused} onClick={() => onToggleFocus(finding.id)}>
          <Network aria-hidden />
          Highlight in graph
        </Button>
      </div>

      {checksOpen && (
        <div id={checksId} className="space-y-3 rounded-md border border-border p-3">
          {verification ? (
            <>
              <ul className="divide-y divide-border">
                {verification.checks.map((check) => (
                  <li
                    key={check.name}
                    className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <div className="shrink-0 sm:w-32">
                      <StatusBadge meta={CHECK_META[checkState(check.passed)]} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text">{check.name.replaceAll("_", " ")}</p>
                      <p className="text-xs break-words text-text-secondary">{check.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-secondary">
                <span className="font-medium text-text">Verdict: </span>
                {verification.verdict_reason}
              </p>
            </>
          ) : (
            <p className="text-xs text-text-muted">No verification recorded.</p>
          )}
        </div>
      )}
    </article>
  );
}
