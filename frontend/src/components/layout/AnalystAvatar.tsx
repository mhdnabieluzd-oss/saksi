import { useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Analyst name from settings, with a fallback while settings load or the backend is offline. */
export function AnalystAvatar({ className }: { className?: string }) {
  const settings = useSettings();
  const name = settings.data?.analyst_name?.trim() || "Analyst";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "A";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-xs font-medium text-text",
        className,
      )}
    >
      {initials}
    </span>
  );
}
