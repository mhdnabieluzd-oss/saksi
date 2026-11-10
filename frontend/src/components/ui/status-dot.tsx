import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "error" | "idle";

const DOT_CLASS: Record<StatusTone, string> = {
  ok: "bg-green",
  warn: "bg-amber",
  error: "bg-red",
  idle: "bg-text-muted",
};

/**
 * Coloured dot with its text label. The label is always in the DOM; `compact` hides it
 * visually (screen readers still get it) for icon-only layouts. State is never colour-only.
 */
export function StatusDot({
  tone,
  label,
  compact = false,
  className,
}: {
  tone: StatusTone;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-text-secondary", className)}>
      <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT_CLASS[tone])} />
      <span className={compact ? "sr-only" : undefined}>{label}</span>
    </span>
  );
}
