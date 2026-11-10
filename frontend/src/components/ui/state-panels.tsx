import type { ReactNode } from "react";
import { CircleAlert, Clock, RotateCw, TriangleAlert } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { Button } from "./button";

/** Single-line error inside a panel or form row. */
export function InlineError({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <p role="alert" data-state="error" className="flex items-start gap-1.5 text-body-sm text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {message}
        {children}
      </span>
    </p>
  );
}

/** Region-level failure with a retry action and useful detail for analysts. */
export function RetryPanel({
  title = "Something went wrong",
  message,
  detail,
  onRetry,
  retryLabel = "Retry",
}: {
  title?: string;
  message: string;
  /** Technical detail (status code, endpoint). Shown in mono. */
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div role="alert" data-state="error" className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft/40 p-4">
      <div className="flex items-center gap-2 text-h3 font-medium text-danger">
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        {title}
      </div>
      {message && <p className="text-body text-text-secondary">{message}</p>}
      {detail && <p className="font-mono text-technical text-text-muted break-all">{detail}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Shown above retained data when it may be out of date (disconnected, refetch failed, partial source).
 * `updatedAt` is an ISO timestamp or epoch ms of the last good update.
 */
export function StaleBanner({
  updatedAt,
  reason = "Live updates are paused.",
  onRetry,
  tone = "stale",
}: {
  updatedAt?: string | number | null;
  reason?: string;
  onRetry?: () => void;
  tone?: "stale" | "partial";
}) {
  const iso = updatedAt == null ? null : typeof updatedAt === "number" ? new Date(updatedAt).toISOString() : updatedAt;
  const Icon = tone === "partial" ? TriangleAlert : Clock;
  return (
    <div
      role="status"
      data-state={tone}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-body-sm text-text"
    >
      <Icon aria-hidden className="size-4 shrink-0 text-warning" />
      <span>
        {reason}
        {iso && (
          <>
            {" "}
            <span data-volatile className="text-text-secondary">
              Last updated {formatRelative(iso)}.
            </span>
          </>
        )}
      </span>
      {onRetry && (
        <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
