import { Search, X } from "lucide-react";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar...",
  className = "",
  autoFocus,
}: SearchInputProps) {
  return (
    <div
      className={`relative flex items-center rounded-xl border border-border-base/60 bg-bg-surface pl-9 pr-8 shadow-[var(--shadow-card-sm)] focus-within:border-primary-500/70 focus-within:ring-2 focus-within:ring-[var(--ring-focus)] ${className}`}
    >
      <Search
        size={14}
        className="pointer-events-none absolute left-3 text-text-muted"
      />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-2 text-sm text-text-base outline-none placeholder:text-text-muted"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 inline-flex h-5 w-5 items-center justify-center rounded-md text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
          aria-label="Limpar"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
