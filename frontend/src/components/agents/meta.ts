import {
  CornerDownRight,
  Info,
  OctagonX,
  Search,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { AgentEventKind, AgentName } from "@/lib/types";

export const AGENT_ORDER: AgentName[] = ["triage", "investigator", "verifier", "reporter"];

/** Roles from design.md 8.3. Concise descriptions only, never chain-of-thought. */
export const AGENT_INFO: Record<AgentName, { short: string; title: string; role: string }> = {
  triage: {
    short: "Triage",
    title: "Triage Agent",
    role: "Detects and prioritises incidents, identifies relevant logs and sets the investigation scope.",
  },
  investigator: {
    short: "Investigator",
    title: "Investigator Agent",
    role: "Analyses security events, connects related entities and reconstructs the attack progression.",
  },
  verifier: {
    short: "Verifier",
    title: "Verifier Agent",
    role: "Checks findings against source evidence, identifies unsupported claims and validates integrity.",
  },
  reporter: {
    short: "Reporter",
    title: "Reporter Agent",
    role: "Organises verified findings and prepares decision-ready investigation reports.",
  },
};

export const EVENT_KINDS: AgentEventKind[] = [
  "status",
  "action",
  "info",
  "tool_call",
  "tool_result",
  "finding",
  "warning",
  "error",
];

export const KIND_INFO: Record<AgentEventKind, { label: string; Icon: LucideIcon; className: string }> = {
  status: { label: "Status", Icon: Info, className: "text-text-secondary" },
  action: { label: "Action", Icon: Info, className: "text-text-secondary" },
  info: { label: "Info", Icon: Info, className: "text-text-secondary" },
  tool_call: { label: "Tool call", Icon: Wrench, className: "text-cyan" },
  tool_result: { label: "Tool result", Icon: CornerDownRight, className: "text-text-secondary" },
  finding: { label: "Finding", Icon: Search, className: "text-green" },
  warning: { label: "Warning", Icon: TriangleAlert, className: "text-amber" },
  error: { label: "Error", Icon: OctagonX, className: "text-red" },
};
