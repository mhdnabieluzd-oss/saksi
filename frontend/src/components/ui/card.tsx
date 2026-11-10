import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Panel with an optional header (title, description, actions slot) and body. */
export function Card({ title, description, actions, children, className, bodyClassName }: CardProps) {
  return (
    <section className={cn("min-w-0 rounded-md border border-border bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
