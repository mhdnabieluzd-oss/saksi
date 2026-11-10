import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  FlaskConical,
  RotateCw,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { Finding, LedgerVerification } from "@/lib/types";
import type { StatusMeta } from "@/lib/format";
import { useLedgerVerify, useRestore, useTamper } from "@/lib/queries";
import { messageOf } from "@/components/agents/helpers";
import { cn } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Hash } from "@/components/ui/hash";
import { Timestamp } from "@/components/ui/timestamp";
import { CHECKING, signatureStatusMeta, statusMeta } from "./status";

function describeCheck(result: LedgerVerification): string {
  if (result.ok) return "Ledger check passed. The hash chain is intact.";
  const where = result.broken_at === null ? "" : ` at entry #${result.broken_at}`;
  return `Ledger check failed${where}. ${result.reason}`;
}

function cryptoCheck(
  result: LedgerVerification | undefined,
  error: Error | null,
): { meta: StatusMeta; body: ReactNode } {
  if (error) {
    return {
      meta: statusMeta("Check failed", "red", CircleX),
      body: <p className="text-text-secondary">{error.message}</p>,
    };
  }
  if (!result) return { meta: CHECKING, body: <p className="text-text-secondary">Checking the ledger.</p> };
  if (!result.ok) {
    return {
      meta: statusMeta("Chain broken", "red", ShieldX),
      body: (
        <div className="space-y-2">
          <p>
            Broken at entry <span className="font-mono">#{result.broken_at ?? "-"}</span>.
          </p>
          <p className="text-text-secondary">{result.reason}</p>
        </div>
      ),
    };
  }
  const eventsRoot =
    result.events_root_ok === null ? "Not computed" : result.events_root_ok ? "Matches recorded root" : "Does not match";
  return {
    meta: statusMeta("Chain intact", "green", ShieldCheck),
    body: (
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-text-secondary">Entries</dt>
        <dd className="font-mono">{result.entries}</dd>
        <dt className="text-text-secondary">Head hash</dt>
        <dd>{result.head_hash ? <Hash value={result.head_hash} n={16} /> : "-"}</dd>
        <dt className="text-text-secondary">Events root</dt>
        <dd>{eventsRoot}</dd>
      </dl>
    ),
  };
}

function signatureCheck(result: LedgerVerification | undefined): { meta: StatusMeta; body: ReactNode } {
  const signature = result?.signature;
  if (!result || !signature) {
    return { meta: CHECKING, body: <p className="text-text-secondary">Checking the signature.</p> };
  }
  return {
    meta: signatureStatusMeta(signature),
    body: (
      <div className="space-y-2">
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-text-secondary">Algorithm</dt>
          <dd className="font-mono">{signature.algorithm}</dd>
          <dt className="text-text-secondary">Key fingerprint</dt>
          <dd>
            <Hash value={signature.public_key_fingerprint} n={16} />
          </dd>
          <dt className="text-text-secondary">Signed entry</dt>
          <dd className="font-mono">{signature.signed_seq === null ? "-" : `#${signature.signed_seq}`}</dd>
          <dt className="text-text-secondary">Signed at</dt>
          <dd>{signature.signed_at ? <Timestamp iso={signature.signed_at} /> : "-"}</dd>
        </dl>
        {signature.valid === false && (
          <p className="text-red">The signed ledger head no longer matches the current head.</p>
        )}
        {signature.valid === null && (
          <p className="text-text-secondary">The ledger head is signed when the Reporter seals the case.</p>
        )}
      </div>
    ),
  };
}

function aiCheck(findings: Finding[]): { meta: StatusMeta; body: ReactNode } {
  if (findings.length === 0) {
    return {
      meta: statusMeta("No findings yet", "muted", CircleDashed),
      body: <p className="text-text-secondary">The Verifier has no findings to check.</p>,
    };
  }
  const count = (status: Finding["status"]) => findings.filter((finding) => finding.status === status).length;
  const verified = count("verified");
  const rejected = count("rejected");
  const unverified = count("unverified");
  const meta =
    verified === findings.length
      ? statusMeta(`${verified} of ${findings.length} verified`, "green", CircleCheck)
      : statusMeta(`${verified} of ${findings.length} verified`, "amber", TriangleAlert);
  return {
    meta,
    body: (
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-text-secondary">Verified</dt>
        <dd className="font-mono">{verified}</dd>
        <dt className="text-text-secondary">Rejected</dt>
        <dd className="font-mono">{rejected}</dd>
        <dt className="text-text-secondary">Unverified</dt>
        <dd className="font-mono">{unverified}</dd>
      </dl>
    ),
  };
}

