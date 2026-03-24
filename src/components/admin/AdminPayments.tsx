import React from "react";
import { RefreshCw, RotateCcw, User, X, Clock, CreditCard, Smartphone } from "lucide-react";
import { fetchAdminPayments, fetchAdminUserDetails } from "../../services/api";
import { getAdminToken } from "../../services/api";

interface Props {
  payments: any[];
  setPayments: (p: any[]) => void;
}

function formatDateTime(dateString: string) {
  if (!dateString) return "N/A";
  let s = dateString;
  if (s.includes(" ") && !s.includes("T")) { s = s.replace(" ", "T"); if (!s.endsWith("Z")) s += "Z"; }
  const d = new Date(s);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(dateString: string) {
  if (!dateString) return "N/A";
  let s = dateString;
  if (s.includes(" ") && !s.includes("T")) { s = s.replace(" ", "T"); if (!s.endsWith("Z")) s += "Z"; }
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysLeft(expira: string) {
  if (!expira) return null;
  const exp = new Date(expira);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

export function AdminPayments({ payments, setPayments }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [reprocessing, setReprocessing] = React.useState(false);
  const [reprocessMsg, setReprocessMsg] = React.useState("");
  const [viewUser, setViewUser] = React.useState<any>(null);
  const [loadingUser, setLoadingUser] = React.useState("");

  async function refresh() {
    setLoading(true);
    try { setPayments(await fetchAdminPayments()); } catch (err) { console.warn(err); } finally { setLoading(false); }
  }

  async function reprocessCancelled() {
    setReprocessing(true);
    setReprocessMsg("");
    try {
      const token = getAdminToken();
      const res = await fetch("/api/admin/payments/reprocess-cancelled", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      setReprocessMsg(data.message || "Concluído");
      if (data.recovered > 0) await refresh();
    } catch (err: any) {
      setReprocessMsg("Erro ao reprocessar");
    } finally {
      setReprocessing(false);
    }
  }

  async function handleViewUser(username: string) {
    setLoadingUser(username);
    try {
      const data = await fetchAdminUserDetails(username);
      setViewUser(data);
    } catch (err) { console.warn(err); } finally {
      setLoadingUser("");
    }
  }

  const approved = payments.filter(p => p.status === "approved");
  const pending = payments.filter(p => p.status === "pending");
  const totalRevenue = approved.reduce((acc, p) => {
    try { if (p.metadata) return acc + Number(JSON.parse(p.metadata).amount || 0); } catch { /* ok */ }
    return acc;
  }, 0);

  const vu = viewUser?.user;
  const vuDays = vu ? daysLeft(vu.expira) : null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-5 space-y-4">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="font-bold text-text-base">Pagamentos ({payments.length})</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={reprocessCancelled}
            disabled={reprocessing}
            title="Reprocessar pagamentos cancelados que foram pagos no MP"
            className="flex items-center gap-1.5 text-xs bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 px-3 py-2 rounded-xl font-bold transition-colors active:scale-95 disabled:opacity-60"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${reprocessing ? "animate-spin" : ""}`} />
            {reprocessing ? "Verificando..." : "Recuperar"}
          </button>
          <button onClick={refresh} disabled={loading} className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover transition-colors active:scale-95">
            <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {reprocessMsg && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-4 py-2.5 rounded-xl shrink-0">
          {reprocessMsg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 shrink-0">
        <div className="bg-green-50 border border-green-100 p-4 rounded-2xl text-center shadow-sm">
          <p className="text-[10px] uppercase font-bold text-green-500 mb-1 tracking-wider">Aprovados</p>
          <p className="text-2xl font-bold text-green-600 leading-none">{approved.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-center shadow-sm">
          <p className="text-[10px] uppercase font-bold text-amber-500 mb-1 tracking-wider">Pendentes</p>
          <p className="text-2xl font-bold text-amber-600 leading-none">{pending.length}</p>
        </div>
        <div className="bg-primary-50 border border-primary-100 p-4 rounded-2xl text-center shadow-sm">
          <p className="text-[10px] uppercase font-bold text-primary-500 mb-1 tracking-wider">Receita</p>
          <p className="text-lg font-bold text-primary-600 leading-none mt-1">
            R$ {totalRevenue.toFixed(2).replace(".", ",")}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {payments.length === 0 ? (
          <div className="bg-bg-surface/50 border border-border-base/50 p-6 rounded-2xl text-center">
            <p className="text-sm font-medium text-text-muted">Nenhum pagamento registrado.</p>
          </div>
        ) : (
          payments.map((p: any) => {
            let meta: any = {};
            try { if (p.metadata) meta = JSON.parse(p.metadata); } catch { /* ok */ }
            return (
              <div key={p.id} className="bg-bg-surface border border-border-base/50 p-4 rounded-2xl flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold text-text-base mb-1">{p.username}</p>
                    <p className="text-[11px] font-mono bg-bg-surface-hover px-1.5 py-0.5 rounded text-text-muted border border-border-base/50">
                      ID: {p.id.substring(0, 8)}...
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg border ${
                      p.status === "approved" ? "bg-green-50 text-green-700 border-green-200" :
                      p.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-red-50 text-red-700 border-red-200"
                    }`}>
                      {p.status === "approved" ? "Aprovado" : p.status === "pending" ? "Pendente" : p.status}
                    </span>
                    {meta.amount && (
                      <span className="text-base font-bold text-text-base">
                        R$ {Number(meta.amount).toFixed(2).replace(".", ",")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center text-[11px] text-text-muted border-t border-border-base/50 pt-2.5">
                  <span className="bg-bg-surface-hover px-2 py-1 rounded-md font-medium uppercase tracking-wide">
                    {p.type === "new_device" ? "Novo Aparelho" :
                     p.type === "reseller_hire" ? "Nova Revenda" :
                     p.type === "reseller_renewal" ? "Renovação Revenda" :
                     p.type === "reseller_logins_increase" ? "Aumento Logins" : "Renovação"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span>{formatDateTime(p.paid_at || p.created_at)}</span>
                    <button
                      onClick={() => handleViewUser(p.username)}
                      disabled={loadingUser === p.username}
                      className="flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-100 px-2.5 py-1 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
                    >
                      <User className="w-3 h-3" />
                      {loadingUser === p.username ? "..." : "Ver usuário"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* User detail modal */}
      {viewUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-bold text-text-base">{vu?.login || viewUser.user?.login}</p>
                  <p className="text-xs text-text-muted">
                    {vuDays === null ? "—" : vuDays < 0 ? "Expirado" : vuDays === 0 ? "Vence hoje" : `${vuDays}d restantes`}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewUser(null)} className="p-2 rounded-xl hover:bg-bg-surface-hover text-text-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {vu && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-bg-base rounded-xl p-3 border border-border-base/50">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Vencimento</p>
                  <div className="flex items-center gap-1.5">
                    <Clock className={`w-3.5 h-3.5 ${vuDays !== null && vuDays < 0 ? "text-red-500" : vuDays !== null && vuDays <= 3 ? "text-amber-500" : "text-text-muted"}`} />
                    <p className={`text-sm font-bold ${vuDays !== null && vuDays < 0 ? "text-red-600" : vuDays !== null && vuDays <= 3 ? "text-amber-600" : "text-text-base"}`}>
                      {formatDate(vu.expira)}
                    </p>
                  </div>
                </div>
                <div className="bg-bg-base rounded-xl p-3 border border-border-base/50">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Pagamentos</p>
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-text-muted" />
                    <p className="text-sm font-bold text-text-base">{(viewUser.payments || []).filter((p: any) => p.status === "approved").length} aprovados</p>
                  </div>
                </div>
              </div>
            )}

            {viewUser.plan && (
              <div className="bg-primary-50 border border-primary-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-primary-600 uppercase tracking-wider mb-1">Plano atual</p>
                <p className="text-sm font-bold text-primary-700">
                  {viewUser.plan.plan_months} {viewUser.plan.plan_months === 1 ? "mês" : "meses"} · {viewUser.plan.plan_devices} {viewUser.plan.plan_devices === 1 ? "aparelho" : "aparelhos"} · R$ {viewUser.plan.plan_price}
                </p>
              </div>
            )}

            {viewUser.groupMembers?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" /> Outros aparelhos do plano
                </p>
                <div className="space-y-1.5">
                  {viewUser.groupMembers.map((m: any) => (
                    <div key={m.username} className="bg-bg-base rounded-xl px-3 py-2 border border-border-base/50 flex justify-between items-center">
                      <span className="text-sm font-bold text-text-base">{m.username}</span>
                      <span className="text-xs text-text-muted">{m.expira ? formatDate(m.expira) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
