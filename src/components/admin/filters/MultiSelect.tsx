import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { FilterOption } from "./FilterSelect";

type MultiSelectProps<V extends string | number> = {
  label: string;
  value: V[];
  options: FilterOption<V>[];
  onChange: (value: V[]) => void;
  placeholder?: string;
};

export function MultiSelect<V extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = "Todos",
}: MultiSelectProps<V>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(v: V) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  const display =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? String(value[0])
        : `${value.length} selecionados`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border-base/60 bg-bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-base shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover"
      >
        <span className="text-[11px] uppercase tracking-wide text-text-muted">{label}</span>
        <span>{display}</span>
        <ChevronDown size={12} className="text-text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 min-w-[12rem] overflow-hidden rounded-2xl border border-border-base/60 bg-bg-surface p-1 shadow-[var(--shadow-card-md)]">
          {options.map((opt) => {
            const selected = value.includes(opt.value);
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? "bg-primary-500/10 text-primary-600"
                    : "text-text-base hover:bg-bg-surface-hover"
                }`}
              >
                <span>{opt.label}</span>
                {selected && <Check size={12} />}
              </button>
            );
          })}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-danger hover:bg-danger/10"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}
