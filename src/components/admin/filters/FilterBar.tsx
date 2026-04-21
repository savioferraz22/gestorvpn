import type { ReactNode } from "react";
import { RotateCcw, X } from "lucide-react";

export type ActiveChip = {
  id: string;
  label: string;
  onRemove?: () => void;
};

type FilterBarProps = {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  chips?: ActiveChip[];
  onReset?: () => void;
  total?: number;
  filtered?: number;
};

export function FilterBar({
  search,
  filters,
  actions,
  chips,
  onReset,
  total,
  filtered,
}: FilterBarProps) {
  const hasChips = chips && chips.length > 0;
  const showCount = typeof filtered === "number" && typeof total === "number";

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border-base/60 bg-bg-surface p-3 shadow-[var(--shadow-card-sm)]">
      <div className="flex flex-wrap items-center gap-2">
        {search && <div className="min-w-[14rem] flex-1">{search}</div>}
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      {(hasChips || showCount) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {showCount && (
            <span className="text-[11px] font-medium text-text-muted">
              {filtered === total
                ? `${total} ${total === 1 ? "item" : "itens"}`
                : `${filtered} de ${total}`}
            </span>
          )}
          {hasChips && (
            <>
              <span className="text-[11px] text-text-muted">·</span>
              {chips!.map((chip) => (
                <span
                  key={chip.id}
                  className="inline-flex items-center gap-1 rounded-full border border-primary-500/30 bg-primary-500/10 px-2 py-0.5 text-[11px] font-semibold text-primary-600"
                >
                  {chip.label}
                  {chip.onRemove && (
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-primary-500/20"
                      aria-label={`Remover ${chip.label}`}
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:text-danger"
                >
                  <RotateCcw size={10} /> Limpar tudo
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
