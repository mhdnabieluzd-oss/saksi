import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-text transition-colors placeholder:text-text-muted hover:border-text-muted focus:border-cyan disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
