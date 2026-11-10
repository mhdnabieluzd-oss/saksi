import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./button";

/** Copies a value to the clipboard and confirms in text, not colour alone. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={label} onClick={() => void copy()}>
      {copied ? <Check aria-hidden className="text-green" /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}
