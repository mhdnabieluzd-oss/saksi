import { CircleCheck, ShieldQuestion } from "lucide-react";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ChatMessage, Citation } from "@/lib/types";
import { extractIps } from "./evidenceText";

/** Citations of the selected answer, de-duplicated by event ID, first occurrence kept. */
function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Map<string, Citation>();
  for (const citation of citations) {
    if (!seen.has(citation.event_id)) seen.set(citation.event_id, citation);
  }
  return [...seen.values()];
}

export function EvidencePanel({ caseId, message }: { caseId: string; message: ChatMessage | null }) {
  const citations = message ? uniqueCitations(message.citations) : [];
  const verifiedPoints = message?.verified_points ?? [];
  const hypotheses = message?.hypotheses ?? [];
  const ips = extractIps(citations.map((citation) => citation.excerpt));

  return (
    <div className="flex flex-col gap-4">
      <Card title={`Evidence receipts (${citations.length})`}>
        {!message ? (
          <p className="text-sm text-text-secondary">Ask a question to inspect the evidence behind the answer.</p>
        ) : citations.length === 0 ? (
          <p className="text-sm text-amber">
            No log event receipts cited. Treat this response as unverified context only.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {citations.map((citation) => (
              <li key={citation.event_id} className="flex flex-col items-start gap-1.5">
                <EvidenceChip caseId={caseId} eventId={citation.event_id} />
                <p className="font-mono text-xs leading-relaxed break-words text-text-secondary">{citation.excerpt}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {message && (
        <Card title={`Verified findings (${verifiedPoints.length})`}>
          {verifiedPoints.length === 0 ? (
            <p className="text-xs text-text-muted">No verified findings cited in this answer.</p>
          ) : (
            <ul className="space-y-2 text-xs text-text">
              {verifiedPoints.map((pt, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-green" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {message && (
        <Card title={`Hypotheses / Inferences (${hypotheses.length})`}>
          {hypotheses.length === 0 ? (
            <p className="text-xs text-text-muted">No unverified hypotheses in this answer.</p>
          ) : (
            <ul className="space-y-2 text-xs text-text-secondary">
              {hypotheses.map((hyp, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-amber" />
                  <span>{hyp}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {ips.length > 0 && (
        <Card title="Related entities">
          <ul className="flex flex-wrap gap-2">
            {ips.map((ip) => (
              <li key={ip}>
                <Badge tone="cyan" mono>
                  {ip}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
