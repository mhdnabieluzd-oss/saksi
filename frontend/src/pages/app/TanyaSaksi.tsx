import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AgentAvatar } from "@/components/agents/identity";
import { ContextPanel } from "@/components/chat/ContextPanel";
import { Composer } from "@/components/chat/Composer";
import { EvidencePanel } from "@/components/chat/EvidencePanel";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { SUGGESTED_QUESTIONS } from "@/components/chat/suggestions";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useCase, useChat, useSendChat } from "@/lib/queries";

export default function TanyaSaksi() {
  const { caseId = "" } = useParams();
  const detail = useCase(caseId);
  const chat = useChat(caseId);
  const send = useSendChat(caseId);
  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const ready = detail.data?.summary.status === "completed";
  const messages = chat.data ?? [];
  const messageCount = messages.length;
  const questions = messages.filter((message) => message.role === "user");
  const latestAnswer = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const selected = messages.find((message) => message.id === selectedId && message.role === "assistant") ?? latestAnswer;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount, send.isPending]);

  function ask(question: string) {
    const text = question.trim();
    if (!text || !ready || send.isPending) return;
    send.mutate(text, {
      onSuccess: () => setDraft((current) => (current.trim() === text ? "" : current)),
    });
  }

  function jumpTo(messageId: string) {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: "start" });
  }

  const crumbs = [
    { label: "Command Centre", to: "/app" },
    { label: "Investigations", to: "/app/investigations" },
    { label: detail.data?.summary.title ?? caseId, to: `/app/cases/${caseId}` },
    { label: "Tanya SAKSI" },
  ];

  if (detail.isError) {
    return (
      <>
        <PageHeader title="Tanya SAKSI" breadcrumbs={crumbs} />
        <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />
      </>
    );
  }

  if (!detail.data) {
    return (
      <>
        <PageHeader title="Tanya SAKSI" breadcrumbs={crumbs} />
        <div aria-busy="true" className="grid gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-96" />
        </div>
      </>
    );
  }

  const caseDetail = detail.data;

  if (!ready) {
    return (
      <>
        <PageHeader title="Tanya SAKSI" breadcrumbs={crumbs} />
        <EmptyState
          title="SAKSI needs a completed run"
          description="Run the investigation first so SAKSI has findings to ground its answers."
          action={
            <Button asChild variant="secondary">
              <Link to={`/app/cases/${caseId}/agents`}>Go to agent operations</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Tanya SAKSI"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <AgentAvatar role="tanya" state={send.isPending ? "working" : "idle"} size={24} />
            <span>
              Ask questions in Bahasa Melayu or English. Every answer cites verified log events.
            </span>
          </span>
        }
        breadcrumbs={crumbs}
      />

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <ContextPanel
          detail={caseDetail}
          questions={questions}
          disabled={send.isPending}
          onJump={jumpTo}
          onAsk={ask}
        />

        <section aria-label="Conversation" className="flex min-w-0 flex-col gap-4">
          <div
            role="log"
            aria-live="polite"
            aria-label="Conversation with SAKSI"
            className="flex max-h-[60vh] min-h-80 flex-col gap-4 overflow-y-auto rounded-md border border-border bg-bg p-4"
          >
            {chat.isError ? (
              <ErrorState message={chat.error.message} onRetry={() => void chat.refetch()} />
            ) : chat.isPending ? (
              <Skeleton className="h-24" />
            ) : messages.length === 0 && !send.isPending ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-text-secondary">Ask a question or pick a suggestion to start.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <Button
                      key={question}
                      variant="outline"
                      size="sm"
                      className="h-auto py-2 text-left whitespace-normal"
                      onClick={() => ask(question)}
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  caseId={caseId}
                  message={message}
                  selected={selected?.id === message.id}
                  onSelect={setSelectedId}
                />
              ))
            )}

            {send.isPending && (
              <>
                <div className="ml-auto max-w-[85%] rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm whitespace-pre-wrap text-text">
                  {send.variables}
                </div>
                <Spinner label="Tanya SAKSI is checking the evidence..." />
              </>
            )}

            {send.isError && (
              <ErrorState
                title="SAKSI could not answer"
                message={`${send.error.message}. Your question is still in the box below.`}
                onRetry={() => {
                  if (send.variables) ask(send.variables);
                }}
              />
            )}

            <div ref={endRef} />
          </div>

          <Composer value={draft} onChange={setDraft} onSubmit={ask} disabled={send.isPending} />
        </section>

        <EvidencePanel caseId={caseId} message={selected} />
      </div>
    </>
  );
}
