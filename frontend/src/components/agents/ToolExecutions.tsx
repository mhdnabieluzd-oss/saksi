import { Ban, ShieldCheck, Wrench } from "lucide-react";
import type { AgentEvent, AgentName } from "@/lib/types";
import { formatTs } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGENT_INFO } from "./meta";

interface ToolExecution {
  call: AgentEvent;
  result: AgentEvent | null;
  blocked: boolean;
}

/** Pairs each tool_call (and blocked tool warning) with the next tool_result from the same agent. */
function pairToolExecutions(events: AgentEvent[]): ToolExecution[] {
  const rows: ToolExecution[] = [];
  const open = new Map<AgentName, ToolExecution>();
  for (const event of events) {
    if (event.kind === "tool_call") {
      const row: ToolExecution = { call: event, result: null, blocked: false };
      rows.push(row);
      open.set(event.agent, row);
    } else if (event.kind === "tool_result") {
      const row = open.get(event.agent);
      if (row) {
        row.result = event;
        open.delete(event.agent);
      }
    } else if (
      (event.kind === "warning" || event.kind === "error") &&
      (event.code === "TOOL_BLOCKED" || event.message.toLowerCase().includes("blocked"))
    ) {
      rows.push({ call: event, result: event, blocked: true });
    }
  }
  return rows;
}

function summarizeArgs(args: Record<string, unknown> | null): string {
  if (!args || Object.keys(args).length === 0) return "No arguments";
  const text = JSON.stringify(args);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function ToolExecutions({ events }: { events: AgentEvent[] }) {
  const rows = pairToolExecutions(events);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="No tool calls yet"
        description="Each tool an agent calls, with its arguments, policy gate decision, and the result it returned, is listed here."
      />
    );
  }
  return (
    <Table label="Tool executions" className="min-w-[50rem]">
      <TableHeader>
        <tr>
          <TableHead>Time</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Tool</TableHead>
          <TableHead>Policy Decision</TableHead>
          <TableHead>Arguments (scrubbed)</TableHead>
          <TableHead>Result</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {rows.map(({ call, result, blocked }) => (
          <TableRow key={call.seq}>
            <TableCell className="font-mono text-xs whitespace-nowrap text-text-secondary">
              <time dateTime={call.ts}>{formatTs(call.ts)}</time>
            </TableCell>
            <TableCell>{AGENT_INFO[call.agent].short}</TableCell>
            <TableCell>
              <Badge mono>{call.tool ?? "unknown"}</Badge>
            </TableCell>
            <TableCell>
              {blocked ? (
                <Badge tone="red">
                  <Ban className="size-3" />
                  Blocked by policy
                </Badge>
              ) : (
                <Badge tone="green">
                  <ShieldCheck className="size-3" />
                  Allowed within policy
                </Badge>
              )}
            </TableCell>
            <TableCell className="max-w-xs">
              <code className="font-mono text-xs break-all text-text-secondary">{summarizeArgs(call.args)}</code>
            </TableCell>
            <TableCell className="text-text-secondary">{result ? result.message : "Running..."}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
