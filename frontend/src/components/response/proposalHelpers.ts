import type { ResponseProposal } from "@/lib/types";

export function proposalStatusBadge(proposal: ResponseProposal): {
  label: string;
  tone: "amber" | "cyan" | "green" | "red" | "neutral" | "muted";
} {
  switch (proposal.status) {
    case "draft":
      return { label: "Draft", tone: "muted" };
    case "pending_approval":
      return { label: "Pending analyst review", tone: "amber" };
    case "approved":
      return {
        label: proposal.approved_by
          ? `Approved by ${proposal.approved_by} — not executed`
          : "Approved — not executed",
        tone: "cyan",
      };
    case "rejected":
      return { label: "Rejected", tone: "red" };
    case "expired":
      return { label: "Expired", tone: "muted" };
    case "invalidated":
      return { label: "Invalidated", tone: "red" };
    case "executing":
      return { label: "Executing", tone: "cyan" };
    case "simulated":
      return { label: "SIMULATED — NO SYSTEM ACTION TAKEN", tone: "amber" };
    case "succeeded":
      if (proposal.execution_mode === "simulation") {
        return { label: "SIMULATED — NO SYSTEM ACTION TAKEN", tone: "amber" };
      }
      return {
        label: `Lab record written (${proposal.environment ?? "LAB-LOCAL"})`,
        tone: "neutral",
      };
    case "failed":
      return { label: "Execution failed", tone: "red" };
    case "rolled_back":
      return { label: "Rolled back", tone: "neutral" };
    default:
      return { label: "Pending analyst review", tone: "amber" };
  }
}

export function isProposalExpired(proposal: ResponseProposal): boolean {
  if (proposal.status === "expired") return true;
  if (!proposal.expires_at) return false;
  const ts = Date.parse(proposal.expires_at);
  return Number.isFinite(ts) && Date.now() > ts;
}

