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
      className={`relative inline-flex items-center gap-1.5 rounded-md border border-border-base bg-bg-surface px-2.5 h-8 text-xs focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/30 transition-colors ${className}`}
    >
      {label && (
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
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
        className="cursor-pointer appearance-none bg-transparent pr-5 font-bold text-text-base outline-none"
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
