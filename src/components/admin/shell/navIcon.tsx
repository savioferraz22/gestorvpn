import React from "react";
import {
  LayoutDashboard,
  Users,
  Smartphone,
  MessageSquare,
  CreditCard,
  RefreshCw,
  ClipboardList,
  BarChart2,
  Store,
  Bell,
} from "lucide-react";

const MAP: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  LayoutDashboard,
  Users,
  Smartphone,
  MessageSquare,
  CreditCard,
  RefreshCw,
  ClipboardList,
  BarChart2,
  Store,
  Bell,
};

export function NavIcon({
  name,
  className,
  size,
}: {
  name: string;
  className?: string;
  size?: number;
}) {
  const Icon = MAP[name] ?? LayoutDashboard;
  return <Icon className={className} size={size} />;
}
