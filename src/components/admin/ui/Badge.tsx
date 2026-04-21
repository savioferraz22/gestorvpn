import React from "react";

type BadgeProps = {
  count?: number | null;
  max?: number;
  children?: React.ReactNode;
  tone?: "default" | "primary" | "danger" | "warning" | "success";
  className?: string;
  dot?: boolean;
};

const TONE: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default: "bg-bg-surface-hover text-text-base",
  primary: "bg-primary-500 text-white",
  danger: "bg-[var(--danger)] text-white",
  warning: "bg-[var(--warning)] text-white",
  success: "bg-[var(--success)] text-white",
};

export function Badge({
  count,
  max = 99,
  children,
  tone = "primary",
  className = "",
  dot = false,
}: BadgeProps) {
  if (dot) {
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full ${TONE[tone]} ${className}`}
      />
    );
  }
  const display =
    typeof count === "number"
      ? count > max
        ? `${max}+`
        : `${count}`
      : children;
  if (display === undefined || display === null || display === 0) return null;
  return (
    <span
      className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${TONE[tone]} ${className}`}
    >
      {display}
    </span>
  );
}

export default Badge;
