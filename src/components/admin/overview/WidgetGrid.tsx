import {
  ArrowRight,
  BarChart2,
  ClipboardList,
  MessageSquare,
  PieChart,
  RefreshCw,
  Trophy,
} from "lucide-react";
import type { AdminTab, AdminReports } from "../../../types";
import { Card, Chip, Empty, SectionHeader } from "../ui";
import { Donut, type DonutSlice } from "../charts";

type WidgetGridProps = {
  reports: AdminReports;
  allTickets: any[];
  refunds: any[];
  changeRequests: any[];
  navigateTo: (tab: AdminTab) => void;
  period: number;
};

function fmtBRL(v: number) {
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
}

function SeeAllButton({
  onClick,
  label = "Ver todos",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-500 hover:text-primary-600"
    >
      {label}
      <ArrowRight size={12} />
    </button>
  );
}

export function WidgetGrid({
  reports,
  allTickets,
  refunds,
  changeRequests,
  navigateTo,
  period,
}: WidgetGridProps) {
  const openTickets = allTickets.filter((t) => t.status === "open");
  const pendingRefunds = refunds.filter((r) => r.status === "aguardando");
  const pendingChanges = changeRequests.filter((c) => c.status === "aguardando");

  const donutData: DonutSlice[] =
    reports.byType?.map((t, i) => ({
      id: `${t.type}-${i}`,
      label: t.type || "Outro",
      value: t.revenue,
    })) ?? [];

  const totalRevenue = reports.totalRevenue;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Top Clientes */}
      <Card className="lg:col-span-7" padding="md">
        <SectionHeader
          size="sm"
          icon={<Trophy size={14} />}
          title={`Top clientes — ${period}d`}
          subtitle="Maior receita no período"
        />
        <div className="mt-3">
          {!reports.topUsers || reports.topUsers.length === 0 ? (
            <Empty title="Sem dados" compact />
          ) : (
            <div className="space-y-2.5">
              {reports.topUsers.slice(0, 6).map((u, i) => {
                const maxRev = reports.topUsers![0].revenue || 1;
                const pct = (u.revenue / maxRev) * 100;
                return (
                  <div key={u.username} className="flex items-center gap-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-bg-surface-hover text-[11px] font-bold text-text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-text-base">
                          {u.username}
                        </p>
                        <p className="shrink-0 text-xs font-bold text-primary-500 tabular-nums">
                          {fmtBRL(u.revenue)}
                        </p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-surface-hover">
                        <div
                          className="h-full rounded-full bg-primary-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-text-muted tabular-nums">
                      {u.sales}x
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Distribuição por tipo */}
      <Card className="lg:col-span-5" padding="md">
        <SectionHeader
          size="sm"
          icon={<PieChart size={14} />}
          title="Distribuição"
          subtitle="Receita por tipo de plano"
        />
        <div className="mt-3">
          {donutData.length === 0 ? (
            <Empty title="Sem dados" compact />
          ) : (
            <Donut
              data={donutData}
              formatValue={fmtBRL}
              centerLabel={
                <>
                  <span className="text-[10px] uppercase tracking-wide text-text-muted">
                    Total
                  </span>
                  <span className="text-sm font-bold text-text-base tabular-nums">
                    {fmtBRL(totalRevenue)}
                  </span>
                </>
              }
            />
          )}
        </div>
      </Card>

      {/* Tickets abertos */}
      <Card className="lg:col-span-4" padding="md">
        <SectionHeader
          size="sm"
          icon={<MessageSquare size={14} />}
          title="Tickets abertos"
          actions={
            openTickets.length > 0 ? (
              <SeeAllButton onClick={() => navigateTo("tickets")} />
            ) : undefined
          }
        />
        <div className="mt-3">
          {openTickets.length === 0 ? (
            <Empty title="Nenhum ticket" compact />
          ) : (
            <ul className="space-y-2">
              {openTickets.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 border-b border-border-base/40 pb-2 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-base">
                      {t.subject}
                    </p>
                    <p className="truncate text-[11px] text-text-muted">
                      {t.username} · {t.category}
                    </p>
                  </div>
                  <Chip tone="warning" size="sm" uppercase>
                    Aberto
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Reembolsos */}
      <Card className="lg:col-span-4" padding="md">
        <SectionHeader
          size="sm"
          icon={<RefreshCw size={14} />}
          title="Reembolsos"
          actions={
            pendingRefunds.length > 0 ? (
              <SeeAllButton onClick={() => navigateTo("refunds")} />
            ) : undefined
          }
        />
        <div className="mt-3">
          {pendingRefunds.length === 0 ? (
            <Empty title="Nenhuma pendência" compact />
          ) : (
            <ul className="space-y-2">
              {pendingRefunds.slice(0, 5).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 border-b border-border-base/40 pb-2 last:border-0 last:pb-0"
                >
                  <p className="truncate text-sm font-medium text-text-base">
                    {r.username}
                  </p>
                  <Chip tone="warning" size="sm" uppercase>
                    Aguardando
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Alterações */}
      <Card className="lg:col-span-4" padding="md">
        <SectionHeader
          size="sm"
          icon={<ClipboardList size={14} />}
          title="Alterações"
          actions={
            pendingChanges.length > 0 ? (
              <SeeAllButton onClick={() => navigateTo("change_requests")} />
            ) : undefined
          }
        />
        <div className="mt-3">
          {pendingChanges.length === 0 ? (
            <Empty title="Nenhuma pendência" compact />
          ) : (
            <ul className="space-y-2">
              {pendingChanges.slice(0, 5).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 border-b border-border-base/40 pb-2 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-base">
                      {c.username}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {c.type === "date"
                        ? "Vencimento"
                        : c.type === "username"
                          ? "Usuário"
                          : c.type === "uuid"
                            ? "UUID"
                            : "Senha"}
                    </p>
                  </div>
                  <Chip tone="warning" size="sm" uppercase>
                    Aguardando
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Top referrers */}
      {reports.topReferrers && reports.topReferrers.length > 0 && (
        <Card className="lg:col-span-12" padding="md">
          <SectionHeader
            size="sm"
            icon={<BarChart2 size={14} />}
            title={`Top indicações — ${period}d`}
            subtitle="Referências com mais conversões"
          />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {reports.topReferrers.slice(0, 6).map((r) => (
              <div
                key={r.username}
                className="flex items-center justify-between rounded-xl bg-bg-surface-hover/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-base">
                    {r.username}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {r.total} indicações
                  </p>
                </div>
                <Chip tone="success" size="sm">
                  {r.converted} ok
                </Chip>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
