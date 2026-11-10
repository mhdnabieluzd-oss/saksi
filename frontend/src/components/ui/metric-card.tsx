import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const VALUE_TONE = {
  neutral: "text-text",
  green: "text-green",
  cyan: "text-cyan",
  amber: "text-amber",
  red: "text-red",
} as const;

interface MetricCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof VALUE_TONE;
  className?: string;
}

export function MetricCard({ label, value, hint, icon: Icon, tone = "neutral", className }: MetricCardProps) {
  return (
    <div className={cn("min-w-0 rounded-md border border-border bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">{label}</p>
        {Icon && <Icon aria-hidden className="size-4 shrink-0 text-text-muted" />}
      </div>
      <p className={cn("mt-2 font-sans text-2xl font-semibold tabular-nums", VALUE_TONE[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
