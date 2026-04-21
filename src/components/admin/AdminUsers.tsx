import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Search,
  Smartphone,
  Star,
  Trash2,
  User,
} from "lucide-react";
import { deleteAdminUser, fetchAdminUserDetails, renewAdminUser } from "../../services/api";
import type { AdminTab } from "../../types";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Card, Chip, SectionHeader, Stat, useToast } from "./ui";

interface Props {
  navigateTo: (tab: AdminTab) => void;
}

function formatDate(dateString: string) {
  if (!dateString) return "—";
  let s = dateString;
  if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");
  if (!s.endsWith("Z") && !s.includes("+")) s += "Z";
  return new Date(s).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusTone(s: string): "success" | "danger" | "default" {
  if (!s) return "default";
  if (s === "Ativo" || s === "online") return "success";
  return "danger";
}

export function AdminUsers({ navigateTo }: Props) {
  const toast = useToast();
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
      setUserData(await fetchAdminUserDetails(query.trim()));
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
      toast.success("Cliente excluído");
    } catch (err: any) {
      setAccessMsg(err.message || "Erro ao excluir cliente");
      toast.error("Falha ao excluir", err.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleUpdateAccess(username: string) {
    setUpdatingAccess(true);
    setAccessMsg("");
    try {
      const data = await renewAdminUser(username);
      setAccessMsg(data.message || "Acesso renovado com sucesso!");
      toast.success("Acesso renovado", data.message);
    } catch (err: any) {
      setAccessMsg(err.message || "Erro ao renovar acesso");
      toast.error("Falha ao renovar", err.message);
    } finally {
      setUpdatingAccess(false);
    }
  }

  const u = userData?.user;
  const payments: any[] = userData?.payments || [];
  const approvedPayments = payments.filter((p: any) => p.status === "approved");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader title="Buscar Usuário" subtitle="Consulta detalhada por username" />

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o username..."
              autoFocus
              className="w-full rounded-xl border border-border-base/60 bg-bg-surface py-3 pl-10 pr-4 text-sm font-medium outline-none focus:border-primary-500/70 focus:ring-2 focus:ring-[var(--ring-focus)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 active:scale-95 disabled:opacity-60"
          >
            {loading ? "..." : "Buscar"}
          </button>
        </form>

        {error && (
          <Card padding="md" className="border-danger/30 bg-[var(--danger-soft)]">
            <p className="text-sm font-medium text-danger">{error}</p>
          </Card>
        )}

        {userData && u && (
          <div className="flex flex-col gap-4">
            <Card padding="md" className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary-500/30 bg-primary-500/10 text-primary-500">
                    <User size={18} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-text-base">{u.login}</p>
                    <p className="text-sm text-text-muted">
                      {u.expira ? `Expira: ${u.expira}` : "Sem data de expiração"}
                    </p>
                  </div>
                </div>
                <Chip tone={statusTone(u.status)} size="sm" uppercase>
                  {u.status || "N/A"}
                </Chip>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Stat
                  label="Pagamentos"
                  value={String(approvedPayments.length)}
                  icon={<CreditCard size={14} />}
                  variant="accent"
                />
                <Stat
                  label="Aparelhos"
                  value={String(userData.devices?.length || 0)}
                  icon={<Smartphone size={14} />}
                  variant="info"
                />
                <Stat
                  label="Pontos"
                  value={String(userData.points || 0)}
                  icon={<Star size={14} />}
                  variant="warn"
                />
              </div>

              {userData.plan && (
                <div className="rounded-xl border border-primary-500/20 bg-primary-500/10 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary-500">
                    Plano atual
                  </p>
                  <p className="text-sm font-bold text-primary-700 dark:text-primary-300">
                    {userData.plan.plan_months}{" "}
                    {userData.plan.plan_months === 1 ? "mês" : "meses"} •{" "}
                    {userData.plan.plan_devices}{" "}
                    {userData.plan.plan_devices === 1 ? "aparelho" : "aparelhos"} • R${" "}
                    {Number(userData.plan.plan_price).toFixed(2).replace(".", ",")}
                  </p>
                </div>
              )}

              {userData.groupMembers?.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-border-base/60">
                  <p className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    <Smartphone size={12} /> Outros aparelhos do mesmo plano
                  </p>
                  <div className="divide-y divide-border-base/40">
                    {userData.groupMembers.map((m: any) => (
                      <div
                        key={m.username}
                        className="flex items-center justify-between px-3 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-bold text-text-base">{m.username}</p>
                          <p className="text-xs text-text-muted">
                            {m.expira
                              ? `Vence: ${m.expira?.slice(0, 10).split("-").reverse().join("/")}`
                              : "—"}
                          </p>
                        </div>
                        <Chip tone={statusTone(m.status)} size="sm" uppercase>
                          {m.status || "—"}
                        </Chip>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {accessMsg && (
                <p
                  className={`text-sm font-medium ${
                    accessMsg.toLowerCase().includes("sucesso")
                      ? "text-[var(--success)]"
                      : "text-danger"
                  }`}
                >
                  {accessMsg}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateAccess(u.login)}
                  disabled={updatingAccess}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 active:scale-95 disabled:opacity-60"
                >
                  <RefreshCw size={14} className={updatingAccess ? "animate-spin" : ""} />
                  Atualizar Acesso
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo("tickets")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border-base/60 bg-bg-surface px-4 py-2 text-sm font-bold text-text-base hover:bg-bg-surface-hover"
                >
                  <ExternalLink size={14} />
                  Ver Tickets
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/20 disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Excluir Cliente
                </button>
              </div>
            </Card>

            {approvedPayments.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="flex w-full items-center justify-between p-4 transition-colors hover:bg-bg-surface-hover"
                >
                  <span className="text-sm font-bold text-text-base">
                    Histórico de Pagamentos ({approvedPayments.length})
                  </span>
                  {showHistory ? (
                    <ChevronUp size={14} className="text-text-muted" />
                  ) : (
                    <ChevronDown size={14} className="text-text-muted" />
                  )}
                </button>
                {showHistory && (
                  <div className="divide-y divide-border-base/40 border-t border-border-base/40">
                    {approvedPayments.map((p: any) => {
                      let amount = 0;
                      try {
                        if (p.metadata) amount = JSON.parse(p.metadata).amount || 0;
                      } catch {
                        /* ok */
                      }
                      return (
                        <div key={p.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-text-base">
                              {p.type === "new_device" ? "Novo Aparelho" : "Renovação"}
                            </p>
                            <p className="text-xs text-text-muted">
                              {formatDate(p.paid_at || p.created_at)}
                            </p>
                          </div>
                          {amount > 0 && (
                            <span className="text-sm font-bold text-primary-600">
                              R$ {Number(amount).toFixed(2).replace(".", ",")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}

            {userData.referrals?.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowReferrals((v) => !v)}
                  className="flex w-full items-center justify-between p-4 transition-colors hover:bg-bg-surface-hover"
                >
                  <span className="text-sm font-bold text-text-base">
                    Indicações ({userData.referrals.length})
                  </span>
                  {showReferrals ? (
                    <ChevronUp size={14} className="text-text-muted" />
                  ) : (
                    <ChevronDown size={14} className="text-text-muted" />
                  )}
                </button>
                {showReferrals && (
                  <div className="divide-y divide-border-base/40 border-t border-border-base/40">
                    {userData.referrals.map((r: any) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <p className="text-sm font-medium text-text-base">
                          {r.referred_username}
                        </p>
                        <Chip
                          tone={r.status === "bonus_received" ? "success" : "warning"}
                          size="sm"
                          uppercase
                        >
                          {r.status === "bonus_received" ? "Bônus dado" : "Aguardando"}
                        </Chip>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {!loading && !userData && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bg-surface-hover">
              <Search size={24} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-muted">
              Digite um username para buscar
            </p>
          </div>
        )}
      </div>

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
