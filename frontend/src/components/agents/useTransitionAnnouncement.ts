import { useState } from "react";

/**
 * Describes which values changed since the previous render, for an aria-live region.
 * The first render is the baseline, so mounting never announces anything.
 */
export function useTransitionAnnouncement(values: Record<string, string>): string {
  const signature = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
  const [seen, setSeen] = useState({ signature, values, message: "" });
  if (seen.signature !== signature) {
    const message = Object.entries(values)
      .filter(([key, value]) => seen.values[key] !== value)
      .map(([key, value]) => `${key}: ${value}.`)
      .join(" ");
    setSeen({ signature, values, message });
    return message;
  }
  return seen.message;
}
