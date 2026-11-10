import { useId, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_MAX_LENGTH } from "./suggestions";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (question: string) => void;
  disabled: boolean;
}

export function Composer({ value, onChange, onSubmit, disabled }: ComposerProps) {
  const inputId = useId();
  const hintId = useId();
  const canSend = !disabled && value.trim() !== "";

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSubmit(value);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit(value);
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        Ask SAKSI
      </label>
      <Textarea
        id={inputId}
        value={value}
        maxLength={QUESTION_MAX_LENGTH}
        rows={2}
        disabled={disabled}
        aria-describedby={hintId}
        placeholder="Ask about this investigation"
        className="min-h-14"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={hintId} className="text-xs text-text-muted tabular-nums">
          {value.length}/{QUESTION_MAX_LENGTH} · Enter sends, Shift+Enter adds a line
        </p>
        <Button type="submit" variant="primary" disabled={!canSend}>
          <Send aria-hidden />
          Send
        </Button>
      </div>
    </form>
  );
}
