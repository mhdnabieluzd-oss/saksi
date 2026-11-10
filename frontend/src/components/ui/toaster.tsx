import { Toaster as SonnerToaster } from "sonner";

/** Mount once in App. Call toast.success / toast.error from "sonner" anywhere. */
export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "border border-border bg-surface-elevated text-text font-sans",
          description: "text-text-secondary",
        },
      }}
    />
  );
}
