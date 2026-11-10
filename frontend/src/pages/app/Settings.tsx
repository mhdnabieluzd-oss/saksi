import { useId, useState, type FormEvent, type ReactNode } from "react";
import { RotateCw, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CLASSIFICATIONS } from "@/components/report/labels";
import { useMotionPreference } from "@/lib/motion";
import { useLlmHealth, useOverview, useSaveSettings, useSettings } from "@/lib/queries";
import type { Classification, Settings as SettingsData } from "@/lib/types";

const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

function Field({ id, label, hint, children }: { id: string; label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {children}
      <p id={`${id}-hint`} className="text-xs text-text-muted">
        {hint}
      </p>
    </div>
  );
}

function SettingsForm({ initial }: { initial: SettingsData }) {
  const save = useSaveSettings();
  const { reducedMotion, userReduced, setReduceMotion } = useMotionPreference();
  const analystId = useId();
  const modelId = useId();
  const reporterId = useId();
  const classificationLabelId = useId();
  const [analyst, setAnalyst] = useState(initial.analyst_name);
  const [model, setModel] = useState(initial.model);
  const [reporter, setReporter] = useState(initial.reporter_model);
  const [classification, setClassification] = useState<Classification>(initial.default_classification);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    analyst.trim() !== initial.analyst_name ||
    model.trim() !== initial.model ||
    reporter.trim() !== initial.reporter_model ||
    classification !== initial.default_classification;

  function handleReset() {
    setAnalyst(initial.analyst_name);
    setModel(initial.model);
    setReporter(initial.reporter_model);
    setClassification(initial.default_classification);
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: SettingsData = {
      analyst_name: analyst.trim(),
      model: model.trim(),
      reporter_model: reporter.trim(),
      default_classification: classification,
    };
    if (!next.analyst_name || !next.model || !next.reporter_model) {
      setError("Analyst name and both model fields are required.");
      return;
    }
    setError(null);
    save.mutate(next, {
      onSuccess: () => toast.success("Settings saved"),
      onError: (saveError) => toast.error(`Could not save settings: ${saveError.message}`),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="space-y-4">
        <h3 className="text-xs font-semibold tracking-wider text-text-secondary uppercase">Analyst identity</h3>
        <Field
          id={analystId}
          label="Analyst name"
          hint="Recorded verbatim on response approvals, rejections, rollbacks, and chain-of-custody ledger entries."
        >
          <Input
            id={analystId}
            value={analyst}
            maxLength={80}
            aria-describedby={`${analystId}-hint`}
            onChange={(event) => setAnalyst(event.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-4 border-t border-border pt-4">
        <h3 className="text-xs font-semibold tracking-wider text-text-secondary uppercase">
          Models &amp; report classification
        </h3>
        <Field
          id={modelId}
          label="Investigation model"
          hint={`Model used by the investigation agents. Default: ${DEFAULT_MODEL}.`}
        >
          <Input
            id={modelId}
            value={model}
            aria-describedby={`${modelId}-hint`}
            onChange={(event) => setModel(event.target.value)}
          />
        </Field>

        <Field
          id={reporterId}
          label="Reporter model"
          hint={`Model used to draft the Commander's Brief. Default: ${DEFAULT_MODEL}.`}
        >
          <Input
            id={reporterId}
            value={reporter}
            aria-describedby={`${reporterId}-hint`}
            onChange={(event) => setReporter(event.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span id={classificationLabelId} className="text-sm font-medium text-text">
            Default classification
          </span>
          <Select value={classification} onValueChange={(value) => setClassification(value as Classification)}>
            <SelectTrigger aria-labelledby={classificationLabelId} className="sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLASSIFICATIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-text-muted">Preselected when generating a Commander&apos;s Brief.</p>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-xs font-semibold tracking-wider text-text-secondary uppercase">
          Accessibility &amp; motion
        </h3>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-bg p-3 text-sm">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setReduceMotion(e.target.checked)}
            className="mt-1"
          />
          <span>
            <strong className="block font-medium text-text">Reduce motion</strong>
            <span className="text-xs text-text-muted">
              Disables continuous agent SVG loops and uses instant state transitions ({!userReduced ? "following OS preference" : "manual override active"}).
            </span>
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending || !isDirty}>
            {save.isPending ? "Saving..." : "Save settings"}
          </Button>
          {isDirty && (
            <Button type="button" variant="secondary" onClick={handleReset} disabled={save.isPending}>
              Discard changes
            </Button>
          )}
        </div>
        {isDirty && (
          <span role="status" className="text-xs font-medium text-amber">
            Unsaved changes
          </span>
        )}
      </div>
    </form>
  );
}

export default function Settings() {
  const settings = useSettings();
  const overview = useOverview(false);
  const llmQuery = useLlmHealth(true);
  const llm = llmQuery.data ?? overview.data?.llm;

  const latencyMs = llm?.latency_ms ?? null;
  const latencyStatus =
    !llm || !llm.ok
      ? { label: "Unreachable", tone: "red" as const }
      : latencyMs !== null && latencyMs > 15000
        ? { label: `Slow (${latencyMs} ms)`, tone: "red" as const }
        : latencyMs !== null && latencyMs > 3000
          ? { label: `Degraded (${latencyMs} ms)`, tone: "amber" as const }
          : { label: "Reachable", tone: "green" as const };

  return (
    <>
      <PageHeader title="Settings" subtitle="Analyst name, report classification, and motion preferences." />

      {settings.isError ? (
        <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />
      ) : !settings.data ? (
        <div aria-busy="true">
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card title="Configuration">
            <SettingsForm initial={settings.data} />
          </Card>

          <aside className="flex min-w-0 flex-col gap-6">
            <Card
              title="LLM health"
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void llmQuery.refetch()}
                  disabled={llmQuery.isFetching}
                >
                  <RotateCw className="size-3.5" />
                  Probe
                </Button>
              }
            >
              {!llm ? (
                <p className="text-sm text-text-secondary">
                  {llmQuery.isError ? "Unavailable" : "Checking LLM provider..."}
                </p>
              ) : (
                <dl className="flex flex-col gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-text-secondary">Model</dt>
                    <dd className="mt-0.5 font-mono text-xs break-all text-text">{llm.model}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-secondary">Status</dt>
                    <dd className="mt-1">
                      <Badge tone={latencyStatus.tone}>{latencyStatus.label}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-secondary">Latency</dt>
                    <dd className="mt-0.5 font-mono text-xs text-text tabular-nums">
                      {llm.latency_ms === null ? "Not measured" : `${llm.latency_ms} ms`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-secondary">Detail</dt>
                    <dd className="mt-0.5 text-xs break-words text-text-secondary">{llm.detail}</dd>
                  </div>
                </dl>
              )}
            </Card>

            <Card title="Post-Quantum Signing (ML-DSA-65)">
              {!overview.data ? (
                <p className="text-sm text-text-secondary">{overview.isError ? "Unavailable" : "Checking"}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-2 text-sm text-text">
                    {overview.data.ml_dsa_ready ? (
                      <ShieldCheck aria-hidden className="size-4 text-green" />
                    ) : (
                      <ShieldX aria-hidden className="size-4 text-red" />
                    )}
                    ML-DSA-65 signing {overview.data.ml_dsa_ready ? "ready" : "not ready"}
                  </p>
                  <p className="text-xs text-text-muted">
                    Signs the custody ledger head hash when the Reporter seals a completed investigation.
                  </p>
                </div>
              )}
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
