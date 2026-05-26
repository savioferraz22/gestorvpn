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
        <SectionHeader title="Buscar usuário" subtitle="Consulta detalhada por username" />

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o username…"
              autoFocus
              className="w-full rounded-md border border-border-base bg-bg-surface h-11 pl-9 pr-3 text-sm font-mono outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-md bg-primary-600 px-4 h-11 text-sm font-bold text-white transition-colors hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "…" : "Buscar"}
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
                <div className="flex items-center gap-2.5 min-w-0">
                  <User size={16} className="text-primary-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-text-base font-mono truncate">{u.login}</p>
                    <p className="text-xs text-text-muted">
                      {u.expira ? <>Expira: <span className="font-mono">{u.expira}</span></> : "Sem data de expiração"}
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
                <div className="rounded-md border border-border-base bg-bg-surface-hover p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
                    Plano atual
                  </p>
                  <p className="text-sm font-bold text-text-base font-mono">
                    {userData.plan.plan_months}{" "}
                    {userData.plan.plan_months === 1 ? "mês" : "meses"} ·{" "}
                    {userData.plan.plan_devices}{" "}
                    {userData.plan.plan_devices === 1 ? "aparelho" : "aparelhos"} · R$ {Number(userData.plan.plan_price).toFixed(2).replace(".", ",")}
                  </p>
                </div>
              )}

              {userData.groupMembers?.length > 0 && (
                <div className="overflow-hidden rounded-md border border-border-base">
                  <p className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted border-b border-border-base">
                    <Smartphone size={12} /> Outros aparelhos do mesmo plano
                  </p>
                  <div className="divide-y divide-border-base">
                    {userData.groupMembers.map((m: any) => (
                      <div
                        key={m.username}
                        className="flex items-center justify-between px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-text-base font-mono truncate">{m.username}</p>
                          <p className="text-xs text-text-muted font-mono">
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
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 h-9 text-sm font-bold text-white transition-colors hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60"
                >
                  <RefreshCw size={14} className={updatingAccess ? "animate-spin" : ""} />
                  Atualizar acesso
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo("tickets")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-base bg-bg-surface px-3 h-9 text-sm font-bold text-text-base hover:bg-bg-surface-hover transition-colors"
                >
                  <ExternalLink size={14} />
                  Ver tickets
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-soft px-3 h-9 text-sm font-bold text-danger hover:bg-danger/15 transition-colors disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Excluir cliente
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
                  <div className="divide-y divide-border-base border-t border-border-base">
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
                  <div className="divide-y divide-border-base border-t border-border-base">
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
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <Search size={22} className="text-text-muted" />
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
