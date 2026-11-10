// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { deriveAgentState } from "@/components/agents/identity/deriveAgentState";
import { proposalStatusBadge, isProposalExpired } from "@/components/response/proposalHelpers";
import { AgentOperatorDesk } from "@/agents/AgentOperatorDesk";
import { PlanDagNode, type PlanStepNode } from "@/features/workspace/plan-dag/PlanDagNode";
import type { AgentEvent, AgentStatus, ResponseProposal, RunStatus } from "@/lib/types";

const baseRun: RunStatus = {
  case_id: "CASE-2026-0001",
  state: "running",
  model: "deepseek/deepseek-v4.1-flash-1017",
  started_at: "2026-11-10T01:00:00Z",
  finished_at: null,
  agents: [],
  error: null,
};

const makeStatus = (state: AgentStatus["state"], overrides?: Partial<AgentStatus>): AgentStatus => ({
  name: "investigator",
  state,
  current_task: "Querying host timeline",
  progress: 50,
  started_at: "2026-11-10T01:00:01Z",
  finished_at: null,
  output_summary: "",
  ...overrides,
});

const makeEvent = (overrides: Partial<AgentEvent>): AgentEvent => ({
  seq: 1,
  ts: "2026-11-10T01:00:05Z",
  case_id: "CASE-2026-0001",
  agent: "investigator",
  kind: "info",
  message: "Step started",
  tool: null,
  args: null,
  evidence_ids: [],
  ledger_seq: null,
  ...overrides,
});

describe("deriveAgentState 10-state priority rules", () => {
  it("Rule 1: offline overrides any active state and preserves lastKnown", () => {
    const res = deriveAgentState({
      agent: "investigator",
      status: makeStatus("running"),
      run: baseRun,
      events: [],
      backend: "offline",
    });
    expect(res.state).toBe("offline");
    expect(res.lastKnown).toBe("working");
    expect(res.label).toContain("Offline");
  });

  it("Rule 2: failed state reports error detail", () => {
    const res = deriveAgentState({
      agent: "investigator",
      status: makeStatus("failed"),
      run: baseRun,
      events: [makeEvent({ kind: "error", message: "Timeout reading store" })],
    });
    expect(res.state).toBe("failed");
    expect(res.detail).toBe("Timeout reading store");
  });

  it("Rule 3: warning state triggers on requires_review or completed with fallback/policy blocks", () => {
    const rev = deriveAgentState({
      agent: "verifier",
      status: makeStatus("requires_review", { name: "verifier" }),
      run: baseRun,
      events: [],
    });
    expect(rev.state).toBe("warning");

    const blockedComp = deriveAgentState({
      agent: "investigator",
      status: makeStatus("completed"),
      run: baseRun,
      events: [
        makeEvent({
          kind: "warning",
          code: "policy.blocked",
          tool: "exec_shell",
          message: "Tool Broker: denied exec_shell",
        }),
      ],
    });
    expect(blockedComp.state).toBe("warning");
    expect(blockedComp.blockedCount).toBe(1);
  });

  it("Rule 4: completed state without warnings", () => {
    const res = deriveAgentState({
      agent: "triage",
      status: makeStatus("completed", { name: "triage", output_summary: "11 signals" }),
      run: baseRun,
      events: [],
    });
    expect(res.state).toBe("completed");
    expect(res.detail).toBe("11 signals");
  });

  it("Rule 5: blocked while running when newest tool event is policy.blocked", () => {
    const res = deriveAgentState({
      agent: "investigator",
      status: makeStatus("running"),
      run: baseRun,
      events: [
        makeEvent({
          kind: "warning",
          code: "policy.blocked",
          tool: "exec_shell",
          message: "Policy Gate blocked exec_shell",
        }),
      ],
    });
    expect(res.state).toBe("blocked");
    expect(res.tool).toBe("exec_shell");
  });

  it("Rule 6: waiting_for_tool when newest tool event is tool_call", () => {
    const res = deriveAgentState({
      agent: "investigator",
      status: makeStatus("running"),
      run: baseRun,
      events: [
        makeEvent({
          kind: "tool_call",
          tool: "host_timeline",
          message: "Running host_timeline",
        }),
      ],
    });
    expect(res.state).toBe("waiting_for_tool");
    expect(res.tool).toBe("host_timeline");
  });

  it("Rule 7 & 8: verifying for verifier, working for other running agents", () => {
    const ver = deriveAgentState({
      agent: "verifier",
      status: makeStatus("running", { name: "verifier" }),
      run: baseRun,
      events: [],
    });
    expect(ver.state).toBe("verifying");

    const work = deriveAgentState({
      agent: "reporter",
      status: makeStatus("running", { name: "reporter" }),
      run: baseRun,
      events: [],
    });
    expect(work.state).toBe("working");
  });

  it("Rule 9 & 10: queued during active run, idle when run not active", () => {
    const queued = deriveAgentState({
      agent: "reporter",
      status: makeStatus("queued", { name: "reporter" }),
      run: baseRun,
      events: [],
    });
    expect(queued.state).toBe("queued");

    const idle = deriveAgentState({
      agent: "reporter",
      status: makeStatus("idle", { name: "reporter" }),
      run: null,
      events: [],
    });
    expect(idle.state).toBe("idle");
  });
});

