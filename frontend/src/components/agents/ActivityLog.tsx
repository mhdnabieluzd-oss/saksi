import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { Activity, ArrowDown } from "lucide-react";
import type { AgentEvent, AgentEventKind, AgentName } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AGENT_INFO, AGENT_ORDER, EVENT_KINDS, KIND_INFO } from "./meta";
import { pickOption } from "./helpers";
import { EventRow } from "./EventRow";

type AgentFilter = AgentName | "all";
type KindFilter = AgentEventKind | "all";
const AGENT_FILTERS: AgentFilter[] = ["all", ...AGENT_ORDER];
const KIND_FILTERS: KindFilter[] = ["all", ...EVENT_KINDS];

/** Newest entries sit at the bottom. Never forces scroll while the reader has scrolled up; shows a sticky count instead. */
export function ActivityLog({ caseId, events }: { caseId: string; events: AgentEvent[] }) {
  const [agent, setAgent] = useState<AgentFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [atBottom, setAtBottom] = useState(true);
  const [seenCount, setSeenCount] = useState(events.length);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () =>
      events.filter(
        (event) => (agent === "all" || event.agent === agent) && (kind === "all" || event.kind === kind),
      ),
    [events, agent, kind],
  );

  useEffect(() => {
    const list = listRef.current;
    if (atBottom && list) {
      list.scrollTop = list.scrollHeight;
      setSeenCount(visible.length);
    }
  }, [visible, atBottom]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    const isBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    setAtBottom(isBottom);
    if (isBottom) setSeenCount(visible.length);
  }

  function jumpToLatest() {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    setAtBottom(true);
    setSeenCount(visible.length);
  }

  const unreadCount = Math.max(0, visible.length - seenCount);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={agent} onValueChange={(value) => setAgent(pickOption(AGENT_FILTERS, value, "all"))}>
            <SelectTrigger aria-label="Filter by agent" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {AGENT_ORDER.map((name) => (
                <SelectItem key={name} value={name}>
                  {AGENT_INFO[name].short}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={(value) => setKind(pickOption(KIND_FILTERS, value, "all"))}>
            <SelectTrigger aria-label="Filter by kind" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {EVENT_KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  {KIND_INFO[option].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-text-secondary tabular-nums">
          Showing {visible.length} of {events.length} entries
        </p>
      </div>

      <div className="relative">
        <div
          ref={listRef}
          onScroll={handleScroll}
          role="region"
          aria-label="Agent activity entries"
          tabIndex={0}
          className="max-h-[32rem] overflow-y-auto rounded-md border border-border"
        >
          {visible.length === 0 ? (
            <EmptyState
              icon={Activity}
              title={events.length === 0 ? "No activity yet" : "No entries match these filters"}
              description={
                events.length === 0
                  ? "Agent actions, tool calls and findings appear here as the investigation runs."
                  : "Change the agent or kind filter to see more entries."
              }
            />
          ) : (
            <ol aria-label="Agent activity log" className="divide-y divide-border">
              {visible.map((event) => (
                <EventRow key={event.seq} caseId={caseId} event={event} />
              ))}
            </ol>
          )}
        </div>
        {!atBottom && (
          <Button
            variant="secondary"
            size="sm"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
          >
            <ArrowDown aria-hidden />
            {unreadCount > 0 ? `New activity (${unreadCount})` : "Jump to latest"}
          </Button>
        )}
      </div>
    </div>
  );
}
