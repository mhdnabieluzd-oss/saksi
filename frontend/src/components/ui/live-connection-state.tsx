import { CircleDashed, Radio, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Link phase of a case stream: connecting | live | reconnecting, plus derived stale / offline. */
export type LinkPhase = "connecting" | "live" | "reconnecting" | "stale" | "offline";

const META: Record<LinkPhase, { label: string; Icon: LucideIcon; text: string }> = {
  connecting: { label: "Connecting", Icon: CircleDashed, text: "text-text-secondary" },
  live: { label: "Live", Icon: Radio, text: "text-success" },
  reconnecting: { label: "Reconnecting", Icon: RefreshCw, text: "text-warning" },
  stale: { label: "Stale", Icon: CircleDashed, text: "text-warning" },
  offline: { label: "Disconnected", Icon: WifiOff, text: "text-danger" },
};

/**
 * Event-stream state with text, never a bare dot. When not live, previous data stays visible and
 * this chip says so, with the last update time ("Last updated 4 minutes ago").
 */
export function LiveConnectionState({
  phase,
  lastMessageAt,
  className,
}: {
  phase: LinkPhase;
  /** Epoch ms of the last stream message. */
  lastMessageAt?: number | null;
  className?: string;
}) {
  const { label, Icon, text } = META[phase];
  const showAge = phase !== "live" && phase !== "connecting" && lastMessageAt;
  return (
    <span
      role="status"
      data-state={phase}
      className={cn("inline-flex items-center gap-1.5 text-body-sm", text, className)}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span>{label}</span>
      {showAge ? (
        <span data-volatile className="text-text-muted">
          · Last updated {formatRelative(new Date(lastMessageAt).toISOString())}
        </span>
      ) : null}
    </span>
  );
}
