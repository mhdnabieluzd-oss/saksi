import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";

export interface FilterChip {
  id: string;
  /** e.g. "Severity: High" */
  label: string;
  onRemove: () => void;
}

/**
 * Search + filter controls (children, e.g. Selects) + removable active-filter chips + Clear all.
 */
export function FilterBar({
  search,
  onSearchChange,
  searchLabel = "Search",
  searchPlaceholder = "Search",
  chips = [],
  onClearAll,
  resultCount,
  children,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  chips?: FilterChip[];
  onClearAll?: () => void;
  /** Shown as a live result count, e.g. "3 of 12". */
  resultCount?: ReactNode;
  children?: ReactNode;
}) {
  const hasActive = chips.length > 0 || Boolean(search);
  return (
    <div role="group" aria-label="Filters" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange && (
          <div className="relative w-full max-w-xs">
            <label htmlFor="filter-bar-search" className="sr-only">
              {searchLabel}
            </label>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              id="filter-bar-search"
              type="search"
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 pl-9"
            />
          </div>
        )}
        {children}
        {resultCount !== undefined && (
          <span role="status" className="ml-auto text-body-sm text-text-secondary">
            {resultCount}
          </span>
        )}
      </div>
      {(chips.length > 0 || hasActive) && (
        <ul aria-label="Active filters" className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <li key={chip.id}>
              <span className="inline-flex items-center gap-1 rounded-sm border border-accent/30 bg-accent-soft py-0.5 pr-0.5 pl-2 text-body-sm text-text">
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove filter ${chip.label}`}
                  className="inline-flex size-5 items-center justify-center rounded-sm text-text-secondary hover:bg-panel-hover hover:text-text"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            </li>
          ))}
          {onClearAll && hasActive && (
            <li>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onClearAll}>
                Clear all
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
