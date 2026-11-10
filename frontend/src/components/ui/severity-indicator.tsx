/* eslint-disable react-refresh/only-export-components */
import { CircleAlert, ChevronsUp, ChevronUp, ArrowDown, Info, type LucideIcon } from "lucide-react";
import type { Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITY: Record<Severity, { label: string; Icon: LucideIcon; text: string; bar: string }> = {
  critical: { label: "Critical", Icon: CircleAlert, text: "text-danger", bar: "bg-danger" },
  high: { label: "High", Icon: ChevronsUp, text: "text-warning", bar: "bg-warning" },
  medium: { label: "Medium", Icon: ChevronUp, text: "text-inferred", bar: "bg-inferred" },
  low: { label: "Low", Icon: ArrowDown, text: "text-info", bar: "bg-info" },
  info: { label: "Informational", Icon: Info, text: "text-text-secondary", bar: "bg-contextual" },
};

const ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];

/** Numeric rank for sorting (critical highest). */
export function severityRank(severity: Severity): number {
  return ORDER.indexOf(severity);
}

/**
 * Severity is independent of workflow state: a Critical incident can still be Completed.
 * Renders icon + text; `compact` hides the text visually but keeps it for screen readers.
 */
export function SeverityIndicator({
  severity,
  compact = false,
  className,
}: {
  severity: Severity;
  compact?: boolean;
  className?: string;
}) {
  const meta = SEVERITY[severity];
  const { Icon } = meta;
  return (
    <span
      data-severity={severity}
      className={cn("inline-flex items-center gap-1.5 text-body-sm font-medium", meta.text, className)}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {/* Four-step bar: shape redundancy with the icon and label. */}
      <span aria-hidden className="inline-flex items-end gap-px">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("w-[3px] rounded-[1px]", i < severityRank(severity) ? meta.bar : "bg-border-strong")}
            style={{ height: 4 + i * 2 }}
          />
        ))}
      </span>
      <span className={compact ? "sr-only" : undefined}>{meta.label}</span>
    </span>
  );
}
