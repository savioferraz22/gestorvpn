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
      <div className="text-text-muted">
        {icon ?? <Inbox size={24} />}
      </div>
      <div className="max-w-md">
        <div className="text-sm font-bold text-text-base">{title}</div>
        {description && (
          <div className="mt-0.5 text-xs text-text-muted">{description}</div>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export default Empty;
