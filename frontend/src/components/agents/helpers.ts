/** Returns `value` when it is one of `options`, otherwise `fallback`. Narrows Radix Select strings. */
export function pickOption<T extends string>(options: readonly T[], value: string, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
