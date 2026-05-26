import { ChevronLeft, LogOut, Shield } from "lucide-react";
import type { AdminTab } from "../../../types";
import { NAV_GROUPS } from "./nav";
import { NavIcon } from "./navIcon";

export type SidebarBadges = Record<"tickets" | "refunds" | "changes", number>;

type SidebarProps = {
  tab: AdminTab;
  onNavigate: (id: AdminTab) => void;
  onLogout: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  badges: SidebarBadges;
  className?: string;
};

export function Sidebar({
  tab,
  onNavigate,
  onLogout,
  collapsed = false,
  onToggleCollapsed,
  badges,
  className = "",
}: SidebarProps) {
  return (
    <aside
      className={`flex h-full flex-col bg-bg-surface border-r border-border-base ${
        collapsed ? "w-[68px]" : "w-60"
      } transition-[width] duration-200 ${className}`}
    >
      <div
        className={`flex items-center gap-2 border-b border-border-base h-14 px-3 ${
          collapsed ? "justify-center" : "justify-between"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 shrink-0 text-primary-600" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-text-base leading-none">
                VS Admin
              </div>
            </div>
          )}
        </div>
        {onToggleCollapsed && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-surface-hover hover:text-text-base transition-colors"
            aria-label="Colapsar sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-4 last:mb-0">
            {!collapsed && (
              <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = tab === item.id;
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-bold transition-colors ${
                        active
                          ? "bg-bg-surface-hover text-text-base"
                          : "text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      {active && !collapsed && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary-600" />
                      )}
                      <NavIcon
                        name={item.iconName}
                        className={`h-4 w-4 shrink-0 ${
                          active ? "text-primary-600" : "text-text-muted group-hover:text-text-base"
                        }`}
                      />
                      {!collapsed && (
                        <span className="flex-1 truncate text-left">{item.label}</span>
                      )}
                      {badge > 0 && (
                        <span
                          className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none bg-danger text-white ${collapsed ? "absolute -top-0.5 -right-0.5 min-w-[16px] text-center" : ""}`}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border-base p-2">
        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? "Sair do Admin" : undefined}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger-soft ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </button>
        {onToggleCollapsed && collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="mt-1 hidden lg:flex w-full items-center justify-center rounded-md py-1.5 text-text-muted hover:bg-bg-surface-hover hover:text-text-base transition-colors"
            aria-label="Expandir sidebar"
          >
            <ChevronLeft size={14} className="rotate-180" />
          </button>
        )}
      </div>
    </aside>
  );
}
