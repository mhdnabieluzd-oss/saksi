import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Timestamp } from "@/components/ui/timestamp";
import { useStartRun } from "@/lib/queries";
import type { CaseSummary } from "@/lib/types";

export function CreatedCase({ caseSummary }: { caseSummary: CaseSummary }) {
  const navigate = useNavigate();
  const start = useStartRun(caseSummary.id);
  const { id } = caseSummary;
  const kinds = caseSummary.sources.map((source) => source.kind).join(", ");

  return (
    <Card title="Case created" description="Start the agents now, or open the workspace first.">
      <dl className="grid gap-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
        <dt className="text-text-secondary">Case</dt>
        <dd className="font-mono text-xs text-cyan">{id}</dd>
        <dt className="text-text-secondary">Title</dt>
        <dd className="text-text">{caseSummary.title}</dd>
        <dt className="text-text-secondary">Sources</dt>
        <dd className="text-text">
          {caseSummary.sources.length} file(s){kinds ? `: ${kinds}` : ""}
        </dd>
        <dt className="text-text-secondary">Events</dt>
        <dd className="text-text tabular-nums">{caseSummary.event_count}</dd>
        <dt className="text-text-secondary">Created</dt>
        <dd>
          <Timestamp iso={caseSummary.created_at} />
        </dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={start.isPending}
          onClick={() => start.mutate(undefined, { onSuccess: () => navigate(`/app/cases/${id}/agents`) })}
        >
          {start.isPending ? "Starting" : "Start investigation"}
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/app/cases/${id}`)}>
          Open workspace
        </Button>
      </div>
      {start.isError && (
        <div className="mt-4">
          <ErrorState title="Could not start the investigation" message={start.error.message} onRetry={() => start.mutate()} />
        </div>
      )}
    </Card>
  );
}
