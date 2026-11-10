import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AgentAvatar } from "@/components/agents/identity";
import { PageHeader } from "@/components/layout/PageHeader";
import { GenerationProgress } from "@/components/report/GenerationProgress";
import { ReportControls } from "@/components/report/ReportControls";
import { ReportDocument } from "@/components/report/ReportDocument";
import { useVerifyReportHash } from "@/components/report/useReportActions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { useCase, useGenerateReport, useReport } from "@/lib/queries";
import type { Classification, Lang } from "@/lib/types";

export default function Reports() {
  const { caseId = "" } = useParams();
  const [lang, setLang] = useState<Lang>("en");
  const [classification, setClassification] = useState<Classification>("SULIT");
  const detail = useCase(caseId);
  const report = useReport(caseId, lang);
  const generate = useGenerateReport(caseId);
  const verify = useVerifyReportHash(caseId);

  const ready = detail.data?.summary.status === "completed";
  const current = report.data;
  const notGenerated = report.error instanceof ApiError && report.error.status === 404;
  const canGenerate = ready && !generate.isPending;
  const verifyMatch =
    verify.data && current && verify.variables === current.report_hash ? verify.data.match : null;

  function generateNow() {
    generate.mutate({ lang, classification });
  }

  const crumbs = [
    { label: "Command Centre", to: "/app" },
    { label: "Investigations", to: "/app/investigations" },
    { label: detail.data?.summary.title ?? caseId, to: `/app/cases/${caseId}` },
    { label: "Commander's Brief" },
  ];

  return (
    <>
      <PageHeader
        title="Commander's Brief"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <AgentAvatar
              role="reporter"
              state={generate.isPending ? "working" : current ? "completed" : "idle"}
              size={24}
            />
            <span>
              Generate, preview, verify and export the bilingual report for this investigation.
            </span>
          </span>
        }
        breadcrumbs={crumbs}
      />

      {detail.isError && <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />}

      <ReportControls
        caseId={caseId}
        lang={lang}
        onLangChange={setLang}
        classification={classification}
        onClassificationChange={setClassification}
        canGenerate={canGenerate}
        generating={generate.isPending}
        onGenerate={generateNow}
        hasReport={Boolean(current)}
        verifying={verify.isPending}
        onVerify={() => {
          if (current) verify.mutate(current.report_hash);
        }}
        verifyMatch={verifyMatch}
      />

      <div className="mt-6 flex flex-col gap-4">
        {generate.isPending && <GenerationProgress />}
        {generate.isError && (
          <ErrorState title="Report generation failed" message={generate.error.message} onRetry={generateNow} />
        )}
        {verify.isError && <ErrorState title="Could not verify the hash" message={verify.error.message} />}

        {report.isPending ? (
          <div aria-busy="true">
            <Skeleton className="h-96" />
          </div>
        ) : notGenerated ? (
          <EmptyState
            title="No report in this language yet"
            description={
              ready
                ? "Generate the Commander's Brief in this language to preview and export it."
                : "Run the investigation first, then generate the Commander's Brief."
            }
            action={
              <Button variant="primary" disabled={!canGenerate} onClick={generateNow}>
                Generate report
              </Button>
            }
          />
        ) : report.isError ? (
          <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
        ) : current ? (
          <ReportDocument report={current} />
        ) : null}
      </div>

      {!ready && detail.data && (
        <p className="mt-6 text-sm text-text-secondary">
          The investigation has not completed.{" "}
          <Link to={`/app/cases/${caseId}/agents`} className="text-cyan underline-offset-2 hover:underline">
            Open agent operations
          </Link>{" "}
          to run it.
        </p>
      )}
    </>
  );
}
