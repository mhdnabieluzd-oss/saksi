// Multi-Agent Operator Desk — 4 agent identity cards for the War Room right column.
import { ScanSearch, Microscope, BadgeCheck, FileText, Pause, ChevronRight } from "lucide-react";

type AgentState = "idle" | "running" | "awaiting" | "blocked" | "done";
type Agent = {
  key: "triage" | "investigator" | "verifier" | "reporter";
  name: string;
  state: AgentState;
  task?: string;            // current step sentence
  caseId?: string;          // "CASE-2315"
  stepId?: string;          // "S-07"
  throughput: string;       // "42 signals/h"
  lastAt: string;           // "14:32:07 MYT"
};

const IDENTITY = {
  triage:       { Icon: ScanSearch, hue: "text-tac-pre" },
  investigator: { Icon: Microscope, hue: "text-tac-spread" },
  verifier:     { Icon: BadgeCheck, hue: "text-brand" },
  reporter:     { Icon: FileText,   hue: "text-fg-muted" },
} as const;

const STATE = {
  idle:     { label: "Idle",             dot: "bg-state-idle animate-idle-pulse", text: "text-fg-subtle",       card: "" },
  running:  { label: "Working",          dot: "bg-state-running",                 text: "text-state-running",   card: "shadow-glow-accent" },
  awaiting: { label: "Awaiting analyst", dot: "bg-state-awaiting",                text: "text-state-awaiting",  card: "shadow-glow-awaiting animate-await-pulse" },
  blocked:  { label: "Policy-blocked",   dot: "bg-state-blocked",                 text: "text-state-blocked",   card: "shadow-glow-blocked" },
  done:     { label: "Idle · last run OK", dot: "bg-state-verified",              text: "text-state-verified",  card: "" },
} as const;

function Avatar({ agent }: { agent: Agent }) {
  const { Icon, hue } = IDENTITY[agent.key];
  const running = agent.state === "running";
  return (
    <div className="relative grid size-10 shrink-0 place-items-center">
      {running && (
        <span
          data-motion="loop"
          aria-hidden
          className="absolute inset-0 animate-agent-spin rounded-full"
          style={{
            background: "conic-gradient(from 0deg, transparent 0 65%, var(--color-accent) 100%)",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
          }}
        />
      )}
      <span className={`grid size-9 place-items-center rounded-full bg-inset ring-1 ring-inset ${running ? "ring-accent/30" : "ring-line"}`}>
        <Icon className={`size-4 ${hue}`} aria-hidden />
      </span>
    </div>
  );
}

export function AgentCard({ agent, onOpen }: { agent: Agent; onOpen?: (a: Agent) => void }) {
  const s = STATE[agent.state];
  return (
    <button
      type="button"
      onClick={() => onOpen?.(agent)}
      className={[
        "group w-full rounded-md border border-line bg-card p-3 text-left shadow-card",
        "transition-[border-color,box-shadow] duration-150 hover:border-line-strong",
        s.card,
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <Avatar agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-fg">{agent.name}</span>
            <span className={`ml-auto inline-flex items-center gap-1.5 text-2xs font-medium ${s.text}`}>
              <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
              {s.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-fg-muted" title={agent.task}>
            {agent.task ?? "Waiting for signals"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line-faint pt-2">
        {agent.caseId && <span className="font-data text-2xs text-accent">{agent.caseId}{agent.stepId && ` · ${agent.stepId}`}</span>}
        <span className="font-data text-2xs text-fg-subtle">{agent.throughput}</span>
        <span className="ml-auto font-data text-2xs text-fg-subtle">{agent.lastAt}</span>
        {agent.state === "running"
          ? <Pause className="size-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-label="Pause agent" />
          : <ChevronRight className="size-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </div>
    </button>
  );
}

export function AgentOperatorDesk({ agents, onOpen }: { agents: Agent[]; onOpen?: (a: Agent) => void }) {
  const active = agents.filter((a) => a.state === "running").length;
  const waiting = agents.filter((a) => a.state === "awaiting").length;
  return (
    <section aria-labelledby="desk-title" className="rounded-lg border border-line bg-surface p-3">
      <header className="mb-3 flex items-center gap-2">
        <h2 id="desk-title" className="label-caps">Operator desk</h2>
        <span className="ml-auto font-data text-2xs text-fg-muted">{active} working</span>
        {waiting > 0 && (
          <span className="rounded-xs bg-state-awaiting/10 px-1.5 py-0.5 text-2xs font-medium text-state-awaiting ring-1 ring-inset ring-state-awaiting/35">
            {waiting} need you
          </span>
        )}
      </header>
      <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
        {agents.map((a) => <AgentCard key={a.key} agent={a} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

export default AgentOperatorDesk;
