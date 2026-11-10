import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";

/**
 * Action-specific confirmation: states the action, its impact, and (optionally) makes the analyst
 * type a target before the confirm button enables (used for live-lab execution, WP6).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  impact,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  pending = false,
  requireText,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Consequences list or note shown above the buttons. */
  impact?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
  /** Exact text the analyst must type to enable confirm. */
  requireText?: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const blocked = pending || (requireText !== undefined && typed !== requireText);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle className="pr-8 text-h2 font-semibold text-text">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-body text-text-secondary">{description}</DialogDescription>
        {impact && (
          <div className="mt-4 rounded-md border border-border bg-panel-raised p-3 text-body-sm text-text-secondary">
            {impact}
          </div>
        )}
        {requireText !== undefined && (
          <div className="mt-4 space-y-1.5">
            <label htmlFor="confirm-dialog-text" className="text-body-sm text-text-secondary">
              Type <span className="font-mono text-text">{requireText}</span> to confirm
            </label>
            <Input
              id="confirm-dialog-text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="font-mono"
            />
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} disabled={blocked} onClick={onConfirm}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
