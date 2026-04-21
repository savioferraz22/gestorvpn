import type { AdminTab } from "../../../types";

export type NavBadgeKey = "tickets" | "refunds" | "changes";

export interface NavItem {
  id: AdminTab;
  label: string;
  description?: string;
  iconName: string;
  badgeKey?: NavBadgeKey;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "analytics",
    label: "Analytics",
    items: [
      {
        id: "overview",
        label: "Visão Geral",
        description: "KPIs, receita e pendências",
        iconName: "LayoutDashboard",
      },
      {
        id: "reports",
        label: "Relatórios",
        description: "Análises e séries temporais",
        iconName: "BarChart2",
      },
    ],
  },
  {
    id: "operations",
    label: "Operação",
    items: [
      {
        id: "tickets",
        label: "Tickets",
        description: "Atendimentos abertos",
        iconName: "MessageSquare",
        badgeKey: "tickets",
      },
      {
        id: "refunds",
        label: "Reembolsos",
        description: "Solicitações e aprovações",
        iconName: "RefreshCw",
        badgeKey: "refunds",
      },
      {
        id: "change_requests",
        label: "Alterações",
        description: "Pedidos de mudança",
        iconName: "ClipboardList",
        badgeKey: "changes",
      },
    ],
  },
  {
    id: "catalog",
    label: "Catálogo",
    items: [
      {
        id: "users",
        label: "Usuários",
        description: "Clientes e acessos",
        iconName: "Users",
      },
      {
        id: "resellers",
        label: "Revendedores",
        description: "Parceiros e histórico",
        iconName: "Store",
      },
      {
        id: "devices",
        label: "Aparelhos",
        description: "Dispositivos registrados",
        iconName: "Smartphone",
      },
    ],
  },
  {
    id: "finance",
    label: "Financeiro",
    items: [
      {
        id: "payments",
        label: "Pagamentos",
        description: "Histórico e tentativas",
        iconName: "CreditCard",
      },
    ],
  },
  {
    id: "system",
    label: "Sistema",
    items: [
      {
        id: "notifications",
        label: "Notificações",
        description: "Push do navegador",
        iconName: "Bell",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function findNavItem(id: AdminTab): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.id === id);
}

export function findNavGroup(id: AdminTab): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.id === id));
}
