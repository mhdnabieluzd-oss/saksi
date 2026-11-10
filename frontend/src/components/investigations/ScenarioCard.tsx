import { FlaskConical, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCreateScenario } from "@/lib/queries";
import type { CaseSummary } from "@/lib/types";

export function ScenarioCard({ onCreated }: { onCreated: (created: CaseSummary) => void }) {
  const scenario = useCreateScenario();
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          HQ breach (simulated)
          <Badge tone="muted">Training data</Badge>
        </span>
      }
      description="Web portal breach, then stolen credentials, lateral movement and data exfiltration, across web, Sysmon and SIEM logs."
    >
      <p className="font-mono text-xs break-words text-text-secondary">
        Web portal breach → stolen credentials → lateral movement → data exfiltration
      </p>
      <div className="mt-4 flex flex-col items-start gap-2">
        <Button
          variant="primary"
          disabled={scenario.isPending}
          onClick={() => scenario.mutate(undefined, { onSuccess: onCreated })}
        >
          {scenario.isPending ? <LoaderCircle aria-hidden className="animate-spin" /> : <FlaskConical aria-hidden />}
          {scenario.isPending ? "Loading scenario" : "Load scenario"}
        </Button>
        {scenario.isError && (
          <p role="alert" className="text-sm text-red">
            {scenario.error.message}
          </p>
        )}
      </div>
    </Card>
  );
}
