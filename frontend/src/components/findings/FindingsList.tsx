import type { Finding, FindingStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FindingCard } from "./FindingCard";

export interface SelfTestState {
  finding: Finding | null;
  pending: boolean;
  error: string | null;
  onRun: () => void;
}

interface FindingsListProps {
  caseId: string;
  findings: readonly Finding[];
  statusFilter: FindingStatus | "all";
  activeFindingId: string | null;
  onToggleFinding: (id: string) => void;
  selfTest: SelfTestState;
}

export function FindingsList({
  caseId,
  findings,
  statusFilter,
  activeFindingId,
  onToggleFinding,
  selfTest,
}: FindingsListProps) {
  const selfTestId = selfTest.finding?.id;
  const list = findings.filter(
    (finding) => finding.id !== selfTestId && (statusFilter === "all" || finding.status === statusFilter),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-secondary" aria-live="polite">
          Showing {list.length} of {findings.length} findings
        </p>
        <Button variant="secondary" size="sm" onClick={selfTest.onRun} disabled={selfTest.pending}>
          {selfTest.pending ? "Running self-test..." : "Run verifier self-test"}
        </Button>
      </div>

      {selfTest.error && (
        <p role="alert" className="text-xs text-red">
          Self-test failed: {selfTest.error}
        </p>
      )}

      {selfTest.finding && (
        <div className="space-y-3">
          <p className="rounded-md border border-cyan/30 bg-cyan/5 p-3 text-xs text-text-secondary">
            SAKSI injected a fabricated claim (fake technique and evidence) to prove the verifier rejects it.
          </p>
          <FindingCard
            caseId={caseId}
            finding={selfTest.finding}
            focused={activeFindingId === selfTest.finding.id}
            onToggleFocus={onToggleFinding}
          />
        </div>
      )}

      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((finding) => (
            <FindingCard
              key={finding.id}
              caseId={caseId}
              finding={finding}
              focused={activeFindingId === finding.id}
              onToggleFocus={onToggleFinding}
            />
          ))}
        </div>
      ) : (
        !selfTest.finding && (
          <EmptyState
            title={findings.length === 0 ? "No findings yet" : "No findings match this filter"}
            description={findings.length === 0 ? "Findings appear when the investigation completes." : undefined}
          />
        )
      )}
    </div>
  );
}
