import { CircleX, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { cn } from "@/lib/utils";
import type { AgentEvent } from "@/lib/types";
import { AGENT_LABEL, EVENT_KIND_LABEL, isAttention, newestFirst } from "./labels";

export function EventTimeline({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-text-secondary">No investigation events yet. Events appear here as agents run.</p>;
  }
  return (
    <ol className="ml-2 border-l border-border">
      {newestFirst(events)
        .slice(0, 25)
        .map((event) => {
          const attention = isAttention(event);
          const isError = event.kind === "error";
          const Icon = isError ? CircleX : TriangleAlert;
          return (
            <li key={`${event.case_id}-${event.seq}`} className="relative pb-5 pl-6 last:pb-0">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1.5 -left-[5px] size-2.5 rounded-full",
                  attention ? (isError ? "bg-red" : "bg-amber") : "bg-cyan",
                )}
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <Timestamp iso={event.ts} />
                <span>{AGENT_LABEL[event.agent]}</span>
                <Badge tone={attention ? (isError ? "red" : "amber") : "neutral"}>
                  {attention && <Icon aria-hidden className="size-3.5" />}
                  {EVENT_KIND_LABEL[event.kind]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-text">{event.message}</p>
              <Link to={`/app/cases/${event.case_id}`} className="rounded-sm font-mono text-xs whitespace-nowrap text-cyan hover:underline">
                {event.case_id}
              </Link>
            </li>
          );
        })}
    </ol>
  );
}
