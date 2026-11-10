import { useCallback, useState } from "react";

/**
 * Uses `value` when it is defined (controlled), otherwise keeps its own state.
 * `onChange` is called in both modes.
 */
export function useControllableState<T>(
  value: T | undefined,
  onChange: ((next: T) => void) | undefined,
  initial: T,
): [T, (next: T) => void] {
  const [local, setLocal] = useState<T>(initial);
  const controlled = value !== undefined;
  const set = useCallback(
    (next: T) => {
      if (!controlled) setLocal(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [value !== undefined ? value : local, set];
}