function IntegrityCard({
  title,
  question,
  meta,
  alert,
  children,
}: {
  title: string;
  question: string;
  meta: StatusMeta;
  alert: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-md border bg-surface p-4",
        alert ? "border-red/50" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <StatusBadge meta={meta} />
      </div>
      <p className="text-xs text-text-secondary">{question}</p>
      <div className="min-w-0 text-sm text-text">{children}</div>
    </section>
  );
}

/** Three integrity checks, each with its own badge: cryptography, signature, and AI judgement. */
export function IntegrityPanel({ caseId, findings }: { caseId: string; findings: Finding[] }) {
  const verify = useLedgerVerify(caseId);
  const tamper = useTamper(caseId);
  const restore = useRestore(caseId);
  const [tamperOpen, setTamperOpen] = useState(false);
  const [demoControlsOpen, setDemoControlsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const result = verify.data;
  const tampered = result?.tampered_simulation === true;
  const broken = result !== undefined && !result.ok;
  const busy = tamper.isPending || restore.isPending;

  const crypto = cryptoCheck(result, verify.error);
  const signature = signatureCheck(result);
  const ai = aiCheck(findings);

  function verifyNow() {
    void verify.refetch().then(({ data }) => {
      if (data) setAnnouncement(describeCheck(data));
    });
  }

  function runTamper() {
    tamper.mutate(undefined, {
      onSuccess: (next) => {
        setTamperOpen(false);
        setAnnouncement(`Tampering simulated. ${describeCheck(next)}`);
      },
      onError: (error) => toast.error(messageOf(error)),
    });
  }

  function runRestore() {
    restore.mutate(undefined, {
      onSuccess: (next) => setAnnouncement(`Original ledger restored. ${describeCheck(next)}`),
      onError: (error) => toast.error(messageOf(error)),
    });
  }

  return (
    <section aria-labelledby="integrity-heading" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 id="integrity-heading" className="text-lg font-semibold text-text">
            Integrity
          </h2>
          <p className="max-w-2xl text-sm text-text-secondary">
            Three separate checks. Each answers a different question, so a pass in one does not prove the others.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tampered && (
            <Badge tone="amber">
              <TriangleAlert aria-hidden className="size-3.5" />
              Tampering simulated
            </Badge>
          )}
          <Button variant="secondary" size="sm" onClick={verifyNow} disabled={verify.isFetching}>
            <RotateCw aria-hidden />
            Verify now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={demoControlsOpen || tampered}
            onClick={() => setDemoControlsOpen((v) => !v)}
          >
            <FlaskConical aria-hidden className="size-3.5 text-amber" />
            Demo controls
            <ChevronDown className={cn("size-3.5 transition-transform", (demoControlsOpen || tampered) && "rotate-180")} />
          </Button>
        </div>
      </div>

      {(demoControlsOpen || tampered) && (
        <div
          role="region"
          aria-label="Tamper simulation demo controls"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber/40 bg-amber/5 px-3.5 py-2.5 text-xs"
        >
          <span className="text-text-secondary">
            <strong className="text-amber">Demo controls:</strong> Mutate one ledger entry in-place to demonstrate how
            SHA-256 chain verification and ML-DSA-65 head signatures detect tampering, then restore the original ledger.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {tampered && (
              <Button variant="outline" size="sm" onClick={runRestore} disabled={busy}>
                Restore original
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={() => setTamperOpen(true)}
              disabled={busy || tampered}
            >
              Simulate tampering
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <IntegrityCard
          title="Cryptographic integrity"
          question="Does the ledger hash chain still match what was recorded at ingestion?"
          meta={crypto.meta}
          alert={broken}
        >
          {crypto.body}
        </IntegrityCard>
        <IntegrityCard
          title="Digital signature"
          question="Was the ledger head signed, and does the ML-DSA-65 signature still verify?"
          meta={signature.meta}
          alert={result?.signature.valid === false}
        >
          {signature.body}
        </IntegrityCard>
        <IntegrityCard
          title="AI verification"
          question="Did the Verifier agent confirm each claim against its cited evidence?"
          meta={ai.meta}
          alert={false}
        >
          <div className="space-y-2">
            {ai.body}
            <p className="text-xs text-text-muted">
              This is AI judgement, not cryptography. It checks claims against the evidence and proves nothing about
              tampering.
            </p>
          </div>
        </IntegrityCard>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <Dialog open={tamperOpen} onOpenChange={setTamperOpen}>
        <DialogContent>
          <DialogTitle className="text-base font-semibold text-text">Simulate ledger tampering?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-text-secondary">
            This changes one character in the summary of a ledger entry in the middle of the chain. The hash chain
            then fails its check, which shows how SAKSI reports tampering. The evidence events are not changed, and
            Restore original puts the saved ledger back.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTamperOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={runTamper} disabled={tamper.isPending}>
              {tamper.isPending ? "Simulating" : "Simulate tampering"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
