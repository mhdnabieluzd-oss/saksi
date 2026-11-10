import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right-hand detail drawer. Non-modal by default so the graph/table behind it stays interactive
 * ("details without losing context"); Esc and the close button dismiss it, outside clicks do not.
 * Focus moves into the drawer only because the user opened it (callers open it on explicit action).
 */
export function SideDrawer({
  open,
  onOpenChange,
  title,
  description,
  modal = false,
  width = "max-w-md",
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  modal?: boolean;
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogPrimitive.Portal>
        {modal && <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50" />}
        <DialogPrimitive.Content
          data-testid="side-drawer"
          onInteractOutside={(event) => event.preventDefault()}
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "animate-drawer-in fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col border-l border-border bg-panel text-text shadow-[-12px_0_32px_rgb(0_0_0/0.35)]",
            width,
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-h2 font-semibold text-text">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-body-sm text-text-secondary">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-panel-hover hover:text-text max-md:size-11"
            >
              <X aria-hidden className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="shrink-0 border-t border-border px-5 py-3">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
