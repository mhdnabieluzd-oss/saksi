import { useState } from "react";
import { LoaderCircle, Pause, Play, RotateCw, Square } from "lucide-react";
import type { RunStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface RunControlProps {
  run: RunStatus | null;
  starting: boolean;
  onStart: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

/**
 * Start (new, idle or failed), Pause/Resume/Stop while running or paused, and Re-run with confirmation (completed/stopped).
 */
export function RunControl({ run, starting, onStart, onPause, onResume, onStop }: RunControlProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (starting || run?.state === "running") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled size="sm">
          <LoaderCircle aria-hidden className="animate-spin" />
          Running
        </Button>
        {onPause && (
          <Button variant="secondary" size="sm" onClick={onPause}>
            <Pause aria-hidden />
            Pause
          </Button>
        )}
        {onStop && (
          <Button variant="outline" size="sm" onClick={onStop}>
            <Square aria-hidden />
            Stop
          </Button>
        )}
      </div>
    );
  }

  if (run?.state === "paused") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {onResume && (
          <Button variant="primary" size="sm" onClick={onResume}>
            <Play aria-hidden />
            Resume
          </Button>
        )}
        {onStop && (
          <Button variant="outline" size="sm" onClick={onStop}>
            <Square aria-hidden />
            Stop
          </Button>
        )}
      </div>
    );
  }

  if (run?.state === "completed" || run?.state === "stopped") {
    return (
      <>
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          <RotateCw aria-hidden />
          Re-run investigation
        </Button>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogTitle className="text-base font-semibold text-text">Re-run the investigation?</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-text-secondary">
              All four agents run again on the same evidence. Each new agent step is added to the chain-of-custody
              ledger, and earlier entries are kept.
            </DialogDescription>
            <div className="mt-6 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="primary" onClick={onStart}>
                  Re-run
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Button variant="primary" onClick={onStart}>
      <Play aria-hidden />
      Start investigation
    </Button>
  );
}
