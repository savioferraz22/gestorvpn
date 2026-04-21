import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, Moon, Sun, LogOut, ArrowLeft, ChevronRight } from "lucide-react";
import type { AdminTab } from "../../../types";
import { NAV_ITEMS, findNavGroup } from "./nav";
import { NavIcon } from "./navIcon";
import type { ThemeMode } from "./useAdminTheme";

type Action = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
  keywords?: string;
};

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (id: AdminTab) => void;
  onBack: () => void;
  onLogout: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onBack,
  onLogout,
  theme,
  onToggleTheme,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  const actions = useMemo<Action[]>(() => {
    const navActions: Action[] = NAV_ITEMS.map((item) => {
      const group = findNavGroup(item.id);
      return {
        id: `nav:${item.id}`,
        label: item.label,
        hint: group?.label ?? "Ir para",
        keywords: `${item.label} ${item.description ?? ""} ${group?.label ?? ""}`,
        icon: <NavIcon name={item.iconName} className="h-4 w-4" />,
        run: () => {
          onNavigate(item.id);
          onClose();
        },
      };
    });
    const systemActions: Action[] = [
      {
        id: "theme:toggle",
        label: theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro",
        hint: "Aparência",
        keywords: "tema claro escuro dark light theme",
        icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
        run: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        id: "app:back",
        label: "Voltar ao app",
        hint: "Sistema",
        keywords: "voltar sair app cliente",
        icon: <ArrowLeft size={14} />,
        run: () => {
          onClose();
          onBack();
        },
      },
      {
        id: "session:logout",
        label: "Sair do Admin",
        hint: "Sistema",
        keywords: "sair logout encerrar sessao",
        icon: <LogOut size={14} />,
        run: () => {
          onClose();
          onLogout();
        },
      },
    ];
    return [...navActions, ...systemActions];
  }, [onNavigate, onClose, onBack, onLogout, theme, onToggleTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      `${a.label} ${a.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [actions, query]);

  useEffect(() => {
    if (index >= filtered.length) setIndex(0);
  }, [filtered.length, index]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[index]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-[12vh] sm:pt-[18vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-[var(--shadow-card-md)]"
          >
            <div className="flex items-center gap-2 border-b border-border-base/60 px-4 py-3">
              <Search size={16} className="text-text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                }}
                onKeyDown={handleKey}
                placeholder="Buscar páginas ou ações…"
                className="flex-1 bg-transparent text-sm text-text-base outline-none placeholder:text-text-muted"
              />
              <kbd className="rounded-md border border-border-base bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
                Esc
              </kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  Nenhum resultado para "{query}"
                </div>
              ) : (
                filtered.map((a, i) => {
                  const active = i === index;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => a.run()}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        active
                          ? "bg-primary-600/10 text-text-base"
                          : "text-text-base hover:bg-bg-surface-hover"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-surface-hover text-text-muted">
                        {a.icon}
                      </span>
                      <span className="flex-1 truncate font-medium">
                        {a.label}
                      </span>
                      {a.hint && (
                        <span className="hidden sm:inline text-[11px] uppercase tracking-wide text-text-muted">
                          {a.hint}
                        </span>
                      )}
                      <ChevronRight
                        size={14}
                        className={active ? "text-primary-500" : "text-text-muted/50"}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
