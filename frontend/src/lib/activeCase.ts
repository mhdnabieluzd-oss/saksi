import { useSyncExternalStore } from "react";

const STORAGE_KEY = "saksi.activeCase";

type Listener = () => void;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let activeCaseId: string | null = readStored();
const listeners = new Set<Listener>();

function writeStored(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked or full: the in-memory value still works for this session.
  }
}

export function setActiveCase(id: string | null): void {
  if (id === activeCaseId) return;
  activeCaseId = id;
  writeStored(id);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveCaseId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => activeCaseId,
    () => null,
  );
}
