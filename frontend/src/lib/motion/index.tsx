/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useState, type ReactNode } from "react";

const REDUCE_MOTION_KEY = "saksi.reduceMotion";
const MOTION_EVENT = "saksi:motion-pref-change";

export function getStoredReduceMotion(): boolean {
  try {
    return window.localStorage.getItem(REDUCE_MOTION_KEY) === "true";
  } catch {
    return false;
  }
}

export function setStoredReduceMotion(reduce: boolean): void {
  try {
    window.localStorage.setItem(REDUCE_MOTION_KEY, reduce ? "true" : "false");
    window.dispatchEvent(new CustomEvent(MOTION_EVENT, { detail: reduce }));
  } catch {
    // Ignore storage failures
  }
}

/**
 * Returns whether reduced motion is active, combining OS prefers-reduced-motion
 * and the user's explicit SAKSI Reduce motion setting.
 */
export function useMotionPreference() {
  const [osReduced, setOsReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [userReduced, setUserReduced] = useState<boolean>(() =>
    typeof window !== "undefined" ? getStoredReduceMotion() : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = (e: MediaQueryListEvent) => setOsReduced(e.matches);
    const onCustom = () => setUserReduced(getStoredReduceMotion());
    mq.addEventListener("change", onMq);
    window.addEventListener(MOTION_EVENT, onCustom);
    window.addEventListener("storage", onCustom);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener(MOTION_EVENT, onCustom);
      window.removeEventListener("storage", onCustom);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.reduceMotion = osReduced || userReduced ? "true" : "false";
    }
  }, [osReduced, userReduced]);

  const setReduceMotion = useCallback((next: boolean) => {
    setStoredReduceMotion(next);
    setUserReduced(next);
  }, []);

  return {
    reducedMotion: osReduced || userReduced,
    osReduced,
    userReduced,
    setReduceMotion,
  };
}

/**
 * Bounded visual-effect queue (cap 8 concurrent effects, spec §15.9).
 * Overflowing items collapse into a summary count instead of animating dozens of rows at once.
 */
export class MotionQueue {
  readonly cap: number;
  private active = new Set<string>();

  constructor(cap = 8) {
    this.cap = cap;
  }

  tryAcquire(id: string): boolean {
    if (this.active.has(id)) return true;
    if (this.active.size >= this.cap) return false;
    this.active.add(id);
    return true;
  }

  release(id: string): void {
    this.active.delete(id);
  }

  get size(): number {
    return this.active.size;
  }

  clear(): void {
    this.active.clear();
  }
}

export function LiveAnnouncer({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

export function ForensicLoadingState({
  title,
  detail,
  elapsedSeconds,
  icon,
}: {
  title: string;
  detail?: string;
  elapsedSeconds?: number;
  icon?: ReactNode;
}) {
  const { reducedMotion } = useMotionPreference();
  return (
    <div
      role="status"
      data-state="loading"
      data-motion-effect={reducedMotion ? "static" : "pulse"}
      className="flex items-center gap-3.5 rounded-lg border border-border bg-surface p-4 text-sm"
    >
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">{title}</span>
          {elapsedSeconds !== undefined && elapsedSeconds >= 3 && (
            <span className="font-mono text-xs text-text-muted">· {elapsedSeconds}s elapsed</span>
          )}
        </div>
        {detail && <p className="mt-0.5 text-xs text-text-secondary">{detail}</p>}
      </div>
    </div>
  );
}