describe("Response proposal honesty & status badges", () => {
  const baseProposal = {
    id: "RESP-001",
    case_id: "CASE-2026-0001",
    action: "isolate_host",
    target: "WKS-FIN-04",
    target_type: "host",
    risk: "high",
    status: "pending_approval",
    rationale: "Contain ransomware lateral movement",
    impact: "Host network isolated",
    rollback_plan: "Re-enable interface",
    finding_ids: ["F-001"],
    evidence_ids: ["EV-0001"],
    proposed_by: "investigator",
    proposed_at: "2026-11-10T01:00:00Z",
    expires_at: "2027-12-31T23:59:59Z",
    payload_hash: "abc12345",
    basis_hash: "def67890",
    approved_by: null,
    approved_at: null,
    approval_note: "",
    rejected_by: null,
    rejected_at: null,
    rejection_reason: "",
    executed_by: null,
    executed_at: null,
    execution_mode: "simulation",
    execution_result: "",
    rolled_back_by: null,
    rolled_back_at: null,
    rollback_reason: "",
  } as unknown as ResponseProposal;

  it("distinguishes Approved from Executed and labels simulations honestly", () => {
    const approved = proposalStatusBadge({
      ...baseProposal,
      status: "approved",
      approved_by: "Analyst",
    });
    expect(approved.label).toBe("Approved by Analyst — not executed");

    const simulated = proposalStatusBadge({
      ...baseProposal,
      status: "simulated",
    });
    expect(simulated.label).toBe("SIMULATED — NO SYSTEM ACTION TAKEN");
    expect(simulated.tone).toBe("amber");
  });

  it("detects expired proposals accurately", () => {
    expect(isProposalExpired(baseProposal)).toBe(false);
    expect(
      isProposalExpired({
        ...baseProposal,
        expires_at: "2020-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });
});

describe("Cortex XSIAM reference components", () => {
  it("renders AgentOperatorDesk with 4 specialist agents", () => {
    render(
      <AgentOperatorDesk
        agents={[
          { key: "triage", name: "Triage", state: "done", throughput: "11 signals", lastAt: "10:00 MYT" },
          { key: "investigator", name: "Investigator", state: "running", throughput: "6 steps", lastAt: "10:01 MYT" },
          { key: "verifier", name: "Verifier", state: "awaiting", throughput: "5 checks", lastAt: "10:02 MYT" },
          { key: "reporter", name: "Reporter", state: "idle", throughput: "EN + BM", lastAt: "10:02 MYT" },
        ]}
      />,
    );
    expect(screen.getByText("Triage")).toBeTruthy();
    expect(screen.getByText("Investigator")).toBeTruthy();
    expect(screen.getByText("1 working")).toBeTruthy();
    expect(screen.getByText("1 need you")).toBeTruthy();
  });

  it("renders PlanDagNode with policy-blocked state and receipt chips", () => {
    const nodeProps = {
      id: "T-06",
      type: "planStep",
      selected: false,
      dragging: false,
      zIndex: 1,
      isConnectable: false,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      data: {
        stepId: "T-06",
        tool: "exec_shell",
        summary: "Attempt unapproved shell",
        status: "blocked",
        policy: "blocked",
        policyReason: "Tool exec_shell is not in the read-only allowlist",
        evidenceIds: ["EV-0001", "EV-0002"],
        planVersion: 2,
        addedInVersion: 2,
      },
    } as unknown as NodeProps<PlanStepNode>;

    render(
      <ReactFlowProvider>
        <PlanDagNode {...nodeProps} />
      </ReactFlowProvider>,
    );
    expect(screen.getByText("Attempt unapproved shell")).toBeTruthy();
    expect(screen.getByText(/Tool exec_shell is not in the read-only allowlist/)).toBeTruthy();
    expect(screen.getByText("EV-0001")).toBeTruthy();
  });
});
