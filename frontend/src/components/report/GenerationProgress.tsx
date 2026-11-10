import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

/** Shown while the reporter agent runs (10-30 s). Stage text advances with elapsed time. */
export function GenerationProgress() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.floor((now - startedAt) / 1_000);
  const stage =
    elapsed < 8
      ? "Collecting verified findings and evidence"
      : elapsed < 20
        ? "Drafting sections with the reporter model"
        : "Finalising the chain-of-custody summary";

  return <Spinner label={`${stage}… ${elapsed}s`} />;
}
