import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { AgentName } from "./types";

export type WorkspaceView = "map" | "plan" | "findings" | "responses" | "shield";

export interface CaseFocus {
  view: WorkspaceView;
  entityId: string | null;
  edgeId: string | null;
  findingId: string | null;
  eventId: string | null;
  taskId: string | null;
  step: number | null;
  agent: AgentName | null;
  tactic: string | null;
}

const VALID_VIEWS = new Set<WorkspaceView>(["map", "plan", "findings", "responses", "shield"]);
const VALID_AGENTS = new Set<AgentName>(["triage", "investigator", "verifier", "reporter"]);

/**
 * URL-synced focus state for the Case Workspace and cross-view links.
 * Preserves selected entity, finding, event, task, or story step across tabs.
 */
export function useCaseFocus() {
  const [searchParams, setSearchParams] = useSearchParams();

  const focus = useMemo<CaseFocus>(() => {
    const rawView = searchParams.get("view") as WorkspaceView | null;
    const view: WorkspaceView = rawView && VALID_VIEWS.has(rawView) ? rawView : "map";
    const rawAgent = searchParams.get("agent") as AgentName | null;
    const agent = rawAgent && VALID_AGENTS.has(rawAgent) ? rawAgent : null;
    const rawStep = searchParams.get("step");
    const parsedStep = rawStep ? Number(rawStep) : NaN;
    return {
      view,
      entityId: searchParams.get("entity") || null,
      edgeId: searchParams.get("edge") || null,
      findingId: searchParams.get("finding") || null,
      eventId: searchParams.get("event") || null,
      taskId: searchParams.get("task") || null,
      step: Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : null,
      agent,
      tactic: searchParams.get("tactic") || null,
    };
  }, [searchParams]);

  const updateFocus = useCallback(
    (patch: Partial<CaseFocus>, replace = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const apply = (key: string, val: string | number | null | undefined) => {
            if (val === undefined) return;
            if (val === null || val === "") next.delete(key);
            else next.set(key, String(val));
          };
          if (patch.view !== undefined) {
            if (patch.view === "map") next.delete("view");
            else next.set("view", patch.view);
          }
          apply("entity", patch.entityId);
          apply("edge", patch.edgeId);
          apply("finding", patch.findingId);
          apply("event", patch.eventId);
          apply("task", patch.taskId);
          apply("step", patch.step);
          apply("agent", patch.agent);
          apply("tactic", patch.tactic);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const clearSelection = useCallback(() => {
    updateFocus({
      entityId: null,
      edgeId: null,
      findingId: null,
      eventId: null,
      taskId: null,
      step: null,
      tactic: null,
    });
  }, [updateFocus]);

  return { focus, updateFocus, clearSelection };
}

