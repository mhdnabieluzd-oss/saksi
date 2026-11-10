import { cn } from "@/lib/utils";

/** Loading placeholder. Wrap the loading region in aria-busy="true". */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-surface-elevated", className)} />;
}
