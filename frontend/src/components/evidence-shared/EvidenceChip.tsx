import { EvidenceDrawer } from "./EvidenceDrawer";

/** Monospace evidence ID (e.g. EV-00042) that opens its evidence drawer. */
export function EvidenceChip({ caseId, eventId }: { caseId: string; eventId: string }) {
  return (
    <EvidenceDrawer caseId={caseId} eventId={eventId}>
      <button
        type="button"
        className="inline-flex min-h-7 items-center rounded-sm border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 font-mono text-xs text-cyan transition-colors hover:bg-cyan/20 max-md:min-h-11"
      >
        {eventId}
      </button>
    </EvidenceDrawer>
  );
}
