import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Scrollable, keyboard-focusable table region. `label` names the region for screen readers. */
export function Table({
  label,
  className,
  children,
  ...props
}: ComponentProps<"table"> & { label: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="w-full overflow-x-auto rounded-md border border-border">
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-surface-elevated", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-surface-elevated/60", className)} {...props} />;
}

export function TableHead({ className, scope = "col", ...props }: ComponentProps<"th">) {
  return (
    <th
      scope={scope}
      className={cn(
        "border-b border-border px-3 py-2 text-xs font-medium tracking-wide text-text-secondary uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-3 py-2.5 align-middle text-text", className)} {...props} />;
}
