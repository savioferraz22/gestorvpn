import React, { useState } from "react";
import { Search, User, Smartphone, CreditCard, Star, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Trash2 } from "lucide-react";
import { fetchAdminUserDetails, updateUserAccess, deleteAdminUser } from "../../services/api";
import type { AdminTab } from "../../types";
import { ConfirmDialog } from "../shared/ConfirmDialog";

interface Props {
  navigateTo: (tab: AdminTab) => void;
}

function formatDate(dateString: string) {
  if (!dateString) return "N/A";
  let s = dateString;
  if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");
  if (!s.endsWith("Z") && !s.includes("+")) s += "Z";
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AdminUsers({ navigateTo }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userData, setUserData] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);
  const [updatingAccess, setUpdatingAccess] = useState(false);
  const [accessMsg, setAccessMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setUserData(null);
    setAccessMsg("");
    try {
      const data = await fetchAdminUserDetails(query.trim());
      setUserData(data);
    } catch (err: any) {
      setError(err.message || "Usuário não encontrado");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(username: string) {
    setDeleting(true);
    try {
      await deleteAdminUser(username);
      setUserData(null);
      setQuery("");
      setAccessMsg("");
    } catch (err: any) {
      setAccessMsg(err.message || "Erro ao excluir cliente");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleUpdateAccess(username: string) {
    setUpdatingAccess(true);
    setAccessMsg("");
    try {
      await updateUserAccess(username, "renew", "");
      setAccessMsg("Acesso atualizado com sucesso!");
    } catch (err: any) {
      setAccessMsg(err.message || "Erro ao atualizar acesso");
    } finally {
      setUpdatingAccess(false);
    }
  }

  const u = userData?.user;
  const payments: any[] = userData?.payments || [];
  const approvedPayments = payments.filter((p: any) => p.status === "approved");

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <h2 className="font-bold text-text-base">Buscar Usuário</h2>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Digite o username..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border-base text-sm outline-none focus:ring-2 focus:ring-primary-500/50 bg-bg-surface transition-all font-medium"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-3 rounded-xl font-semibold text-sm transition-colors shadow-sm active:scale-95 disabled:opacity-60"
        >
          {loading ? "..." : "Buscar"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium">
          {error}
        </div>
      )}

      {userData && u && (
        <div className="space-y-4">
          {/* User card */}
          <div className="bg-bg-surface border border-border-base/50 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-bold text-text-base text-lg">{u.login}</p>
                  <p className="text-sm text-text-muted">{u.expira ? `Expira: ${u.expira}` : "Sem data de expiração"}</p>
                </div>
              </div>
              <span className={`text-[11px] uppercase font-bold px-2.5 py-1 rounded-lg border ${
                u.status === "Ativo" || u.status === "online"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}>
                {u.status || "N/A"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-bg-base/50 rounded-xl p-3 text-center border border-border-base/30">
                <CreditCard className="w-4 h-4 text-primary-600 mx-auto mb-1" />
                <p className="text-xs font-bold text-text-muted">Pagamentos</p>
                <p className="font-bold text-text-base">{approvedPayments.length}</p>
              </div>
              <div className="bg-bg-base/50 rounded-xl p-3 text-center border border-border-base/30">
                <Smartphone className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-xs font-bold text-text-muted">Aparelhos</p>
                <p className="font-bold text-text-base">{userData.devices?.length || 0}</p>
              </div>
              <div className="bg-bg-base/50 rounded-xl p-3 text-center border border-border-base/30">
                <Star className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <p className="text-xs font-bold text-text-muted">Pontos</p>
                <p className="font-bold text-text-base">{userData.points || 0}</p>
              </div>
            </div>

            {userData.plan && (
              <div className="bg-primary-50 border border-primary-100 rounded-xl p-3">
                <p className="text-[10px] uppercase font-bold tracking-wider text-primary-500 mb-1">Plano atual</p>
                <p className="text-sm font-bold text-primary-700">
                  {userData.plan.plan_months} {userData.plan.plan_months === 1 ? "mês" : "meses"} •{" "}
                  {userData.plan.plan_devices} {userData.plan.plan_devices === 1 ? "aparelho" : "aparelhos"} •{" "}
                  R$ {Number(userData.plan.plan_price).toFixed(2).replace(".", ",")}
                </p>
              </div>
            )}

            {accessMsg && (
              <p className={`text-sm font-medium ${accessMsg.includes("sucesso") ? "text-green-600" : "text-red-600"}`}>
                {accessMsg}
              </p>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleUpdateAccess(u.login)}
                disabled={updatingAccess}
                className="flex items-center gap-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl font-medium transition-colors active:scale-95 disabled:opacity-60"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar Acesso
              </button>
              <button
                onClick={() => navigateTo("tickets")}
                className="flex items-center gap-1.5 text-sm bg-bg-surface-hover hover:bg-bg-base text-text-base border border-border-base px-4 py-2 rounded-xl font-medium transition-colors active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver Tickets
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="flex items-center gap-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-xl font-medium transition-colors active:scale-95 disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Cliente
              </button>
            </div>
          </div>

          {/* Payment history */}
          {approvedPayments.length > 0 && (
            <div className="bg-bg-surface border border-border-base/50 rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="w-full flex items-center justify-between p-4 hover:bg-bg-surface-hover transition-colors"
              >
                <span className="font-bold text-text-base text-sm">Histórico de Pagamentos ({approvedPayments.length})</span>
                {showHistory ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
              </button>
              {showHistory && (
                <div className="divide-y divide-border-base/50">
                  {approvedPayments.map((p: any) => {
                    let amount = 0;
                    try { if (p.metadata) amount = JSON.parse(p.metadata).amount || 0; } catch { /* ok */ }
                    return (
                      <div key={p.id} className="px-4 py-3 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-text-base">{p.type === "new_device" ? "Novo Aparelho" : "Renovação"}</p>
                          <p className="text-xs text-text-muted">{formatDate(p.paid_at || p.created_at)}</p>
                        </div>
                        {amount > 0 && (
                          <span className="font-bold text-primary-600 text-sm">R$ {Number(amount).toFixed(2).replace(".", ",")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Referrals */}
          {userData.referrals?.length > 0 && (
            <div className="bg-bg-surface border border-border-base/50 rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => setShowReferrals(v => !v)}
                className="w-full flex items-center justify-between p-4 hover:bg-bg-surface-hover transition-colors"
              >
                <span className="font-bold text-text-base text-sm">Indicações ({userData.referrals.length})</span>
                {showReferrals ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
              </button>
              {showReferrals && (
                <div className="divide-y divide-border-base/50">
                  {userData.referrals.map((r: any) => (
                    <div key={r.id} className="px-4 py-3 flex justify-between items-center">
                      <p className="text-sm font-medium text-text-base">{r.referred_username}</p>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-lg border ${
                        r.status === "bonus_received"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {r.status === "bonus_received" ? "Bônus dado" : "Aguardando"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && !userData && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-bg-surface-hover flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-text-muted" />
          </div>
          <p className="text-text-muted text-sm font-medium">Digite um username para buscar</p>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Excluir Cliente"
        message={`Tem certeza que deseja excluir "${u?.login}" do sistema? Isso removerá todos os dados (pagamentos, dispositivos, histórico). O acesso no painel VPN deve ser removido manualmente.`}
        onConfirm={() => u && handleDeleteUser(u.login)}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
