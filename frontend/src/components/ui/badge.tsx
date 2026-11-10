import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { StatusMeta } from "@/lib/format";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-elevated text-text-secondary",
        green: "border-green/30 bg-green/10 text-green",
        cyan: "border-cyan/30 bg-cyan/10 text-cyan",
        amber: "border-amber/30 bg-amber/10 text-amber",
        red: "border-red/30 bg-red/10 text-red",
        muted: "border-border bg-transparent text-text-muted",
      },
      mono: {
        true: "font-mono",
        false: "",
      },
    },
    defaultVariants: { tone: "neutral", mono: false },
  },
);

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, mono, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, mono }), className)} {...props} />;
}

/** Icon plus text label, coloured from format.ts meta. Status is never colour-only. */
export function StatusBadge({ meta, className }: { meta: StatusMeta; className?: string }) {
  const { Icon, label } = meta;
  return (
    <span className={cn(badgeVariants({ tone: "neutral" }), meta.className, className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}
