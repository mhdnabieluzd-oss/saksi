import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { caseStatusMeta } from "@/components/investigations/caseStatus";
import { formatTs } from "@/lib/format";
import type { CaseDetail, ChatMessage } from "@/lib/types";
import { SUGGESTED_QUESTIONS } from "./suggestions";

interface ContextPanelProps {
  detail: CaseDetail;
  questions: ChatMessage[];
  disabled: boolean;
  onJump: (messageId: string) => void;
  onAsk: (question: string) => void;
}

export function ContextPanel({ detail, questions, disabled, onJump, onAsk }: ContextPanelProps) {
  const { summary, stats } = detail;
  return (
    <div className="flex flex-col gap-4">
      <Card title="Investigation context">
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-text-secondary">Case</dt>
            <dd className="mt-0.5 font-medium text-text">{summary.title}</dd>
            <dd className="mt-0.5 font-mono text-xs text-cyan">{summary.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Status</dt>
            <dd className="mt-1">
              <StatusBadge meta={caseStatusMeta(summary.status)} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Verified findings</dt>
            <dd className="mt-0.5 text-text tabular-nums">
              {summary.verified_count} of {summary.finding_count}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Time range</dt>
            <dd className="mt-0.5 font-mono text-xs text-text">
              {stats.time_start && stats.time_end
                ? `${formatTs(stats.time_start)} to ${formatTs(stats.time_end)}`
                : "No timestamps"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Previous questions">
        {questions.length === 0 ? (
          <p className="text-sm text-text-secondary">Questions you ask in this case will be listed here.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {questions.map((question) => (
              <li key={question.id}>
                <button
                  type="button"
                  onClick={() => onJump(question.id)}
                  className="w-full truncate rounded-sm px-2 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text max-md:min-h-11"
                  title={question.content}
                >
                  {question.content}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Suggested questions">
        <ul className="flex flex-col gap-2">
          {SUGGESTED_QUESTIONS.map((question) => (
            <li key={question}>
              <Button
                variant="outline"
                size="sm"
                className="h-auto w-full justify-start py-2 text-left whitespace-normal"
                disabled={disabled}
                onClick={() => onAsk(question)}
              >
                {question}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
