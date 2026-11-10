import { CircleCheck } from "lucide-react";
import type { AgentEvent } from "@/lib/types";
import { EmptyState } from "@/components/ui/empty-state";
import { EventRow } from "./EventRow";

/** Warning and error events, including Shield quarantine warnings. */
export function WarningsList({ caseId, issues }: { caseId: string; issues: AgentEvent[] }) {
  if (issues.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="No warnings or errors"
        description="Shield quarantines, agent warnings and agent errors are listed here as they happen."
      />
    );
  }
  return (
    <ol aria-label="Warnings and errors" className="divide-y divide-border overflow-hidden rounded-md border border-border">
      {issues.map((event) => (
        <EventRow key={event.seq} caseId={caseId} event={event} />
      ))}
    </ol>
  );
}
