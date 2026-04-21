import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";

export type DateRange = { from: string | null; to: string | null };

type Preset = { label: string; days: number };

const PRESETS: Preset[] = [
  { label: "Hoje", days: 0 },
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function toISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBR(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function presetRange(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  if (days > 0) from.setDate(from.getDate() - days + 1);
  return { from: toISO(from), to: toISO(to) };
}

type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
};

export function DateRangePicker({ value, onChange, label = "Período" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasRange = value.from || value.to;
  const display = hasRange
    ? `${formatBR(value.from)} → ${formatBR(value.to) || "..."}`
    : "Selecionar período";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-border-base/60 bg-bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-base shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover"
      >
        <Calendar size={13} className="text-text-muted" />
        <span className="text-[11px] uppercase tracking-wide text-text-muted">{label}</span>
        <span>{display}</span>
        <ChevronDown size={12} className="text-text-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-border-base/60 bg-bg-surface p-3 shadow-[var(--shadow-card-md)]">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => {
                  onChange(presetRange(p.days));
                  setOpen(false);
                }}
                className="rounded-lg bg-bg-surface-hover/60 px-2 py-1 text-[11px] font-semibold text-text-base hover:bg-primary-500 hover:text-white"
              >
                {p.label}
              </button>
            ))}
            {hasRange && (
              <button
                type="button"
                onClick={() => onChange({ from: null, to: null })}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/10"
              >
                <X size={11} /> Limpar
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                De
              </span>
              <input
                type="date"
                value={value.from ?? ""}
                onChange={(e) => onChange({ ...value, from: e.target.value || null })}
                className="rounded-lg border border-border-base/60 bg-bg-surface px-2 py-1.5 text-xs text-text-base outline-none focus:border-primary-500/70 focus:ring-2 focus:ring-[var(--ring-focus)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Até
              </span>
              <input
                type="date"
                value={value.to ?? ""}
                onChange={(e) => onChange({ ...value, to: e.target.value || null })}
                className="rounded-lg border border-border-base/60 bg-bg-surface px-2 py-1.5 text-xs text-text-base outline-none focus:border-primary-500/70 focus:ring-2 focus:ring-[var(--ring-focus)]"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export function dateInRange(iso: string | undefined | null, range: DateRange): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}
