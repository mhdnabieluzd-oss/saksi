import { Cpu, FileText, Globe, Link2, Server, User, type LucideIcon } from "lucide-react";
import type { NodeKind, Risk } from "@/lib/types";

export const KIND_ORDER: readonly NodeKind[] = ["ip", "host", "user", "process", "file", "domain"];

export const KIND_META: Record<NodeKind, { label: string; Icon: LucideIcon; mono: boolean }> = {
  ip: { label: "IP address", Icon: Globe, mono: true },
  host: { label: "Host", Icon: Server, mono: false },
  user: { label: "User", Icon: User, mono: false },
  process: { label: "Process", Icon: Cpu, mono: true },
  file: { label: "File", Icon: FileText, mono: false },
  domain: { label: "Domain", Icon: Link2, mono: false },
};

/** 3px left bar on each node, coloured by risk. The risk text is printed on the node too. */
export const RISK_BAR: Record<Risk, string> = {
  critical: "bg-red",
  high: "bg-red/70",
  medium: "bg-amber",
  low: "bg-cyan/60",
  none: "bg-text-muted/40",
};

export const RISK_TEXT: Record<Risk, string> = {
  critical: "text-red",
  high: "text-red",
  medium: "text-amber",
  low: "text-cyan",
  none: "text-text-muted",
};

export function isInternalIp(ip: string): boolean {
  const match = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
