import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-text-secondary">
      <LoaderCircle aria-hidden className={cn("size-4 animate-spin text-cyan", className)} />
      <span>{label}</span>
    </span>
  );
}
