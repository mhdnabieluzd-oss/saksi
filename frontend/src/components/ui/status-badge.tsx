/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Hourglass,
  LoaderCircle,
  OctagonX,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "accent" | "neutral" | "muted";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  info: "border-info/30 bg-info-soft text-info",
  accent: "border-accent/30 bg-accent-soft text-accent",
  neutral: "border-border bg-panel-raised text-text-secondary",
  muted: "border-border bg-transparent text-text-muted",
};

interface StatusDef {
  tone: StatusTone;
  label: string;
  Icon: LucideIcon;
}

/**
 * Named statuses across severity-independent dimensions: verification, run, approval, service health.
 * Each carries an icon and a text label, so state is never colour-only.
 */
export const STATUS_DEFS = {
  // verification
  verified: { tone: "success", label: "Verified", Icon: ShieldCheck },
  needs_review: { tone: "warning", label: "Needs review", Icon: TriangleAlert },
  rejected: { tone: "danger", label: "Rejected", Icon: CircleX },
  // run
  idle: { tone: "muted", label: "Idle", Icon: CircleDashed },
  running: { tone: "accent", label: "Running", Icon: LoaderCircle },
  paused: { tone: "warning", label: "Paused", Icon: Clock },
  stopped: { tone: "neutral", label: "Stopped", Icon: OctagonX },
  completed: { tone: "success", label: "Completed", Icon: CircleCheck },
  failed: { tone: "danger", label: "Failed", Icon: CircleX },
  // approval / response
  pending_approval: { tone: "warning", label: "Pending approval", Icon: Hourglass },
  approved: { tone: "info", label: "Approved", Icon: CircleCheck },
  simulated: { tone: "neutral", label: "Simulated", Icon: CircleDashed },
  lab_recorded: { tone: "info", label: "Lab record written", Icon: CircleCheck },
  expired: { tone: "muted", label: "Expired", Icon: Clock },
  invalidated: { tone: "danger", label: "Invalidated", Icon: TriangleAlert },
  // service health
  online: { tone: "success", label: "Online", Icon: CircleCheck },
  degraded: { tone: "warning", label: "Degraded", Icon: TriangleAlert },
  offline: { tone: "danger", label: "Offline", Icon: CircleX },
  not_configured: { tone: "muted", label: "Not configured", Icon: CircleDashed },
  unknown: { tone: "muted", label: "Unknown", Icon: CircleDashed },
} as const satisfies Record<string, StatusDef>;

export type StatusKey = keyof typeof STATUS_DEFS;

type StatusBadgeProps = { className?: string } & (
  | { status: StatusKey; label?: string; tone?: never; icon?: never }
  | { status?: never; label: string; tone: StatusTone; icon?: LucideIcon }
);

/** Compact status chip: icon + text, 4 px radius (not a pill). */
export function StatusBadge({ status, label, tone, icon, className }: StatusBadgeProps) {
  const def: StatusDef | null = status ? STATUS_DEFS[status] : null;
  const Icon = def?.Icon ?? icon;
  const finalTone = def?.tone ?? tone ?? "neutral";
  const text: ReactNode = label ?? def?.label;
  return (
    <span
      data-status={status ?? undefined}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-body-sm font-medium",
        TONE_CLASS[finalTone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
      {text}
    </span>
  );
}
