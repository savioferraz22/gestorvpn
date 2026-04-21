import { ChevronDown } from "lucide-react";

export type FilterOption<V extends string | number = string> = {
  value: V;
  label: string;
};

type FilterSelectProps<V extends string | number> = {
  value: V;
  options: FilterOption<V>[];
  onChange: (value: V) => void;
  label?: string;
  className?: string;
};

export function FilterSelect<V extends string | number>({
  value,
  options,
  onChange,
  label,
  className = "",
}: FilterSelectProps<V>) {
  return (
    <label
      className={`relative inline-flex items-center gap-1.5 rounded-xl border border-border-base/60 bg-bg-surface px-2.5 py-1.5 text-xs shadow-[var(--shadow-card-sm)] focus-within:border-primary-500/70 focus-within:ring-2 focus-within:ring-[var(--ring-focus)] ${className}`}
    >
      {label && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </span>
      )}
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
        className="cursor-pointer appearance-none bg-transparent pr-5 font-semibold text-text-base outline-none"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 text-text-muted"
      />
    </label>
  );
}
