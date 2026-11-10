import { useState } from "react";
import type { CaseSummary } from "@/lib/types";
import { CreatedCase } from "./CreatedCase";
import { ScenarioCard } from "./ScenarioCard";
import { UploadForm } from "./UploadForm";

export function NewInvestigationPanel() {
  const [created, setCreated] = useState<CaseSummary | null>(null);
  return (
    <section aria-label="New investigation" className="grid gap-4 lg:grid-cols-2">
      <ScenarioCard onCreated={setCreated} />
      <UploadForm onCreated={setCreated} />
      {created && (
        <div className="lg:col-span-2">
          <CreatedCase key={created.id} caseSummary={created} />
        </div>
      )}
    </section>
  );
}
