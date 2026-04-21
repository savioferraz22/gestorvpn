import React from "react";
import { Inbox } from "lucide-react";

type EmptyProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
};

export function Empty({
  icon,
  title,
  description,
  action,
  className = "",
  compact = false,
}: EmptyProps) {
  const pad = compact ? "py-8" : "py-12 sm:py-16";
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-center ${pad} ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-surface-hover text-text-muted">
        {icon ?? <Inbox size={24} />}
      </div>
      <div className="max-w-md">
        <div className="text-base font-semibold text-text-base">{title}</div>
        {description && (
          <div className="mt-1 text-sm text-text-muted">{description}</div>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export default Empty;
