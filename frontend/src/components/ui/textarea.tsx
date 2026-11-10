import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text transition-colors placeholder:text-text-muted hover:border-text-muted focus:border-cyan disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
