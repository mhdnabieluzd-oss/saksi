import { useParams, useSearchParams } from "react-router-dom";
import { FileSearch, Files, FileText, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Finding } from "@/lib/types";
import { useCase, useEvents } from "@/lib/queries";
import { messageOf } from "@/components/agents/helpers";
import { PageHeader } from "@/components/layout/PageHeader";
import { ChainOfCustody } from "@/components/evidence/ChainOfCustody";
import { EvidenceDetailPanel } from "@/components/evidence/EvidenceDetailPanel";
import { EvidenceTable } from "@/components/evidence/EvidenceTable";
import { IntegrityPanel } from "@/components/evidence/IntegrityPanel";
import { ErrorState } from "@/components/ui/error-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const NO_FINDINGS: Finding[] = [];

/** A positive integer from a URL parameter, or null. */
function parseSeq(value: string | null): number | null {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n > 0 ? n : null;
}

const formatCount = (value: number | undefined) => (value === undefined ? "-" : value.toLocaleString("en-GB"));

export default function EvidenceExplorer() {
  const { caseId } = useParams();
  const id = caseId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const caseQuery = useCase(id);
  const suspicious = useEvents(id, { flag: "suspicious", limit: 1 });
  const quarantined = useEvents(id, { flag: "quarantined", limit: 1 });

  const tab = searchParams.get("tab") === "ledger" ? "ledger" : "events";
  const seq = parseSeq(searchParams.get("seq"));
  const eventId = searchParams.get("event");
  const summary = caseQuery.data?.summary;
  const findings = caseQuery.data?.findings ?? NO_FINDINGS;

  function setParam(name: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <>
      <PageHeader
        title="Evidence Explorer"
        subtitle="Search, filter and verify every event in the case."
        breadcrumbs={[
          { label: "Investigations", to: "/app/investigations" },
          { label: id, to: `/app/cases/${id}` },
          { label: "Evidence Explorer" },
        ]}
      />

      <div className="space-y-8">
        {caseQuery.isError && (
          <ErrorState
            title="Could not load the case"
            message={messageOf(caseQuery.error)}
            onRetry={() => void caseQuery.refetch()}
          />
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Total events"
            value={summary ? summary.event_count.toLocaleString("en-GB") : "-"}
            hint="Normalised and merged across sources"
            icon={FileText}
          />
          <MetricCard
            label="Sources"
            value={summary ? summary.sources.length : "-"}
            hint="Files ingested into this case"
            icon={Files}
          />
          <MetricCard
            label="Suspicious"
            value={formatCount(suspicious.data?.total)}
            tone="amber"
            hint="Flagged by detection rules"
            icon={TriangleAlert}
          />
          <MetricCard
            label="Quarantined"
            value={formatCount(quarantined.data?.total)}
            tone="red"
            hint="Withheld from the AI as suspected prompt injection"
            icon={ShieldAlert}
          />
        </div>

        <IntegrityPanel caseId={id} findings={findings} />

        <Tabs value={tab} onValueChange={(value) => setParam("tab", value)}>
          <TabsList aria-label="Evidence views">
            <TabsTrigger value="events">Evidence</TabsTrigger>
            <TabsTrigger value="ledger">Chain of custody</TabsTrigger>
          </TabsList>
          <TabsContent value="events">
            {!eventId && (
              <p className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
                <FileSearch aria-hidden className="size-4 shrink-0 text-text-muted" />
                Select a row to see its raw log, integrity check, signature status and custody history.
              </p>
            )}
            <div className={eventId ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]" : undefined}>
              <EvidenceTable
                caseId={id}
                findings={findings}
                selectedId={eventId}
                onSelect={(selected) => setParam("event", selected)}
              />
              {eventId && (
                <EvidenceDetailPanel caseId={id} eventId={eventId} onClose={() => setParam("event", null)} />
              )}
            </div>
          </TabsContent>
          <TabsContent value="ledger">
            <ChainOfCustody caseId={id} seq={seq} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
