import { CopyButton } from "./copy-button";
import { cn } from "@/lib/utils";

/** Monospace block. Long lines wrap, and the copy button sits in the header. */
export function CodeBlock({ code, label = "Code", className }: { code: string; label?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-bg", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-xs text-text-secondary">{label}</span>
        <CopyButton value={code} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className="max-h-96 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-text"
      >
        {code}
      </pre>
    </div>
  );
}
