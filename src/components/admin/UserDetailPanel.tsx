import React, { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  LifeBuoy,
  RefreshCw,
  Smartphone,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  deleteAdminUser,
  fetchAdminUserDetails,
  renewAdminUser,
} from "../../services/api";
import type { AdminTab } from "../../types";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Card, Chip, SectionHeader, Skeleton, Stat, useToast } from "./ui";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(dateString?: string | null) {
  if (!dateString) return "—";
  let s = String(dateString);
  if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");
  if (!s.endsWith("Z") && !s.includes("+")) s += "Z";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// VPN panel "expira" is local time (not UTC) — format without shifting.
function formatExpira(expira?: string | null) {
  if (!expira) return "—";
  const datePart = String(expira).slice(0, 10);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return String(expira);
  return `${d}/${m}/${y}`;
}

function statusTone(s?: string): "success" | "danger" | "default" {
  if (!s) return "default";
  if (s === "Ativo" || s === "online" || s === "Online") return "success";
  return "danger";
}

function paymentTypeLabel(type?: string) {
  switch (type) {
    case "new_device": return "Novo Aparelho";
    case "renewal": return "Renovação";
    case "reseller_hire": return "Contratação Revenda";
    case "reseller_renewal": return "Renovação Revenda";
    case "reseller_setup": return "Setup Revenda";
    case "reseller_adjustment": return "Ajuste Revenda";
    case "reseller_logins_increase": return "Aumento de Logins";
    default: return type || "Pagamento";
  }
}

function requestTypeLabel(type?: string) {
  switch (type) {
    case "date": return "Alteração de vencimento";
    case "date_correction": return "Correção de vencimento";
    case "username": return "Alteração de usuário";
    case "password": return "Alteração de senha";
    case "uuid": return "Solicitação de UUID";
    case "uuid_correction": return "Correção de UUID";
    default: return type || "Solicitação";
  }
}

function requestStatusTone(s?: string): "success" | "danger" | "warning" | "default" {
  if (s === "aprovado" || s === "confirmado" || s === "realizado") return "success";
  if (s === "rejeitado") return "danger";
  if (s === "aguardando" || s === "aguardando_confirmacao") return "warning";
  return "default";
}

function getAmount(p: any): number {
  try {
    const meta = typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata || {};
    return Number(meta.amount) || 0;
  } catch {
    return 0;
  }
}

// ─── credential row (senha com revelar/copiar) ──────────────────────────────

function SecretValue({ value, mono = true }: { value?: string | null; mono?: boolean }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-sm text-text-muted">—</span>;

  function copy() {
    try {
      navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className={`text-sm font-bold text-text-base truncate ${mono ? "font-mono" : ""}`}>
        {show ? value : "•".repeat(Math.min(String(value).length, 8))}
      </span>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="p-1 rounded text-text-muted hover:text-text-base hover:bg-bg-surface-hover transition-colors shrink-0"
        aria-label={show ? "Ocultar" : "Revelar"}
      >
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      <button
        type="button"
        onClick={copy}
        className="p-1 rounded text-text-muted hover:text-text-base hover:bg-bg-surface-hover transition-colors shrink-0"
        aria-label="Copiar"
      >
        {copied ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
      </button>
    </span>
  );
}

function CollapsibleCard({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-bg-surface-hover"
      >
        <span className="text-sm font-bold text-text-base">
          {title} ({count})
        </span>
        {open ? (
          <ChevronUp size={14} className="text-text-muted" />
        ) : (
          <ChevronDown size={14} className="text-text-muted" />
        )}
      </button>
      {open && <div className="divide-y divide-border-base border-t border-border-base">{children}</div>}
    </Card>
  );
}

// ─── conteúdo completo da ficha ─────────────────────────────────────────────

export interface UserDetailContentProps {
  data: any;
  navigateTo?: (tab: AdminTab) => void;
  /** chamado após excluir o cliente (fechar drawer / limpar busca) */
  onDeleted?: () => void;
}

export function UserDetailContent({ data, navigateTo, onDeleted }: UserDetailContentProps) {
  const toast = useToast();
  const [updatingAccess, setUpdatingAccess] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const u = data?.user;
  const payments: any[] = data?.payments || [];
  const approvedPayments = payments.filter((p) => p.status === "approved");
  const groupMembers: any[] = data?.groupMembers || [];
  const changeRequests: any[] = data?.changeRequests || [];
  const refunds: any[] = data?.refunds || [];
  const tickets: any[] = data?.tickets || [];
  const referrals: any[] = data?.referrals || [];

  // Todos os aparelhos do plano: o próprio usuário + demais membros do grupo
  const allDevices = u
    ? [{ username: u.login, ...u }, ...groupMembers]
    : groupMembers;

  // Dados para a confirmação inteligente do "Renovar +30 dias":
  // o painel soma 30 dias sobre o vencimento ATUAL (mesmo vencido) e
  // renova apenas este username — não o plano inteiro.
  const renewPreview = (() => {
    const datePart = String(u?.expira || "").slice(0, 10);
    const expiry = datePart ? new Date(`${datePart}T23:59:59`) : null;
    if (!expiry || isNaN(expiry.getTime())) return null;
    const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
    const newExpiry = new Date(expiry);
    newExpiry.setDate(newExpiry.getDate() + 30);
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    return {
      current: fmt(expiry),
      next: fmt(newExpiry),
      daysLeft,
      expiredDays: daysLeft < 0 ? -daysLeft : 0,
      effectiveDays: daysLeft < 0 ? 30 + daysLeft : 30,
    };
  })();

  async function handleUpdateAccess() {
    if (!u) return;
    setUpdatingAccess(true);
    try {
      const res = await renewAdminUser(u.login);
      toast.success("Acesso renovado", res.message);
    } catch (err: any) {
      toast.error("Falha ao renovar", err.message);
    } finally {
      setUpdatingAccess(false);
    }
  }

  async function handleDelete() {
    if (!u) return;
    setDeleting(true);
    try {
      await deleteAdminUser(u.login);
      toast.success("Cliente excluído");
      onDeleted?.();
    } catch (err: any) {
      toast.error("Falha ao excluir", err.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (!u) {
    return (
      <Card padding="md" className="border-danger/30 bg-[var(--danger-soft)]">
        <p className="text-sm font-medium text-danger">
          Usuário não encontrado no painel VPN.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho + credenciais */}
      <Card padding="md" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <User size={16} className="text-primary-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-bold text-text-base font-mono truncate">{u.login}</p>
              <p className="text-xs text-text-muted">
                Vence: <span className="font-mono">{formatExpira(u.expira)}</span>
                {u.limite ? <> · Limite: <span className="font-mono">{u.limite}</span></> : null}
              </p>
            </div>
          </div>
          <Chip tone={statusTone(u.status)} size="sm" uppercase>
            {u.status || "N/A"}
          </Chip>
        </div>

        <div className="rounded-md border border-border-base bg-bg-surface-hover p-3 flex flex-col gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Credenciais</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Usuário</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-sm font-bold font-mono text-text-base">{u.login}</span>
              <button
                type="button"
                onClick={() => { try { navigator.clipboard.writeText(u.login); toast.success("Usuário copiado"); } catch { /* ignore */ } }}
                className="p-1 rounded text-text-muted hover:text-text-base hover:bg-bg-surface-hover transition-colors"
                aria-label="Copiar usuário"
              >
                <Copy size={13} />
              </button>
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Senha</span>
            <SecretValue value={u.senha || u.pass || u.password} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Vencimento</span>
            <span className="text-sm font-bold font-mono text-text-base">{formatExpira(u.expira)}</span>
          </div>
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
            value={String(allDevices.length)}
            icon={<Smartphone size={14} />}
            variant="info"
          />
          <Stat
            label="Pontos"
            value={String(data.points || 0)}
            icon={<Star size={14} />}
            variant="warn"
          />
        </div>

        {data.plan && (
          <div className="rounded-md border border-border-base bg-bg-surface-hover p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Plano atual
            </p>
            <p className="text-sm font-bold text-text-base font-mono">
              {data.plan.plan_months} {data.plan.plan_months === 1 ? "mês" : "meses"} ·{" "}
              {data.plan.plan_devices} {data.plan.plan_devices === 1 ? "aparelho" : "aparelhos"} · R${" "}
              {Number(data.plan.plan_price).toFixed(2).replace(".", ",")}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirmRenew(true)}
            disabled={updatingAccess}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 h-9 text-sm font-bold text-white transition-colors hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60"
          >
            <RefreshCw size={14} className={updatingAccess ? "animate-spin" : ""} />
            Renovar +30 dias
          </button>
          {navigateTo && (
            <button
              type="button"
              onClick={() => navigateTo("tickets")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-base bg-bg-surface px-3 h-9 text-sm font-bold text-text-base hover:bg-bg-surface-hover transition-colors"
            >
              <ExternalLink size={14} />
              Ver tickets
            </button>
          )}
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

      {/* Aparelhos do plano — usuário, senha e vencimento de cada um */}
      {allDevices.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <p className="flex items-center gap-1.5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted border-b border-border-base">
            <Smartphone size={12} /> Aparelhos do plano ({allDevices.length})
          </p>
          <div className="divide-y divide-border-base">
            {allDevices.map((m: any) => (
              <div key={m.username || m.login} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-text-base font-mono truncate">
                    {m.username || m.login}
                    {(m.username || m.login) === u.login && (
                      <span className="ml-1.5 text-[10px] font-bold text-primary-600 uppercase">este</span>
                    )}
                  </p>
                  <Chip tone={statusTone(m.status)} size="sm" uppercase>
                    {m.status || "—"}
                  </Chip>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-muted">Senha</span>
                  <SecretValue value={m.senha || m.pass || m.password} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-muted">Vence</span>
                  <span className="text-xs font-bold font-mono text-text-base">{formatExpira(m.expira)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Histórico de pagamentos */}
      <CollapsibleCard title="Histórico de Pagamentos" count={approvedPayments.length}>
        {approvedPayments.map((p: any) => {
          const amount = getAmount(p);
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-text-base">{paymentTypeLabel(p.type)}</p>
                <p className="text-xs text-text-muted">{formatDate(p.paid_at || p.created_at)}</p>
              </div>
              {amount > 0 && (
                <span className="text-sm font-bold text-primary-600">
                  R$ {amount.toFixed(2).replace(".", ",")}
                </span>
              )}
            </div>
          );
        })}
      </CollapsibleCard>

      {/* Solicitações */}
      <CollapsibleCard title="Solicitações" count={changeRequests.length}>
        {changeRequests.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-base truncate">{requestTypeLabel(r.type)}</p>
              <p className="text-xs text-text-muted font-mono truncate">
                {r.requested_value ? `→ ${r.requested_value} · ` : ""}{formatDate(r.created_at)}
              </p>
            </div>
            <Chip tone={requestStatusTone(r.status)} size="sm" uppercase>
              {r.status || "—"}
            </Chip>
          </div>
        ))}
      </CollapsibleCard>

      {/* Reembolsos */}
      <CollapsibleCard title="Reembolsos" count={refunds.length}>
        {refunds.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-base truncate">
                PIX {r.pix_type}: <span className="font-mono">{r.pix_key}</span>
              </p>
              <p className="text-xs text-text-muted">{formatDate(r.created_at)}</p>
            </div>
            <Chip tone={requestStatusTone(r.status)} size="sm" uppercase>
              {r.status || "—"}
            </Chip>
          </div>
        ))}
      </CollapsibleCard>

      {/* Tickets */}
      <CollapsibleCard title="Tickets de Suporte" count={tickets.length}>
        {tickets.map((t: any) => (
          <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-base truncate flex items-center gap-1.5">
                <LifeBuoy size={13} className="text-text-muted shrink-0" />
                {t.subject}
              </p>
              <p className="text-xs text-text-muted">{t.category} · {formatDate(t.created_at)}</p>
            </div>
            <Chip tone={t.status === "closed" ? "default" : t.status === "answered" ? "success" : "warning"} size="sm" uppercase>
              {t.status === "closed" ? "Fechado" : t.status === "answered" ? "Respondido" : "Aberto"}
            </Chip>
          </div>
        ))}
      </CollapsibleCard>

      {/* Indicações */}
      <CollapsibleCard title="Indicações" count={referrals.length}>
        {referrals.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-medium text-text-base font-mono">{r.referred_username}</p>
            <Chip tone={r.status === "bonus_received" ? "success" : "warning"} size="sm" uppercase>
              {r.status === "bonus_received" ? "Bônus dado" : "Aguardando"}
            </Chip>
          </div>
        ))}
      </CollapsibleCard>

      <ConfirmDialog
        isOpen={confirmRenew}
        title="Renovar +30 dias"
        message={
          <div className="flex flex-col gap-2 text-left">
            <p>
              Adicionar <strong className="text-text-base">30 dias</strong> no painel para{" "}
              <strong className="font-mono text-text-base">{u.login}</strong>?
            </p>
            {renewPreview ? (
              <p>
                Vencimento: <span className="font-mono font-bold text-text-base">{renewPreview.current}</span>
                {" → "}
                <span className="font-mono font-bold text-[var(--success)]">{renewPreview.next}</span>
              </p>
            ) : (
              <p>Não foi possível ler o vencimento atual no painel.</p>
            )}
            {renewPreview && renewPreview.expiredDays > 0 && (
              <p className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-2 text-xs font-medium text-[var(--warning)]">
                ⚠️ Vencido há {renewPreview.expiredDays} dia(s): o painel soma a partir da data vencida, então o cliente ganhará{" "}
                {renewPreview.effectiveDays > 0
                  ? `apenas ${renewPreview.effectiveDays} dia(s) reais de acesso.`
                  : "0 dias — o acesso continuará vencido mesmo após esta renovação."}
              </p>
            )}
            {groupMembers.length > 0 && (
              <p className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-2 text-xs font-medium text-[var(--warning)]">
                ⚠️ Este plano tem mais {groupMembers.length} aparelho(s) que <strong>não</strong> serão renovados por este botão — renove cada um pela ficha, se necessário.
              </p>
            )}
            <p className="text-xs">Nenhum pagamento será registrado — ação manual de cortesia/suporte.</p>
          </div>
        }
        onConfirm={handleUpdateAccess}
        onCancel={() => setConfirmRenew(false)}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Excluir Cliente"
        message={`Tem certeza que deseja excluir "${u.login}" do sistema? Isso removerá todos os dados (pagamentos, dispositivos, histórico). O acesso no painel VPN deve ser removido manualmente.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ─── drawer: ficha completa sem sair da aba atual ───────────────────────────

export interface UserDetailDrawerProps {
  username: string | null;
  onClose: () => void;
  navigateTo?: (tab: AdminTab) => void;
}

export function UserDetailDrawer({ username, onClose, navigateTo }: UserDetailDrawerProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) {
      setData(null);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    fetchAdminUserDetails(username)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: any) => { if (!cancelled) setError(e.message || "Erro ao carregar usuário"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username]);

  if (!username) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        className="flex h-[92dvh] w-full flex-col rounded-t-xl bg-bg-base sm:h-full sm:max-w-md sm:rounded-none sm:border-l sm:border-border-base"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-base bg-bg-surface px-4 py-3 shrink-0">
          <p className="text-sm font-bold text-text-base">
            Ficha do cliente · <span className="font-mono text-primary-600">{username}</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-text-muted hover:text-text-base hover:bg-bg-surface-hover transition-colors"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {error && (
            <Card padding="md" className="border-danger/30 bg-[var(--danger-soft)]">
              <p className="text-sm font-medium text-danger">{error}</p>
            </Card>
          )}
          {!loading && !error && data && (
            <UserDetailContent
              data={data}
              navigateTo={navigateTo}
              onDeleted={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
