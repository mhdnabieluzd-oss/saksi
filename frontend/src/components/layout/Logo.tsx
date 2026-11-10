import { cn } from "@/lib/utils";

/** SAKSI mark: an S-shaped stroke inside a hexagon. Solid green and cyan strokes, no gradients. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("size-7 shrink-0", className)}
    >
      <path d="M16 2 28.12 9v14L16 30 3.88 23V9Z" stroke="#22C55E" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M21.5 11.5C20.5 10.2 18.8 9.5 16 9.5 12.7 9.5 11 11 11 13c0 2 1.6 2.7 5 3.5 3.6.8 5 1.8 5 4 0 2.1-1.8 3.5-5 3.5-2.8 0-4.7-1-5.5-2.5"
        stroke="#22D3EE"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-sans text-base font-semibold tracking-[0.18em] text-text", className)}>SAKSI</span>
  );
}
