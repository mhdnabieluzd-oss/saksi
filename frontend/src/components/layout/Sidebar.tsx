import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bot,
  Briefcase,
  FileSearch,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Route as RouteIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useActiveCaseId } from "@/lib/activeCase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { AnalystAvatar } from "./AnalystAvatar";
import { useAnalystName } from "./useAnalystName";
import { LogoMark, Wordmark } from "./Logo";

interface NavDef {
  label: string;
  icon: LucideIcon;
  to?: string;
  casePath?: string;
  end?: boolean;
}

interface NavGroup {
  title: string;
  items: NavDef[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { label: "Command Centre", icon: LayoutDashboard, to: "/app", end: true },
      { label: "Investigations", icon: Briefcase, to: "/app/investigations" },
    ],
  },
  {
    title: "Investigation",
    items: [
      { label: "Case Workspace", icon: Network, casePath: "", end: true },
      { label: "Agent Operations", icon: Bot, casePath: "agents" },
      { label: "Evidence Explorer", icon: FileSearch, casePath: "evidence" },
      { label: "Attack Story Replay", icon: RouteIcon, casePath: "story" },
      { label: "Tanya SAKSI", icon: MessageSquare, casePath: "ask" },
      { label: "Reports", icon: FileText, casePath: "reports" },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Tool Registry", icon: ShieldCheck, casePath: "agents?tab=registry" },
      { label: "Benchmarks", icon: BarChart3, to: "/app/benchmarks" },
      { label: "Settings", icon: SettingsIcon, to: "/app/settings" },
    ],
  },
];

const NO_CASE_HINT = "Open an investigation first";

function NavItem({
  def,
  activeCaseId,
  collapsed,
  onNavigate,
}: {
  def: NavDef;
  activeCaseId: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const Icon = def.icon;
  const scoped = def.casePath !== undefined;
  const hasCase = activeCaseId !== null;

  if (scoped && !hasCase) {
    const disabledItem = (
      <div
        aria-disabled="true"
        className={cn(
          "relative flex h-9 cursor-not-allowed items-center gap-3 rounded-md px-3 text-[13px] text-text-muted/60 select-none",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className={collapsed ? "sr-only" : "truncate"}>{def.label}</span>
      </div>
    );
    return (
      <Tooltip content={collapsed ? `${def.label} — ${NO_CASE_HINT}` : NO_CASE_HINT} side="right">
        {disabledItem}
      </Tooltip>
    );
  }

  const targetPath = scoped
    ? def.casePath
      ? `/app/cases/${encodeURIComponent(activeCaseId!)}/${def.casePath}`
      : `/app/cases/${encodeURIComponent(activeCaseId!)}`
    : (def.to ?? "/app");

  const isRegistryLink = def.casePath === "agents?tab=registry";
  const isAgentsLink = def.casePath === "agents";

  const link = (
    <NavLink
      to={targetPath}
      end={def.end}
      onClick={onNavigate}
      className={({ isActive }) => {
        let active = isActive;
        if (isRegistryLink) {
          active =
            location.pathname.endsWith("/agents") &&
            location.search.includes("tab=registry");
        } else if (isAgentsLink) {
          active =
            location.pathname.endsWith("/agents") &&
            !location.search.includes("tab=registry");
        }
        return cn(
          "relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] transition-colors",
          collapsed && "justify-center px-0",
          active
            ? "bg-surface-elevated font-medium text-cyan"
            : "text-text-secondary hover:bg-surface-elevated hover:text-text",
        );
      }}
    >
      {({ isActive }) => {
        let active = isActive;
        if (isRegistryLink) {
          active =
            location.pathname.endsWith("/agents") &&
            location.search.includes("tab=registry");
        } else if (isAgentsLink) {
          active =
            location.pathname.endsWith("/agents") &&
            !location.search.includes("tab=registry");
        }
        return (
          <>
            {active && (
              <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-cyan" />
            )}
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className={collapsed ? "sr-only" : "truncate"}>{def.label}</span>
          </>
        );
      }}
    </NavLink>
  );

  return collapsed ? (
    <Tooltip content={def.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const activeCaseId = useActiveCaseId();
  const analystName = useAnalystName();

  return (
    <>
      <div className={cn("flex h-[60px] shrink-0 items-center border-b border-border px-4", collapsed && "justify-center px-0")}>
        <Link to="/" aria-label="SAKSI home" className="flex items-center gap-2.5 rounded-sm">
          <LogoMark />
          {!collapsed && <Wordmark />}
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-0.5">
            {!collapsed && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {group.title}
              </div>
            )}
            {group.items.map((def) => (
              <NavItem
                key={def.label}
                def={def}
                activeCaseId={activeCaseId}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border p-2">
        <div
          title="Analyst identity is self-declared in Settings"
          className={cn("flex h-10 items-center gap-2.5 px-3", collapsed && "justify-center px-0")}
        >
          <AnalystAvatar />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-text">{analystName}</div>
              <div className="truncate text-[10px] text-text-muted">Self-declared analyst</div>
            </div>
          )}
          {collapsed && <span className="sr-only">{analystName}</span>}
        </div>
        {onToggleCollapsed && (
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start text-xs", collapsed && "justify-center px-0")}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && "Collapse"}
          </Button>
        )}
      </div>
    </>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileOpenChange,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <aside
        aria-label="Sidebar"
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      </aside>
      <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogContent variant="left" className="flex flex-col p-0 md:hidden">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Main navigation for SAKSI</DialogDescription>
          <SidebarContent collapsed={false} onNavigate={() => onMobileOpenChange(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
