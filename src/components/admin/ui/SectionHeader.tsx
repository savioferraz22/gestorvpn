import React from "react";

type SectionHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function SectionHeader({
  title,
  subtitle,
  icon,
  actions,
  className = "",
  size = "md",
}: SectionHeaderProps) {
  const titleSize =
    size === "lg"
      ? "text-2xl sm:text-3xl"
      : size === "sm"
        ? "text-base"
        : "text-lg sm:text-xl";
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon && (
          <span className="text-primary-600 shrink-0">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className={`font-bold text-text-base tracking-tight ${titleSize}`}>{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export default SectionHeader;
