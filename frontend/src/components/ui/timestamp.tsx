import { formatTs, formatTsUtc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

/** Malaysia time on screen, UTC in the tooltip. */
export function Timestamp({ iso, className }: { iso: string; className?: string }) {
  return (
    <Tooltip content={formatTsUtc(iso)}>
      <time
        dateTime={iso}
        tabIndex={0}
        className={cn("rounded-sm font-mono text-xs whitespace-nowrap text-text-secondary tabular-nums", className)}
      >
        {formatTs(iso)}
      </time>
    </Tooltip>
  );
}
