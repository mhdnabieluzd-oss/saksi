import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Skeleton } from "./skeleton";
import { EmptyState, FilteredEmpty } from "./empty-state";
import { RetryPanel } from "./state-panels";

export type SortDirection = "asc" | "desc";

export interface Column<T> {
  id: string;
  header: ReactNode;
  /** Plain-text name for the sort button. Defaults to `id`. */
  headerLabel?: string;
  cell: (row: T) => ReactNode;
  /** Presence makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
  /** Tailwind width/min-width class, e.g. "w-40". */
  className?: string;
}

export type DataTableState = "loading" | "empty" | "filtered-empty" | "populated" | "error";

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  /** Table caption for assistive tech (visually hidden). */
  caption: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** True when filters are active; an empty result then shows the filtered-empty state. */
  filtered?: boolean;
  onClearFilters?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowActivate?: (row: T) => void;
  selectedKey?: string | null;
  initialSort?: { id: string; direction: SortDirection };
  /** Rows per page; omit for no pagination. */
  pageSize?: number;
  /** Row height class; default 48 px (spec: 44–56). */
  rowClassName?: string;
  className?: string;
}

function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last regardless of direction handled by caller
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Sortable, sticky-header table with loading / empty / filtered-empty / error states.
 * The wrapper carries `data-state` (test-hook contract, 05-quality-plan §2.4).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  isLoading = false,
  error = null,
  onRetry,
  filtered = false,
  onClearFilters,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  onRowActivate,
  selectedKey,
  initialSort,
  pageSize,
  rowClassName = "h-12",
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const col = sort ? columns.find((c) => c.id === sort.id) : undefined;
    if (!col?.sortValue || !sort) return rows;
    const get = col.sortValue;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((x, y) => {
      const a = get(x);
      const b = get(y);
      if (a == null || b == null) return compare(a, b); // nulls always last
      return compare(a, b) * dir;
    });
  }, [rows, sort, columns]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const visible = pageSize ? sorted.slice(safePage * pageSize, (safePage + 1) * pageSize) : sorted;

  let state: DataTableState = "populated";
  if (error && !rows) state = "error";
  else if (isLoading && !rows) state = "loading";
  else if (!rows || rows.length === 0) state = filtered ? "filtered-empty" : "empty";

  function toggleSort(id: string) {
    setPage(0);
    setSort((prev) =>
      prev?.id === id ? (prev.direction === "asc" ? { id, direction: "desc" } : null) : { id, direction: "asc" },
    );
  }

  if (state === "loading") {
    return (
      <div data-state="loading" aria-busy="true" className={cn("space-y-1", className)}>
        <p role="status" className="sr-only">
          Loading {caption}
        </p>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (state === "error") {
    return (
      <div data-state="error" className={className}>
        <RetryPanel title={`Could not load ${caption}`} message={error ?? ""} onRetry={onRetry} />
      </div>
    );
  }
  if (state === "empty") {
    return (
      <div data-state="empty" className={className}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }
  if (state === "filtered-empty") {
    return (
      <div data-state="filtered-empty" className={className}>
        <FilteredEmpty onClear={onClearFilters} />
      </div>
    );
  }

  return (
    <div data-state={error ? "partial" : "populated"} className={cn("min-w-0", className)}>
      <div className="max-h-full overflow-auto rounded-lg border border-border bg-panel">
        <table className="w-full border-collapse text-left text-body">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sort?.id === col.id ? sort.direction : null;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={active ? (active === "asc" ? "ascending" : "descending") : col.sortValue ? "none" : undefined}
                    className={cn(
                      "sticky top-0 z-10 h-9 border-b border-border bg-panel-raised px-3 text-label font-medium text-text-secondary",
                      col.align === "right" && "text-right",
                      col.className,
                    )}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        aria-label={`Sort by ${col.headerLabel ?? col.id}`}
                        className="inline-flex items-center gap-1 rounded-sm hover:text-text"
                      >
                        {col.header}
                        {active === "asc" ? (
                          <ArrowUp aria-hidden className="size-3" />
                        ) : active === "desc" ? (
                          <ArrowDown aria-hidden className="size-3" />
                        ) : (
                          <ChevronsUpDown aria-hidden className="size-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              const selected = selectedKey === key;
              return (
                <tr
                  key={key}
                  data-row-key={key}
                  aria-selected={selectedKey !== undefined ? selected : undefined}
                  onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                  className={cn(
                    "border-b border-border/60 last:border-b-0",
                    rowClassName,
                    onRowActivate && "cursor-pointer hover:bg-panel-hover",
                    selected && "bg-accent-soft/60",
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.id} className={cn("px-3 align-middle", col.align === "right" && "text-right", col.className)}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageSize && pageCount > 1 && (
        <div className="mt-2 flex items-center justify-between text-body-sm text-text-secondary">
          <span data-volatile>
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="ghost" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
              Next
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
