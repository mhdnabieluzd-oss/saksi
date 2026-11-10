import { useState } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { Tooltip } from "./tooltip";

/**
 * Monospace identifier (event ID, hash, path, IP) with copy and truncate/expand.
 * The full value is always in the DOM for screen readers and tests.
 */
export function TechnicalValue({
  value,
  label,
  maxChars = 24,
  copy = true,
  className,
}: {
  value: string;
  /** Accessible name for the copy action, e.g. "Copy payload hash". */
  label?: string;
  /** Visual truncation threshold in characters (middle ellipsis). */
  maxChars?: number;
  copy?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncatable = value.length > maxChars;
  const shown =
    truncatable && !expanded
      ? `${value.slice(0, Math.ceil((maxChars - 1) * 0.6))}…${value.slice(-Math.floor((maxChars - 1) * 0.4))}`
      : value;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 font-mono text-technical text-text", className)}>
      <Tooltip content={<span className="font-mono break-all">{value}</span>}>
        <span tabIndex={0} className={cn("rounded-sm", expanded ? "break-all" : "truncate")} data-technical-value>
          <span aria-hidden={truncatable && !expanded}>{shown}</span>
          {truncatable && !expanded && <span className="sr-only">{value}</span>}
        </span>
      </Tooltip>
      {truncatable && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse value" : "Expand full value"}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-muted hover:bg-panel-hover hover:text-text"
        >
          <ChevronsLeftRight aria-hidden className="size-3.5" />
        </button>
      )}
      {copy && <CopyButton value={value} label={label ?? "Copy value"} />}
    </span>
  );
}
