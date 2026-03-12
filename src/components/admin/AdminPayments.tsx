import React from "react";
import { RefreshCw } from "lucide-react";
import { fetchAdminPayments } from "../../services/api";

interface Props {
  payments: any[];
  setPayments: (p: any[]) => void;
}

function formatDate(dateString: string) {
  if (!dateString) return "N/A";
  let s = dateString;
  if (s.includes(" ") && !s.includes("T")) { s = s.replace(" ", "T"); if (!s.endsWith("Z")) s += "Z"; }
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AdminPayments({ payments, setPayments }: Props) {
  const [loading, setLoading] = React.useState(false);

  async function refresh() {
    setLoading(true);
    try { setPayments(await fetchAdminPayments()); } catch (err) { console.warn(err); } finally { setLoading(false); }
  }

  const approved = payments.filter(p => p.status === "approved");
  const pending = payments.filter(p => p.status === "pending");
  const totalRevenue = approved.reduce((acc, p) => {
    try { if (p.metadata) return acc + Number(JSON.parse(p.metadata).amount || 0); } catch { /* ok */ }
    return acc;
  }, 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-5 space-y-4">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="font-bold text-text-base">Pagamentos ({payments.length})</h2>
        <button onClick={refresh} disabled={loading} className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover transition-colors active:scale-95">
          <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

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
                <div className="flex justify-between items-center text-[11px] text-text-muted border-t border-border-base/50 pt-2.5 font-medium uppercase tracking-wide">
                  <span className="bg-bg-surface-hover px-2 py-1 rounded-md">
                    {p.type === "new_device" ? "Novo Aparelho" : "Renovação"}
                  </span>
                  <span>{formatDate(p.paid_at || p.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
