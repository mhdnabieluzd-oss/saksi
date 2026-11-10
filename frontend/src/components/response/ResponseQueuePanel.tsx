import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FlaskConical,
  Lock,
  Play,
  RotateCcw,
  Server,
  Shield,
  ShieldAlert,
  UserX,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ExecutionMode, Finding, ResponseProposal } from "@/lib/types";
import {
  useApproveResponse,
  useCase,
  useExecuteResponse,
  useRejectResponse,
  useResponseProposals,
  useRollbackResponse,
  useSettings,
} from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { Hash } from "@/components/ui/hash";
import { Timestamp } from "@/components/ui/timestamp";
import { isProposalExpired, proposalStatusBadge } from "./proposalHelpers";

const ACTION_ICON = {
  isolate_host: Server,
  disable_account: UserX,
  block_ip: Ban,
  quarantine_file: ShieldAlert,
};

export function ResponseQueuePanel({ caseId }: { caseId: string }) {
  const proposalsQuery = useResponseProposals(caseId);
  const caseQuery = useCase(caseId);
  const settingsQuery = useSettings();
  const approve = useApproveResponse(caseId);
  const reject = useRejectResponse(caseId);
  const execute = useExecuteResponse(caseId);
  const rollback = useRollbackResponse(caseId);

  const [approvingProposal, setApprovingProposal] = useState<ResponseProposal | null>(null);
  const [approvalScope, setApprovalScope] = useState<ExecutionMode>("simulation");
  const [note, setNote] = useState("");

  const [rejectingProposal, setRejectingProposal] = useState<ResponseProposal | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [simulatingProposal, setSimulatingProposal] = useState<ResponseProposal | null>(null);

  const [labExecutingProposal, setLabExecutingProposal] = useState<ResponseProposal | null>(null);
  const [confirmTargetInput, setConfirmTargetInput] = useState("");

  const [rollingBackProposal, setRollingBackProposal] = useState<ResponseProposal | null>(null);
  const [rollbackNote, setRollbackNote] = useState("");

  const analystName = settingsQuery.data?.analyst_name ?? "Analyst";
  const proposals = proposalsQuery.data ?? [];
  const findings = caseQuery.data?.findings ?? [];
  const findingById = new Map<string, Finding>(findings.map((f) => [f.id, f]));

  function handleConfirmApprove(proposal: ResponseProposal) {
    approve.mutate(
      {
        proposalId: proposal.id,
        analyst: analystName,
        payload_hash: proposal.payload_hash,
        note: note.trim(),
        mode: approvalScope,
      },
      {
        onSuccess: () => {
          toast.success(`Approved ${proposal.id} (${proposal.target}) for ${approvalScope}`);
          setApprovingProposal(null);
          setNote("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Approval failed"),
      },
    );
  }

  function handleConfirmReject(proposal: ResponseProposal) {
    reject.mutate(
      {
        proposalId: proposal.id,
        analyst: analystName,
        payload_hash: proposal.payload_hash,
        note: rejectNote.trim(),
      },
      {
        onSuccess: () => {
          toast.info(`Rejected ${proposal.id}`);
          setRejectingProposal(null);
          setRejectNote("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Reject failed"),
      },
    );
  }

  function handleConfirmSimulation(proposal: ResponseProposal) {
    execute.mutate(
      {
        proposalId: proposal.id,
        analyst: analystName,
        payload_hash: proposal.payload_hash,
        mode: "simulation",
      },
      {
        onSuccess: () => {
          toast.info(`Simulation completed for ${proposal.id} (${proposal.target}) — no system action taken`);
          setSimulatingProposal(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Simulation failed"),
      },
    );
  }

  function handleConfirmLabExecute(proposal: ResponseProposal) {
    execute.mutate(
      {
        proposalId: proposal.id,
        analyst: analystName,
        payload_hash: proposal.payload_hash,
        mode: "live_lab",
        confirm_target: confirmTargetInput.trim(),
        environment: "LAB-LOCAL",
      },
      {
        onSuccess: () => {
          toast.success(`Lab record written in LAB-LOCAL for ${proposal.id} (${proposal.target})`);
          setLabExecutingProposal(null);
          setConfirmTargetInput("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Lab execution failed"),
      },
    );
  }

  function handleConfirmRollback(proposal: ResponseProposal) {
    rollback.mutate(
      {
        proposalId: proposal.id,
        analyst: analystName,
        payload_hash: proposal.payload_hash,
        note: rollbackNote.trim(),
      },
      {
        onSuccess: () => {
          toast.info(`Rolled back ${proposal.id} (${proposal.target})`);
          setRollingBackProposal(null);
          setRollbackNote("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Rollback failed"),
      },
    );
  }

  if (proposalsQuery.isPending) {
    return (
      <Card title="Response Actions (MITRE D3FEND)">
        <p className="text-xs text-text-muted">Loading response proposals...</p>
      </Card>
    );
  }

  if (proposals.length === 0) {
    return (
      <Card
        title="Response Actions (MITRE D3FEND)"
        description="Defensive containment recommendations are generated strictly from verified findings."
      >
        <p className="text-xs text-text-muted">
          No response proposals available yet. Run the investigation to verify findings first.
        </p>
      </Card>
    );
  }

  const simulatedCount = proposals.filter(
    (p) => p.status === "simulated" || (p.status === "succeeded" && p.execution_mode === "simulation"),
  ).length;
  const labWrittenCount = proposals.filter(
    (p) => p.status === "succeeded" && p.execution_mode === "live_lab",
  ).length;

  return (
    <div className="space-y-4">
      <div
        role="note"
        aria-label="Human-in-the-loop safety boundary"
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-4"
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Shield className="size-4 text-cyan" />
            <h3 className="text-sm font-semibold text-text">
              Response Actions
            </h3>
            <Badge tone="amber">
              <Lock className="size-3" />
              Analyst approval required
            </Badge>
          </div>
          <p className="text-xs text-text-secondary">
            SAKSI never runs a response on its own. Approve or reject each recommended action below before running a simulation or lab test.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="amber" mono>
            {proposals.filter((p) => p.status === "pending_approval").length} pending review
          </Badge>
          <Badge tone="cyan" mono>
            {proposals.filter((p) => p.status === "approved").length} approved
          </Badge>
          {simulatedCount > 0 && (
            <Badge tone="amber" mono>
              {simulatedCount} simulated
            </Badge>
          )}
          {labWrittenCount > 0 && (
            <Badge tone="neutral" mono>
              {labWrittenCount} lab record
            </Badge>
          )}
        </div>
      </div>

      <ul className="space-y-3">
        {proposals.map((proposal) => {
          const statusMeta = proposalStatusBadge(proposal);
          const Icon = ACTION_ICON[proposal.action_type] ?? Shield;
          const expired = isProposalExpired(proposal);
          const unverifiedRefs = proposal.finding_ids.filter(
            (fid) => findingById.get(fid)?.status !== "verified",
          );
          const basisBroken = unverifiedRefs.length > 0 || proposal.status === "invalidated";

          return (
            <li
              key={proposal.id}
              className="rounded-md border border-border bg-surface p-4 transition-colors hover:border-border/80"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-cyan">{proposal.id}</span>
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                    {proposal.approved_mode && proposal.status === "approved" && (
                      <Badge tone={proposal.approved_mode === "live_lab" ? "amber" : "neutral"} mono>
                        Scope: {proposal.approved_mode === "live_lab" ? "live_lab (LAB-LOCAL)" : "simulation"}
                      </Badge>
                    )}
                    <Badge tone="neutral" mono>
                      {proposal.d3fend_id} · {proposal.d3fend_name}
                    </Badge>
                    <Badge tone={proposal.risk_tier === "critical" ? "red" : "amber"}>
                      Impact: {proposal.risk_tier}
                    </Badge>
                  </div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-text">
                    <Icon className="size-4 text-cyan" />
                    {proposal.title}
                  </h4>
                  <p className="text-xs text-text-secondary">{proposal.reason}</p>
                </div>

                {/* Action Controls: Recommendation -> Approval -> Execution -> Rollback */}
                <div className="flex flex-wrap items-center gap-2">
                  {proposal.status === "pending_approval" && (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={expired || basisBroken}
                        title={
                          expired
                            ? "Proposal has expired — re-run the investigation to regenerate"
                            : basisBroken
                              ? "Cannot approve: cited finding is no longer verified"
                              : undefined
                        }
                        onClick={() => {
                          setNote("");
                          setApprovalScope("simulation");
                          setApprovingProposal(proposal);
                        }}
                      >
                        <CheckCircle2 className="size-3.5" />
                        Approve proposal
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRejectNote("");
                          setRejectingProposal(proposal);
                        }}
                        disabled={reject.isPending}
                      >
                        <XCircle className="size-3.5" />
                        Reject
                      </Button>
                    </>
                  )}

                  {proposal.status === "approved" && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSimulatingProposal(proposal)}
                        disabled={execute.isPending || expired || basisBroken}
                      >
                        <FlaskConical className="size-3.5" />
                        Run simulation
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          execute.isPending ||
                          expired ||
                          basisBroken ||
                          proposal.approved_mode !== "live_lab"
                        }
                        title={
                          proposal.approved_mode !== "live_lab"
                            ? "Approved for simulation only. Re-approve with live_lab scope to write to LAB-LOCAL."
                            : "Write containment record in LAB-LOCAL"
                        }
                        onClick={() => {
                          setConfirmTargetInput("");
                          setLabExecutingProposal(proposal);
                        }}
                      >
                        <Play className="size-3.5" />
                        Execute in lab
                      </Button>
                    </>
                  )}

                  {(proposal.status === "succeeded" || proposal.status === "simulated") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRollbackNote("");
                        setRollingBackProposal(proposal);
                      }}
                      disabled={rollback.isPending}
                    >
                      <RotateCcw className="size-3.5" />
                      Review rollback
                    </Button>
                  )}
                </div>
              </div>

              {(proposal.invalidated_reason || basisBroken || expired) && (
                <div
                  role="alert"
                  className="mt-3 flex items-center gap-2 rounded-sm border border-red/40 bg-red/10 px-3 py-2 text-xs text-red"
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    {proposal.invalidated_reason ??
                      (expired
                        ? "Proposal expired. Re-run the investigation to generate fresh proposals."
                        : `Basis invalid: finding(s) ${unverifiedRefs.join(", ")} are not currently verified.`)}
                  </span>
                </div>
              )}

              <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 text-xs md:grid-cols-3">
                <div className="space-y-1">
                  <p className="font-medium text-text-muted">Target &amp; Security Benefit</p>
                  <p className="font-mono text-text">
                    {proposal.action_type} → <span className="text-cyan">{proposal.target}</span>
                  </p>
                  <p className="text-text-secondary">{proposal.security_benefit}</p>
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-text-muted">Operational Impact &amp; Rollback</p>
                  <p className="text-text-secondary">{proposal.impact_assessment}</p>
                  <p className="font-mono text-[11px] text-text-muted">
                    Rollback: {proposal.rollback_procedure}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Expires: <Timestamp iso={proposal.expires_at} />
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="font-medium text-text-muted">
                    Finding Basis, Evidence Receipts &amp; Payload Hash
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {proposal.finding_ids.map((fid) => {
                      const f = findingById.get(fid);
                      const status = f?.status ?? "missing";
                      const tone =
                        status === "verified" ? "green" : status === "unverified" ? "amber" : "red";
                      const label =
                        status === "verified"
                          ? "Verified"
                          : status === "unverified"
                            ? "Unverified"
                            : status === "rejected"
                              ? "Rejected"
                              : "Missing";
                      return (
                        <Badge key={fid} tone={tone} mono>
                          {fid} ({label})
                        </Badge>
                      );
                    })}
                    {proposal.evidence_ids.slice(0, 6).map((eid) => (
                      <EvidenceChip key={eid} caseId={caseId} eventId={eid} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-0.5 text-[11px] text-text-muted">
                    <span>Payload SHA-256:</span>
                    <Hash value={proposal.payload_hash} n={16} />
                  </div>
                </div>
              </div>

              {proposal.approved_by && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs">
                  <span className="text-text-secondary">
                    Decision by <strong className="text-text">{proposal.approved_by}</strong>{" "}
                    {proposal.approved_at && <Timestamp iso={proposal.approved_at} />}
                    {proposal.decision_note ? ` — "${proposal.decision_note}"` : " — (no note recorded)"}
                  </span>
                  {proposal.ledger_seq && (
                    <Badge tone="cyan" mono>
                      Ledger #{proposal.ledger_seq}
                    </Badge>
                  )}
                </div>
              )}

              {proposal.execution_result && (
                <div
                  className={
                    proposal.execution_mode === "simulation"
                      ? "mt-2 rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 font-mono text-xs text-amber"
                      : "mt-2 rounded-sm border border-border bg-bg px-3 py-2 font-mono text-xs text-text-secondary"
                  }
                >
                  {proposal.execution_result}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* 1. Analyst Approval Confirmation Dialog */}
      <Dialog
        open={approvingProposal !== null}
        onOpenChange={(open) => {
          if (!open) setApprovingProposal(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-base font-semibold text-text">
            Approve Response Proposal — {approvingProposal?.id}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs text-text-secondary">
            Approving records a <span className="font-mono">RESPONSE_APPROVED</span> entry in the chain-of-custody
            ledger bound to the recomputed <span className="font-mono">payload_hash</span> and verified finding basis.
            Approving does not execute the action automatically.
          </DialogDescription>

          {approvingProposal && (
            <div className="mt-4 space-y-3 rounded-md border border-border bg-bg p-3 text-xs">
              <div className="grid grid-cols-[120px_1fr] gap-y-1.5">
                <span className="text-text-muted">Action:</span>
                <span className="font-mono font-semibold text-cyan">{approvingProposal.action_type}</span>
                <span className="text-text-muted">Exact Target:</span>
                <span className="font-mono font-semibold text-text">{approvingProposal.target}</span>
                <span className="text-text-muted">D3FEND Counter:</span>
                <span>
                  {approvingProposal.d3fend_id} · {approvingProposal.d3fend_name}
                </span>
                <span className="text-text-muted">Payload Hash:</span>
                <span className="font-mono text-[11px] break-all text-text-secondary">
                  {approvingProposal.payload_hash}
                </span>
              </div>

              <div className="border-t border-border pt-2">
                <p className="font-medium text-amber">Impact Assessment &amp; Rollback:</p>
                <p className="text-text-secondary">{approvingProposal.impact_assessment}</p>
                <p className="mt-1 font-mono text-[11px] text-text-muted">
                  Rollback: {approvingProposal.rollback_procedure}
                </p>
              </div>

              <fieldset className="space-y-1.5 border-t border-border pt-2">
                <legend className="font-medium text-text-secondary">Permitted Execution Scope</legend>
                <label className="flex cursor-pointer items-start gap-2 rounded border border-border bg-surface p-2">
                  <input
                    type="radio"
                    name="approval-scope"
                    value="simulation"
                    checked={approvalScope === "simulation"}
                    onChange={() => setApprovalScope("simulation")}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="block text-text">Simulation only (Recommended)</strong>
                    <span className="text-[11px] text-text-muted">
                      Dry-run only. Verifies policy and writes a ledger entry without touching any lab adapter.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded border border-border bg-surface p-2">
                  <input
                    type="radio"
                    name="approval-scope"
                    value="live_lab"
                    checked={approvalScope === "live_lab"}
                    onChange={() => setApprovalScope("live_lab")}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="block text-amber">Allow Lab Adapter (LAB-LOCAL)</strong>
                    <span className="text-[11px] text-text-muted">
                      Permits writing a containment record to the local lab state file after a second target
                      confirmation step.
                    </span>
                  </span>
                </label>
              </fieldset>

              <div>
                <label htmlFor="approval-note" className="block font-medium text-text-secondary">
                  Analyst Decision Note (optional)
                </label>
                <input
                  id="approval-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional justification recorded verbatim in the custody ledger"
                  className="mt-1 w-full rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:border-cyan focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            {approvingProposal && (
              <Button
                variant="primary"
                onClick={() => handleConfirmApprove(approvingProposal)}
                disabled={approve.isPending}
              >
                <CheckCircle2 className="size-4" />
                Approve &amp; Bind Payload Hash
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. Reject Proposal Dialog */}
      <Dialog
        open={rejectingProposal !== null}
        onOpenChange={(open) => {
          if (!open) setRejectingProposal(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-base font-semibold text-text">
            Reject Response Proposal — {rejectingProposal?.id}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs text-text-secondary">
            Rejecting records <span className="font-mono">RESPONSE_REJECTED</span> in the custody ledger and prevents
            this proposal from being executed.
          </DialogDescription>
          {rejectingProposal && (
            <div className="mt-4 space-y-2 text-xs">
              <label htmlFor="reject-note" className="block font-medium text-text-secondary">
                Reason for rejection (optional)
              </label>
              <input
                id="reject-note"
                type="text"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Optional note recorded in the custody ledger"
                className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:border-cyan focus:outline-none"
              />
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            {rejectingProposal && (
              <Button
                variant="danger"
                onClick={() => handleConfirmReject(rejectingProposal)}
                disabled={reject.isPending}
              >
                <XCircle className="size-4" />
                Reject proposal
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. Run Simulation Confirmation Dialog */}
      <Dialog
        open={simulatingProposal !== null}
        onOpenChange={(open) => {
          if (!open) setSimulatingProposal(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-base font-semibold text-text">
            Run Containment Simulation — {simulatingProposal?.id}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs text-text-secondary">
            This performs a dry-run simulation for <span className="font-mono text-cyan">{simulatingProposal?.target}</span>{" "}
            and logs <span className="font-mono">RESPONSE_SIMULATED</span> to the chain-of-custody ledger. No external
            host, account, or firewall rule is modified.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            {simulatingProposal && (
              <Button
                variant="primary"
                onClick={() => handleConfirmSimulation(simulatingProposal)}
                disabled={execute.isPending}
              >
                <FlaskConical className="size-4" />
                Confirm simulation
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. Two-Step Lab Execution Dialog (requires typed target + LAB-LOCAL) */}
      <Dialog
        open={labExecutingProposal !== null}
        onOpenChange={(open) => {
          if (!open) setLabExecutingProposal(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-base font-semibold text-text">
            Execute in Lab Adapter (LAB-LOCAL) — {labExecutingProposal?.id}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs text-text-secondary">
            This writes a containment record to the isolated <span className="font-mono">LAB-LOCAL</span> adapter and
            logs <span className="font-mono">RESPONSE_EXECUTED</span> in the custody ledger. Type the exact target name
            below to confirm.
          </DialogDescription>
          {labExecutingProposal && (
            <div className="mt-4 space-y-3 rounded-md border border-amber/40 bg-amber/5 p-3 text-xs">
              <div className="grid grid-cols-[120px_1fr] gap-y-1">
                <span className="text-text-muted">Environment:</span>
                <span className="font-mono font-semibold text-amber">LAB-LOCAL</span>
                <span className="text-text-muted">Action:</span>
                <span className="font-mono text-text">{labExecutingProposal.action_type}</span>
                <span className="text-text-muted">Target to type:</span>
                <span className="font-mono font-semibold text-cyan">{labExecutingProposal.target}</span>
              </div>
              <div>
                <label htmlFor="confirm-target-input" className="block font-medium text-text">
                  Type <span className="font-mono text-cyan">{labExecutingProposal.target}</span> to confirm:
                </label>
                <input
                  id="confirm-target-input"
                  type="text"
                  value={confirmTargetInput}
                  onChange={(e) => setConfirmTargetInput(e.target.value)}
                  placeholder={labExecutingProposal.target}
                  className="mt-1 w-full rounded border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text focus:border-cyan focus:outline-none"
                />
              </div>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            {labExecutingProposal && (
              <Button
                variant="danger"
                onClick={() => handleConfirmLabExecute(labExecutingProposal)}
                disabled={
                  execute.isPending || confirmTargetInput.trim() !== labExecutingProposal.target
                }
              >
                <Play className="size-4" />
                Confirm &amp; Write to LAB-LOCAL
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 5. Rollback Confirmation Dialog */}
      <Dialog
        open={rollingBackProposal !== null}
        onOpenChange={(open) => {
          if (!open) setRollingBackProposal(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-base font-semibold text-text">
            Review Rollback — {rollingBackProposal?.id}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs text-text-secondary">
            Rolling back marks the containment record as rolled back in <span className="font-mono">LAB-LOCAL</span> and
            appends <span className="font-mono">RESPONSE_ROLLED_BACK</span> to the custody ledger.
          </DialogDescription>
          {rollingBackProposal && (
            <div className="mt-4 space-y-2 text-xs">
              <p className="font-mono text-[11px] text-text-muted">
                Procedure: {rollingBackProposal.rollback_procedure}
              </p>
              <label htmlFor="rollback-note" className="block font-medium text-text-secondary">
                Rollback note (optional)
              </label>
              <input
                id="rollback-note"
                type="text"
                value={rollbackNote}
                onChange={(e) => setRollbackNote(e.target.value)}
                placeholder="Optional rollback reason recorded in the ledger"
                className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:border-cyan focus:outline-none"
              />
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            {rollingBackProposal && (
              <Button
                variant="primary"
                onClick={() => handleConfirmRollback(rollingBackProposal)}
                disabled={rollback.isPending}
              >
                <RotateCcw className="size-4" />
                Confirm rollback
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
