import type { ComponentProps } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

const PANEL_VARIANTS = {
  center:
    "top-1/2 left-1/2 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-md border p-6",
  right: "inset-y-0 right-0 flex h-dvh w-full max-w-xl flex-col border-l",
  left: "inset-y-0 left-0 flex h-dvh w-[min(85vw,20rem)] flex-col border-r",
} as const;

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  variant?: keyof typeof PANEL_VARIANTS;
}

/** Modal panel. `variant="right"` gives the contextual drawer, `left` the mobile navigation. */
export function DialogContent({ variant = "center", className, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 border-border bg-surface text-text shadow-[0_12px_32px_rgb(0_0_0/0.45)]",
          PANEL_VARIANTS[variant],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text max-md:size-11"
        >
          <X aria-hidden className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
