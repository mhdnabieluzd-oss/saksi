import type { ReactNode } from "react";
import { SearchX, type LucideIcon } from "lucide-react";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Nothing exists yet. Carries data-state="empty" for the test-hook contract. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      data-state="empty"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center"
    >
      {Icon && <Icon aria-hidden className="size-8 text-text-muted" />}
      <p className="text-h3 font-medium text-text">{title}</p>
      {description && <p className="max-w-sm text-body text-text-secondary">{description}</p>}
      {action}
    </div>
  );
}

/** Data exists, but the active filters hide all of it. Distinct from EmptyState. */
export function FilteredEmpty({
  title = "No results match these filters",
  description = "Try removing a filter or broadening the search.",
  onClear,
}: {
  title?: string;
  description?: string;
  onClear?: () => void;
}) {
  return (
    <div
      data-state="filtered-empty"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center"
    >
      <SearchX aria-hidden className="size-8 text-text-muted" />
      <p className="text-h3 font-medium text-text">{title}</p>
      <p className="max-w-sm text-body text-text-secondary">{description}</p>
      {onClear && (
        <Button variant="secondary" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
