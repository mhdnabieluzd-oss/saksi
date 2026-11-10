import { CircleAlert, RotateCw } from "lucide-react";
import { Button } from "./button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-md border border-red/30 bg-red/5 p-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-red">
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        {title}
      </div>
      <p className="text-sm text-text-secondary">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          Retry
        </Button>
      )}
    </div>
  );
}
