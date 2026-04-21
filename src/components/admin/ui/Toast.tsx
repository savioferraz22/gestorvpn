import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";

type ToastTone = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
};

type ToastContextValue = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toasts: [],
      push: () => "",
      dismiss: () => {},
      success: () => "",
      error: () => "",
      info: () => "",
      warning: () => "",
    };
  }
  return ctx;
}

const TONE_CONFIG: Record<
  ToastTone,
  { icon: React.ComponentType<{ size?: number }>; cls: string }
> = {
  success: {
    icon: CheckCircle2,
    cls: "border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]",
  },
  error: {
    icon: XCircle,
    cls: "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]",
  },
  info: {
    icon: Info,
    cls: "border-[var(--info)]/30 bg-[var(--info-soft)] text-[var(--info)]",
  },
  warning: {
    icon: AlertTriangle,
    cls: "border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const toast: Toast = { duration: 4000, ...t, id };
      setToasts((prev) => [...prev, toast]);
      if ((toast.duration ?? 0) > 0) {
        const timer = setTimeout(() => dismiss(id), toast.duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const current = timers.current;
    return () => {
      current.forEach((t) => clearTimeout(t));
      current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ tone: "success", title, description }),
      error: (title, description) => push({ tone: "error", title, description }),
      info: (title, description) => push({ tone: "info", title, description }),
      warning: (title, description) => push({ tone: "warning", title, description }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pr-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { icon: Icon, cls } = TONE_CONFIG[t.tone];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto w-full max-w-sm rounded-2xl border bg-bg-surface/95 backdrop-blur shadow-[var(--shadow-card-md)] ${cls}`}
            >
              <div className="flex items-start gap-3 p-3 pr-2">
                <span className="mt-0.5 shrink-0">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text-base">
                    {t.title}
                  </div>
                  {t.description && (
                    <div className="mt-0.5 text-xs text-text-muted">
                      {t.description}
                    </div>
                  )}
                  {t.actionLabel && t.onAction && (
                    <button
                      type="button"
                      onClick={() => {
                        t.onAction?.();
                        onDismiss(t.id);
                      }}
                      className="mt-1.5 text-xs font-semibold text-primary-500 hover:underline"
                    >
                      {t.actionLabel}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(t.id)}
                  className="shrink-0 rounded-md p-1 text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
                  aria-label="Fechar"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
