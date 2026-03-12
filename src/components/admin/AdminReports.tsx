import React from "react";
import { RefreshCw } from "lucide-react";
import { fetchAdminReports } from "../../services/api";
import type { AdminReports as AdminReportsData } from "../../types";

interface Props {
  reports: AdminReportsData;
  setReports: (r: AdminReportsData) => void;
  reportPeriod: number;
  setReportPeriod: (p: number) => void;
}

export function AdminReports({ reports, setReports, reportPeriod, setReportPeriod }: Props) {
  const [loading, setLoading] = React.useState(false);

  async function refresh(period: number) {
    setLoading(true);
    try { setReports(await fetchAdminReports(period)); } catch (err) { console.warn(err); } finally { setLoading(false); }
  }

  const maxSalesRevenue = Math.max(...(reports.salesHistory || []).map(s => s.revenue), 1);

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-5 space-y-5">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="font-bold text-text-base">Relatórios</h2>
        <div className="flex items-center gap-2">
          <select
            value={reportPeriod}
            onChange={e => {
              const p = Number(e.target.value);
              setReportPeriod(p);
              refresh(p);
            }}
            className="text-xs bg-bg-surface border border-border-base/50 rounded-xl px-3 py-2 outline-none font-bold cursor-pointer shadow-sm"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={15}>Últimos 15 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button onClick={() => refresh(reportPeriod)} disabled={loading} className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover active:scale-95 transition-colors">
            <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg-surface border border-border-base/50 p-4 rounded-2xl shadow-sm">
            <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1">Receita Total</p>
            <p className="text-2xl font-bold text-primary-600 leading-none">
              R$ {Number(reports.totalRevenue).toFixed(2).replace(".", ",")}
            </p>
          </div>
          <div className="bg-bg-surface border border-border-base/50 p-4 rounded-2xl shadow-sm">
            <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1">Vendas</p>
            <p className="text-2xl font-bold text-text-base leading-none">{reports.totalSales}</p>
          </div>
          <div className="bg-bg-surface border border-border-base/50 p-4 rounded-2xl shadow-sm">
            <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1">Testes</p>
            <p className="text-2xl font-bold text-text-base leading-none">{reports.totalTests}</p>
          </div>
          <div className="bg-bg-surface border border-border-base/50 p-4 rounded-2xl shadow-sm">
            <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1">Conversão</p>
            <p className="text-2xl font-bold text-green-600 leading-none">{reports.conversionRate}%</p>
          </div>
        </div>

        {/* Sales history */}
        <div>
          <h3 className="font-bold text-text-base mb-3 text-sm uppercase tracking-wider">Histórico de Vendas</h3>
          {reports.salesHistory.length === 0 ? (
            <div className="bg-bg-surface/50 border border-border-base/50 p-6 rounded-2xl text-center">
              <p className="text-sm font-medium text-text-muted">Nenhuma venda no período.</p>
            </div>
          ) : (
            <div className="bg-bg-surface border border-border-base/50 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-bg-base/50 text-text-muted border-b border-border-base/50">
                  <tr>
                    <th className="px-5 py-3.5 font-bold text-[11px] uppercase tracking-wider">Data</th>
                    <th className="px-5 py-3.5 font-bold text-[11px] uppercase tracking-wider text-center">Vendas</th>
                    <th className="px-5 py-3.5 font-bold text-[11px] uppercase tracking-wider text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.salesHistory.filter(s => s.count > 0).map(s => {
                    const highlight = s.revenue === maxSalesRevenue && s.revenue > 0;
                    return (
                      <tr key={s.date} className={`border-b border-border-base/50 last:border-0 hover:bg-bg-surface-hover transition-colors ${highlight ? "bg-primary-50/50" : ""}`}>
                        <td className="px-5 py-3.5 text-text-base font-medium">{s.date.split("-").reverse().join("/")}</td>
                        <td className="px-5 py-3.5 text-center text-text-base font-bold bg-bg-base/30">{s.count}</td>
                        <td className={`px-5 py-3.5 text-right font-bold ${highlight ? "text-primary-600" : "text-primary-500"}`}>
                          R$ {Number(s.revenue).toFixed(2).replace(".", ",")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tests history */}
        <div>
          <h3 className="font-bold text-text-base mb-3 text-sm uppercase tracking-wider">Histórico de Testes</h3>
          {reports.testsHistory.length === 0 ? (
            <div className="bg-bg-surface/50 border border-border-base/50 p-6 rounded-2xl text-center">
              <p className="text-sm font-medium text-text-muted">Nenhum teste no período.</p>
            </div>
          ) : (
            <div className="bg-bg-surface border border-border-base/50 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-bg-base/50 text-text-muted border-b border-border-base/50">
                  <tr>
                    <th className="px-5 py-3.5 font-bold text-[11px] uppercase tracking-wider">Data</th>
                    <th className="px-5 py-3.5 font-bold text-[11px] uppercase tracking-wider text-right">Testes</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.testsHistory.filter(t => t.count > 0).map(t => (
                    <tr key={t.date} className="border-b border-border-base/50 last:border-0 hover:bg-bg-surface-hover transition-colors">
                      <td className="px-5 py-3.5 text-text-base font-medium">{t.date.split("-").reverse().join("/")}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-text-base bg-bg-base/30">{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
