import type { ReactNode } from "react";
import { CircleCheck, Info, ShieldQuestion, TriangleAlert } from "lucide-react";
import { AgentAvatar } from "@/components/agents/identity";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";
import { splitEvidence } from "./evidenceText";

/** Answer text with every evidence ID rendered as a clickable chip. */
export function RichText({ caseId, text }: { caseId: string; text: string }) {
  return (
    <>
      {splitEvidence(text).map((part, index) =>
        part.kind === "evidence" ? (
          <EvidenceChip key={index} caseId={caseId} eventId={part.id} />
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </>
  );
}

function ListSection({ caseId, title, items, children }: { caseId: string; title: string; items: string[]; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-text-secondary uppercase">
        {children}
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5 text-sm text-text">
        {items.map((item, index) => (
          <li key={index} className="pl-1 leading-relaxed">
            <RichText caseId={caseId} text={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface MessageBubbleProps {
  caseId: string;
  message: ChatMessage;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function MessageBubble({ caseId, message, selected, onSelect }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div id={`msg-${message.id}`} className="ml-auto max-w-[85%] rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm whitespace-pre-wrap text-text">
        {message.content}
      </div>
    );
  }

  const languageName = message.lang === "ms" ? "Bahasa Melayu" : "English";
  const hasCitations = message.citations.length > 0;

  return (
    <article
      id={`msg-${message.id}`}
      aria-label={`SAKSI answer in ${languageName}`}
      className={selected ? "rounded-md border border-cyan/40 bg-surface p-4" : "rounded-md border border-border bg-surface p-4"}
    >
      <header className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <AgentAvatar role="tanya" state={hasCitations ? "completed" : "warning"} size={24} />
        <Badge tone="cyan" mono>
          {message.lang === "ms" ? "BM" : "EN"}
        </Badge>
        <span className="font-medium text-text">Tanya SAKSI</span>
        <Badge tone={hasCitations ? "green" : "amber"} mono>
          {message.citations.length} receipt{message.citations.length === 1 ? "" : "s"}
        </Badge>
        {message.ledger_seq !== null && <span className="font-mono">Recorded in ledger #{message.ledger_seq}</span>}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8 px-2 text-xs"
          aria-pressed={selected}
          onClick={() => onSelect(message.id)}
        >
          {selected ? "Sources shown" : "Inspect sources"}
        </Button>
      </header>

      {!hasCitations && (
        <div
          role="note"
          className="mt-3 flex items-center gap-2 rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          <span>Insufficient evidence in this case to ground this answer with log receipts.</span>
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-text">
        <RichText caseId={caseId} text={message.content} />
      </p>

      {message.verified_points.length > 0 && (
        <ListSection caseId={caseId} title="Verified findings" items={message.verified_points}>
          <CircleCheck aria-hidden className="size-3.5 text-green" />
        </ListSection>
      )}

      {message.hypotheses.length > 0 && (
        <ListSection caseId={caseId} title="Hypotheses / Inferences" items={message.hypotheses}>
          <ShieldQuestion aria-hidden className="size-3.5 text-amber" />
          <Badge tone="amber" className="normal-case tracking-normal">
            Not verified
          </Badge>
        </ListSection>
      )}

      {message.uncertainty && (
        <p className="mt-4 flex gap-2 text-sm text-text-secondary">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium text-text">Uncertainty: </span>
            {message.uncertainty}
          </span>
        </p>
      )}

      {message.unknown_citations.length > 0 && (
        <p role="alert" className="mt-4 flex gap-2 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Removed {message.unknown_citations.length} citation(s) not present in case evidence: {message.unknown_citations.join(", ")}
          </span>
        </p>
      )}
    </article>
  );
}
