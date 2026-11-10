import { useState, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * Operational application frame: sidebar (240px, collapsible to 64px), 60px topbar,
 * scrollable main area and an optional 320px contextual panel on wide screens.
 */
export function AppShell({ aside, children }: { aside?: ReactNode; children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-text">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface-elevated px-3 py-2 text-sm text-text focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <main id="main" tabIndex={-1} className="relative min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
            {children ?? <Outlet />}
          </main>
          {aside && (
            <aside
              aria-label="Context"
              className="relative hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface xl:block"
            >
              {aside}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
