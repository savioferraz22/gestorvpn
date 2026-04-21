import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./Card";

type Variant = "default" | "accent" | "success" | "warn" | "danger" | "info";

type StatProps = {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  variant?: Variant;
  sparkline?: React.ReactNode;
  helpText?: string;
  loading?: boolean;
  onClick?: () => void;
  active?: boolean;
};

const VARIANT_ICON_BG: Record<Variant, string> = {
  default: "bg-bg-surface-hover text-text-base",
  accent: "bg-primary-500/15 text-primary-500",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warn: "bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  info: "bg-[var(--info-soft)] text-[var(--info)]",
};

function formatDelta(d: number) {
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}%`;
}

export function Stat({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  variant = "default",
  sparkline,
  helpText,
  loading = false,
  onClick,
  active = false,
}: StatProps) {
  const deltaPositive = typeof delta === "number" && delta > 0;
  const deltaNegative = typeof delta === "number" && delta < 0;

  return (
    <Card
      interactive={!!onClick}
      elevated={active}
      onClick={onClick}
      className={active ? "ring-2 ring-primary-500/50" : ""}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {icon && (
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${VARIANT_ICON_BG[variant]}`}
              >
                {icon}
              </span>
            )}
            <span className="truncate">{label}</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-text-base tabular-nums sm:text-[26px]">
            {loading ? (
              <span className="inline-block h-7 w-24 animate-pulse rounded-md bg-bg-surface-hover" />
            ) : (
              value
            )}
          </div>
          {(typeof delta === "number" || helpText) && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              {typeof delta === "number" && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold ${
                    deltaPositive
                      ? "bg-[var(--success-soft)] text-[var(--success)]"
                      : deltaNegative
                        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                        : "bg-bg-surface-hover text-text-muted"
                  }`}
                >
                  {deltaPositive ? (
                    <ArrowUpRight size={12} />
                  ) : deltaNegative ? (
                    <ArrowDownRight size={12} />
                  ) : null}
                  {formatDelta(delta)}
                </span>
              )}
              {(deltaLabel || helpText) && (
                <span className="truncate text-text-muted">
                  {deltaLabel ?? helpText}
                </span>
              )}
            </div>
          )}
        </div>
        {sparkline && <div className="shrink-0 opacity-80">{sparkline}</div>}
      </div>
    </Card>
  );
}

export default Stat;
