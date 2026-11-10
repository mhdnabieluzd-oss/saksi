import { cn } from "@/lib/utils";

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 w-full overflow-hidden rounded-sm bg-border", className)}
    >
      <div className="h-full bg-cyan transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}
