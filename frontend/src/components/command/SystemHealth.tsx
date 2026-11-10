import { CircleCheck, CircleX, Cpu, Server, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";
import type { Overview } from "@/lib/types";

interface HealthRow {
  Icon: LucideIcon;
  label: string;
  detail: string;
  ok: boolean;
  status: string;
}

export function SystemHealth({ overview }: { overview: Overview }) {
  const latency = overview.llm.latency_ms === null ? "latency unknown" : `${overview.llm.latency_ms} ms`;
  const rows: HealthRow[] = [
    { Icon: Server, label: "Backend", detail: "API responding", ok: true, status: "Online" },
    {
      Icon: Cpu,
      label: "LLM",
      detail: `${overview.llm.model} · ${latency}`,
      ok: overview.llm.ok,
      status: overview.llm.ok ? "Online" : "Offline",
    },
    {
      Icon: overview.ml_dsa_ready ? ShieldCheck : ShieldX,
      label: "ML-DSA signing",
      detail: "Signs the ledger seal",
      ok: overview.ml_dsa_ready,
      status: overview.ml_dsa_ready ? "Ready" : "Not ready",
    },
  ];

  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ Icon, label, detail, ok, status }) => {
        const StatusIcon = ok ? CircleCheck : CircleX;
        return (
          <li key={label} className="flex items-start gap-3">
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-text-secondary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">{label}</p>
              <p className="truncate text-xs text-text-muted">{detail}</p>
            </div>
            <span className={`flex shrink-0 items-center gap-1 text-xs font-medium ${ok ? "text-green" : "text-red"}`}>
              <StatusIcon aria-hidden className="size-3.5" />
              {status}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
