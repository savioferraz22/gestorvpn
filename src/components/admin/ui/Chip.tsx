import React from "react";
import { X } from "lucide-react";

type ChipTone =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

type ChipProps = {
  children: React.ReactNode;
  tone?: ChipTone;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
  uppercase?: boolean;
};

const TONE_MAP: Record<ChipTone, string> = {
  default: "bg-bg-surface-hover text-text-base border-border-base/60",
  primary: "bg-primary-500/15 text-primary-500 border-primary-500/30",
  success:
    "bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/20",
  warning:
    "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20",
  danger:
    "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/20",
  info: "bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]/20",
  purple:
    "bg-purple-500/12 text-purple-500 border-purple-500/25 dark:text-purple-300",
};

export function Chip({
  children,
  tone = "default",
  size = "md",
  icon,
  onRemove,
  onClick,
  className = "",
  uppercase = false,
}: ChipProps) {
  const sizeClasses =
    size === "sm"
      ? "text-[10px] px-2 py-0.5 gap-1"
      : "text-xs px-2.5 py-1 gap-1.5";
  const interactive = onClick ? "cursor-pointer hover:brightness-110" : "";
  const up = uppercase ? "uppercase tracking-wide" : "";
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center rounded-lg border font-semibold ${TONE_MAP[tone]} ${sizeClasses} ${interactive} ${up} ${className}`}
    >
      {icon}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 -mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10"
          aria-label="Remover"
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export default Chip;
