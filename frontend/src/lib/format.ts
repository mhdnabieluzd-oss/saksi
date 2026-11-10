import {
  CircleCheck,
  CircleDashed,
  CircleAlert,
  CircleX,
  Clock,
  Info,
  LoaderCircle,
  Minus,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  TriangleAlert,
  Circle,
  Pause,
  Square,
  type LucideIcon,
} from "lucide-react";
import type { AgentState, FindingStatus, Risk, RunStatus, Severity } from "./types";

export interface StatusMeta {
  label: string;
  /** Text, background and border classes. Always paired with a label and icon, never colour alone. */
  className: string;
  Icon: LucideIcon;
}

const MALAYSIA_TZ = "Asia/Kuala_Lumpur";

function formatInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second}`;
}

/** "03 Nov 2026, 09:14:05" in Malaysia time. */
/** "03 Nov 2026, 09:14:05 MYT": Malaysia time, labelled so it is never mistaken for UTC. */
export function formatTs(iso: string): string {
  const text = formatInZone(iso, MALAYSIA_TZ);
  return text === "-" ? text : `${text} MYT`;
}

/** "03 Nov 2026, 01:14:05 UTC". */
export function formatTsUtc(iso: string): string {
  return `${formatInZone(iso, "UTC")} UTC`;
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const diffSeconds = (now - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(diffSeconds)) return "-";
  const abs = Math.abs(diffSeconds);
  const future = diffSeconds < 0;
  if (abs < 60) return future ? "in a moment" : "just now";
  const units: Array<[number, string]> = [
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [seconds, name] of units) {
    if (abs >= seconds) {
      const n = Math.floor(abs / seconds);
      const label = `${n} ${name}${n === 1 ? "" : "s"}`;
      return future ? `in ${label}` : `${label} ago`;
    }
  }
  return "just now";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function shortHash(hash: string, n = 12): string {
  return hash.length > n ? `${hash.slice(0, n)}…` : hash;
}

const SEVERITY_META: Record<Severity, StatusMeta> = {
  critical: {
    label: "Critical",
    className: "text-red bg-red/10 border-red/40",
    Icon: ShieldAlert,
  },
  high: {
    label: "High",
    className: "text-red bg-red/10 border-red/30",
    Icon: TriangleAlert,
  },
  medium: {
    label: "Medium",
    className: "text-amber bg-amber/10 border-amber/30",
    Icon: CircleAlert,
  },
  low: {
    label: "Low",
    className: "text-cyan bg-cyan/10 border-cyan/30",
    Icon: Info,
  },
  info: {
    label: "Info",
    className: "text-text-secondary bg-surface-elevated border-border",
    Icon: CircleDashed,
  },
};

export function severityMeta(severity: Severity): StatusMeta {
  return SEVERITY_META[severity];
}

const NO_RISK_META: StatusMeta = {
  label: "No risk",
  className: "text-text-muted bg-surface-elevated border-border",
  Icon: Minus,
};

export function riskMeta(risk: Risk): StatusMeta {
  return risk === "none" ? NO_RISK_META : SEVERITY_META[risk];
}

const AGENT_STATE_META: Record<AgentState | RunStatus["state"], StatusMeta> = {
  idle: {
    label: "Idle",
    className: "text-text-muted bg-surface-elevated border-border",
    Icon: Circle,
  },
  queued: {
    label: "Queued",
    className: "text-cyan bg-cyan/10 border-cyan/30",
    Icon: Clock,
  },
  running: {
    label: "Running",
    className: "text-cyan bg-cyan/10 border-cyan/30",
    Icon: LoaderCircle,
  },
  paused: {
    label: "Paused",
    className: "text-amber bg-amber/10 border-amber/30",
    Icon: Pause,
  },
  stopped: {
    label: "Stopped",
    className: "text-amber bg-amber/10 border-amber/30",
    Icon: Square,
  },
  completed: {
    label: "Completed",
    className: "text-green bg-green/10 border-green/30",
    Icon: CircleCheck,
  },
  failed: {
    label: "Failed",
    className: "text-red bg-red/10 border-red/30",
    Icon: CircleX,
  },
  requires_review: {
    label: "Requires review",
    className: "text-amber bg-amber/10 border-amber/30",
    Icon: TriangleAlert,
  },
};

export function agentStateMeta(state: AgentState | RunStatus["state"]): StatusMeta {
  return AGENT_STATE_META[state];
}

const FINDING_STATUS_META: Record<FindingStatus, StatusMeta> = {
  verified: {
    label: "Verified",
    className: "text-green bg-green/10 border-green/30",
    Icon: ShieldCheck,
  },
  rejected: {
    label: "Rejected",
    className: "text-red bg-red/10 border-red/30",
    Icon: ShieldX,
  },
  unverified: {
    label: "Unverified",
    className: "text-amber bg-amber/10 border-amber/30",
    Icon: ShieldQuestion,
  },
};

export function findingStatusMeta(status: FindingStatus): StatusMeta {
  return FINDING_STATUS_META[status];
}
