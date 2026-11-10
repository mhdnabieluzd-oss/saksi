import { useEffect, useState } from "react";

/** Milliseconds between two ISO timestamps. An interval that has not ended is measured to `now`. */
export function durationMs(start: string | null, end: string | null, now: number): number | null {
  if (!start) return null;
  const from = Date.parse(start);
  const to = end ? Date.parse(end) : now;
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, to - from);
}

/** Compact Malaysia time for narrow cells, e.g. "08 Nov 08:49:49". The full value goes in a title attribute. */
export function formatShortTs(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1_000) return `${ms} ms`;
  const seconds = ms / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

/** Current time, refreshed every second while `active`, so running intervals keep counting. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}
