import { FlaskConical, LoaderCircle, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCreateScenario } from "@/lib/queries";

/** Shown in place of the incidents table until the first case exists. */
export function FirstRunPanel() {
  const navigate = useNavigate();
  const scenario = useCreateScenario();

  return (
    <EmptyState
      icon={FlaskConical}
      title="No investigations yet"
      description="Load the HQ breach training scenario to see SAKSI work end to end, or upload your own SIEM logs."
      action={
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="primary"
              disabled={scenario.isPending}
              onClick={() => scenario.mutate(undefined, { onSuccess: (created) => navigate(`/app/cases/${created.id}`) })}
            >
              {scenario.isPending ? <LoaderCircle aria-hidden className="animate-spin" /> : <FlaskConical aria-hidden />}
              {scenario.isPending ? "Loading scenario" : "Load the HQ breach training scenario"}
            </Button>
            <Button asChild variant="secondary">
              <Link to="/app/investigations?new=1">
                <Upload aria-hidden />
                Upload logs
              </Link>
            </Button>
          </div>
          {scenario.isError && (
            <p role="alert" className="text-sm text-red">
              {scenario.error.message}
            </p>
          )}
        </div>
      }
    />
  );
}
