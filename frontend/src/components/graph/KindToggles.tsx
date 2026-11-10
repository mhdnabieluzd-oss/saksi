import { Eye, EyeOff } from "lucide-react";
import type { GraphNode, NodeKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KIND_META, KIND_ORDER } from "./meta";

interface KindTogglesProps {
  nodes: readonly GraphNode[];
  hidden: ReadonlySet<NodeKind>;
  onChange: (next: ReadonlySet<NodeKind>) => void;
  /** Wrap in a row for the graph toolbar instead of a column for the side panel. */
  inline?: boolean;
}

/** One toggle per entity kind with its count. Hidden kinds are struck through and show an EyeOff icon. */
export function KindToggles({ nodes, hidden, onChange, inline = false }: KindTogglesProps) {
  function toggle(kind: NodeKind) {
    const next = new Set(hidden);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    onChange(next);
  }

  return (
    <ul
      aria-label="Entity kinds"
      className={cn(inline ? "flex flex-wrap gap-1.5" : "space-y-1")}
    >
      {KIND_ORDER.map((kind) => {
        const { label, Icon } = KIND_META[kind];
        const shown = !hidden.has(kind);
        const count = nodes.filter((node) => node.kind === kind).length;
        return (
          <li key={kind}>
            <button
              type="button"
              aria-pressed={shown}
              onClick={() => toggle(kind)}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-sm border px-2 text-left text-xs transition-colors",
                inline ? "" : "w-full",
                shown
                  ? "border-border text-text hover:border-text-muted"
                  : "border-transparent text-text-muted line-through hover:text-text-secondary",
              )}
            >
              <Icon aria-hidden className="size-3.5 shrink-0" />
              <span className={inline ? undefined : "flex-1"}>{label}</span>
              <span className="font-mono tabular-nums">{count}</span>
              {shown ? (
                <Eye aria-hidden className="size-3.5 shrink-0 text-cyan" />
              ) : (
                <EyeOff aria-hidden className="size-3.5 shrink-0" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
