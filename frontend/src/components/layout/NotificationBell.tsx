import { useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { AgentEvent } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { cn } from "@/lib/utils";

const ALERT_KINDS: AgentEvent["kind"][] = ["warning", "error"];

/** Notification centre: lists recent agent warnings and errors from /api/overview. */
export function NotificationBell({ events }: { events: AgentEvent[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const alerts = events.filter((event) => ALERT_KINDS.includes(event.kind)).slice(-10).reverse();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Notifications, ${alerts.length} warnings or errors`}
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex size-10 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text max-md:size-11"
      >
        <Bell aria-hidden className="size-4" />
        {alerts.length > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] leading-4 font-semibold text-bg"
          >
            {alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className={cn(
            "absolute top-full right-0 z-50 mt-2 flex max-h-96 w-80 flex-col overflow-hidden rounded-md border border-border bg-surface-elevated shadow-[0_8px_24px_rgb(0_0_0/0.35)]",
          )}
        >
          <p className="border-b border-border px-3 py-2 text-xs font-medium text-text-secondary uppercase">
            Agent warnings and errors
          </p>
          {alerts.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-secondary">No agent warnings or errors.</p>
          ) : (
            <ul className="overflow-y-auto divide-y divide-border">
              {alerts.map((event) => (
                <li key={`${event.case_id}-${event.seq}`} className="space-y-1 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={event.kind === "error" ? "red" : "amber"}>
                      {event.kind === "error" ? "Error" : "Warning"}
                    </Badge>
                    <Timestamp iso={event.ts} />
                  </div>
                  <p className="text-sm text-text">{event.message}</p>
                  <p className="font-mono text-xs text-text-muted">
                    {event.agent} · {event.case_id}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
