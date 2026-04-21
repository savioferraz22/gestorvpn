import React, { useState } from "react";
import {
  ArrowLeft,
  Bell,
  Menu,
  Moon,
  Search,
  Sun,
  Command as CommandIcon,
} from "lucide-react";
import type { AdminTab } from "../../../types";
import { Breadcrumbs } from "./Breadcrumbs";
import type { ThemeMode } from "./useAdminTheme";

export type TopBarBadges = {
  tickets: number;
  refunds: number;
  changes: number;
};

type TopBarProps = {
  tab: AdminTab;
  onOpenDrawer: () => void;
  onBack: () => void;
  badges: TopBarBadges;
  onNavigate: (id: AdminTab) => void;
  onOpenCommand: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export function TopBar({
  tab,
  onOpenDrawer,
  onBack,
  badges,
  onNavigate,
  onOpenCommand,
  theme,
  onToggleTheme,
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const total = badges.tickets + badges.refunds + badges.changes;
  const items = [
    { label: "Tickets abertos", count: badges.tickets, tab: "tickets" as AdminTab },
    { label: "Reembolsos aguardando", count: badges.refunds, tab: "refunds" as AdminTab },
    { label: "Alterações aguardando", count: badges.changes, tab: "change_requests" as AdminTab },
  ].filter((i) => i.count > 0);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border-base/50 bg-bg-surface/80 px-4 py-3 backdrop-blur sm:px-5">
      <button
        type="button"
        onClick={onOpenDrawer}
        className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      <div className="hidden sm:flex min-w-0 flex-1">
        <Breadcrumbs tab={tab} />
      </div>
      <div className="flex sm:hidden min-w-0 flex-1">
        <Breadcrumbs tab={tab} />
      </div>

      <button
        type="button"
        onClick={onOpenCommand}
        className="group hidden md:inline-flex h-9 items-center gap-2 rounded-xl border border-border-base/60 bg-bg-surface-hover/60 px-2.5 text-xs text-text-muted transition-colors hover:border-border-base hover:bg-bg-surface-hover hover:text-text-base"
        aria-label="Buscar"
      >
        <Search size={14} />
        <span>Buscar no painel…</span>
        <kbd className="ml-3 inline-flex items-center gap-0.5 rounded-md border border-border-base bg-bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
          <CommandIcon size={10} /> K
        </kbd>
      </button>
      <button
        type="button"
        onClick={onOpenCommand}
        className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
        aria-label="Buscar"
      >
        <Search size={16} />
      </button>

      <button
        type="button"
        onClick={onToggleTheme}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-base/60 text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
        aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      >
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-base/60 text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
          aria-label="Pendências"
        >
          <Bell size={15} />
          {total > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[9px] font-bold text-white">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </button>
        {notifOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setNotifOpen(false)}
            />
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-[var(--shadow-card-md)]">
              <div className="border-b border-border-base/60 px-4 py-3">
                <p className="text-sm font-bold text-text-base">Pendências</p>
              </div>
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="mx-auto mb-2 h-7 w-7 text-text-muted opacity-30" />
                  <p className="text-sm font-medium text-text-muted">
                    Nenhuma pendência
                  </p>
                </div>
              ) : (
                items.map((i) => (
                  <button
                    key={i.tab}
                    type="button"
                    onClick={() => {
                      onNavigate(i.tab);
                      setNotifOpen(false);
                    }}
                    className="flex w-full items-center justify-between border-b border-border-base/40 px-4 py-3 text-left transition-colors last:border-0 hover:bg-bg-surface-hover"
                  >
                    <span className="text-sm font-medium text-text-base">
                      {i.label}
                    </span>
                    <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-bold text-[var(--danger)]">
                      {i.count}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-border-base/60 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
      >
        <ArrowLeft size={13} />
        Voltar ao app
      </button>
      <button
        type="button"
        onClick={onBack}
        className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
        aria-label="Voltar ao app"
      >
        <ArrowLeft size={15} />
      </button>
    </header>
  );
}
