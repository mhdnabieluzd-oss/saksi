import { Link } from "react-router-dom";
import { formatRelative } from "@/lib/format";
import type { AgentEvent } from "@/lib/types";
import { AGENT_LABEL, isAttention, newestFirst } from "./labels";

export function AgentActivity({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-text-secondary">No agent activity yet. Start an investigation to see the agents work.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {newestFirst(events)
        .slice(0, 6)
        .map((event) => (
          <li key={`${event.case_id}-${event.seq}`} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
              <span className="flex items-center gap-2 font-medium text-text">
                {AGENT_LABEL[event.agent]}
                {isAttention(event) && (
                  <span className={event.kind === "error" ? "text-red" : "text-amber"}>
                    {event.kind === "error" ? "Error" : "Warning"}
                  </span>
                )}
              </span>
              <time dateTime={event.ts}>{formatRelative(event.ts)}</time>
            </div>
            <p className="mt-0.5 text-sm text-text">{event.message}</p>
            <Link
              to={`/app/cases/${event.case_id}`}
              className="rounded-sm font-mono text-xs whitespace-nowrap text-cyan hover:underline"
            >
              {event.case_id}
            </Link>
          </li>
        ))}
    </ul>
  );
}
