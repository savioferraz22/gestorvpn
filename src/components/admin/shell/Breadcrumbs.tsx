import { ChevronRight, Shield } from "lucide-react";
import type { AdminTab } from "../../../types";
import { findNavGroup, findNavItem } from "./nav";

export function Breadcrumbs({ tab }: { tab: AdminTab }) {
  const item = findNavItem(tab);
  const group = findNavGroup(tab);
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 text-xs text-text-muted"
    >
      <span className="inline-flex items-center gap-1 font-semibold text-text-base">
        <Shield size={12} />
        Admin
      </span>
      {group && (
        <>
          <ChevronRight size={12} className="opacity-50" />
          <span className="hidden sm:inline">{group.label}</span>
        </>
      )}
      {item && (
        <>
          <ChevronRight
            size={12}
            className={`opacity-50 ${group ? "hidden sm:inline" : ""}`}
          />
          <span className="truncate font-semibold text-text-base">
            {item.label}
          </span>
        </>
      )}
    </nav>
  );
}
