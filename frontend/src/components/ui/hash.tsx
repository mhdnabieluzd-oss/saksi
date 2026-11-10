import { shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { Tooltip } from "./tooltip";

/** Shortened SHA-256 in mono. Hover shows the full value and the copy button copies it. */
export function Hash({ value, n = 12, className }: { value: string; n?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-xs text-cyan", className)}>
      <Tooltip content={<span className="font-mono break-all">{value}</span>}>
        <span tabIndex={0} className="rounded-sm">
          {shortHash(value, n)}
          <span className="sr-only">{` full value ${value}`}</span>
        </span>
      </Tooltip>
      <CopyButton value={value} label="Copy full hash" />
    </span>
  );
}
