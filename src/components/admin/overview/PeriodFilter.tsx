type Option = { value: number; label: string };

const OPTIONS: Option[] = [
  { value: 7, label: "7D" },
  { value: 14, label: "14D" },
  { value: 30, label: "30D" },
  { value: 60, label: "60D" },
  { value: 90, label: "90D" },
];

type PeriodFilterProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export function PeriodFilter({ value, onChange, disabled }: PeriodFilterProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Período"
      className="inline-flex items-center rounded-xl border border-border-base/60 bg-bg-surface p-0.5 shadow-[var(--shadow-card-sm)]"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`relative rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3 ${
              active
                ? "bg-primary-600 text-white"
                : "text-text-muted hover:text-text-base"
            } disabled:opacity-50`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
