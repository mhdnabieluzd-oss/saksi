import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AgentEvent, AgentName, AgentStatus, RunStatus, WsMessage } from "./types";
import { invalidateCase } from "./queries";

export type StreamLinkPhase = "connecting" | "live" | "reconnecting";

export interface CaseStreamState {
  connected: boolean;
  link: StreamLinkPhase;
  lastEventAt: string | null;
  run: RunStatus | null;
  agents: Record<AgentName, AgentStatus>;
  events: AgentEvent[];
}

const idleAgent = (name: AgentName): AgentStatus => ({
  name,
  state: "idle",
  current_task: "",
  progress: 0,
  started_at: null,
  finished_at: null,
  output_summary: "",
});

const initialState = (): CaseStreamState => ({
  connected: false,
  link: "connecting",
  lastEventAt: null,
  run: null,
  agents: {
    triage: idleAgent("triage"),
    investigator: idleAgent("investigator"),
    verifier: idleAgent("verifier"),
    reporter: idleAgent("reporter"),
  },
  events: [],
});

// Returned while no stream has produced state for the requested case yet.
const EMPTY_STATE: CaseStreamState = initialState();

const MAX_RECONNECT_DELAY_MS = 15_000;

function parseMessage(raw: unknown): WsMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && "type" in parsed ? (parsed as WsMessage) : null;
  } catch {
    return null;
  }
}

interface StoreEntry {
  caseId: string;
  state: CaseStreamState;
}

/**
 * Live state for one case from /ws/cases/{caseId}. Events are de-duplicated by seq,
 * the socket reconnects with capped backoff, and case queries are invalidated when a run ends.
 */
export function useCaseStream(caseId: string | undefined): CaseStreamState {
  const queryClient = useQueryClient();
  const [store, setStore] = useState<StoreEntry | null>(null);

  useEffect(() => {
    if (!caseId) return;
    const id = caseId;
    let socket: WebSocket | null = null;
    let timer: number | undefined;
    let attempt = 0;
    let disposed = false;
    const seenSeq = new Set<number>();

    const update = (change: (state: CaseStreamState) => CaseStreamState) => {
      setStore((prev) => {
        const base = prev && prev.caseId === id ? prev.state : initialState();
        return { caseId: id, state: change(base) };
      });
    };

    const handle = (msg: WsMessage) => {
      if (msg.type === "agent_event") {
        if (seenSeq.has(msg.data.seq)) return;
        seenSeq.add(msg.data.seq);
        update((s) => ({
          ...s,
          lastEventAt: msg.data.ts,
          events: [...s.events, msg.data].sort((a, b) => a.seq - b.seq),
        }));
      } else if (msg.type === "agent_status") {
        update((s) => ({ ...s, agents: { ...s.agents, [msg.data.name]: msg.data } }));
      } else if (msg.type === "run_status") {
        const agents = { ...initialState().agents };
        for (const agent of msg.data.agents) agents[agent.name] = agent;
        update((s) => ({ ...s, run: msg.data, agents }));
        if (msg.data.state === "completed" || msg.data.state === "failed" || msg.data.state === "stopped") {
          void invalidateCase(queryClient, id);
        }
      }
    };

    let everOpened = false;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/cases/${encodeURIComponent(id)}`);
      socket.onopen = () => {
        attempt = 0;
        everOpened = true;
        update((s) => ({ ...s, connected: true, link: "live" }));
      };
      socket.onmessage = (event: MessageEvent<unknown>) => {
        const msg = parseMessage(event.data);
        if (msg) handle(msg);
      };
      socket.onclose = () => {
        socket = null;
        update((s) => ({
          ...s,
          connected: false,
          link: everOpened ? "reconnecting" : "connecting",
        }));
        if (disposed) return;
        const delay = Math.min(1_000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
        attempt += 1;
        timer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [caseId, queryClient]);

  return caseId && store?.caseId === caseId ? store.state : EMPTY_STATE;
}
