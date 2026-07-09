import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  ClipboardList,
  CreditCard,
  Download,
  Gift,
  KeyRound,
  LifeBuoy,
  Link2,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Smartphone,
  Store,
  Trash2,
  UserPlus,
  Wrench,
} from "lucide-react";
import { fetchAdminLogs, type ActivityLog } from "../../services/api";
import { Card, Chip, Empty, SectionHeader, Skeleton, Stat } from "./ui";
import { DateRangePicker, FilterBar, FilterSelect, SearchInput, useUrlState, type DateRange } from "./filters";
import { UserDetailDrawer } from "./UserDetailPanel";

// ─── categorias e tipos de evento ────────────────────────────────────────────

const CATEGORIES = [
  { value: "all", label: "Todas categorias", types: [] as string[] },
  { value: "pagamentos", label: "Pagamentos", types: ["pix_generated", "payment_approved", "payment_vpn_failed", "payment_recovered", "renewal_deficit_compensated"] },
  { value: "testes", label: "Testes e acessos", types: ["trial_created", "device_trusted"] },
  { value: "aparelhos", label: "Aparelhos e planos", types: ["device_created", "free_device_added", "device_linked", "device_removed", "plan_changed"] },
  { value: "solicitacoes", label: "Solicitações", types: ["change_request_created", "change_request_approved", "change_request_rejected"] },
  { value: "reembolsos", label: "Reembolsos", types: ["refund_requested", "refund_approved", "refund_rejected"] },
  { value: "suporte", label: "Suporte", types: ["ticket_created", "ticket_answered", "ticket_closed"] },
  { value: "indicacoes", label: "Indicações", types: ["referral_created", "referral_bonus"] },
  { value: "revenda", label: "Revenda", types: ["reseller_hired", "reseller_renewed", "reseller_setup"] },
  { value: "admin", label: "Ações do admin", types: ["admin_renew_user", "admin_delete_user", "admin_reseller_adjust", "admin_notice_updated"] },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

const ACTOR_OPTIONS = [
  { value: "all", label: "Todos autores" },
  { value: "client", label: "Cliente" },
  { value: "reseller", label: "Revendedor" },
  { value: "admin", label: "Admin" },
  { value: "system", label: "Sistema" },
] as const;

type ActorValue = (typeof ACTOR_OPTIONS)[number]["value"];

interface EventStyle {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "success" | "warning" | "danger" | "info" | "primary" | "purple" | "default";
  label: string;
}

const EVENT_STYLES: Record<string, EventStyle> = {
  pix_generated: { icon: QrCode, tone: "info", label: "PIX gerado" },
  payment_approved: { icon: CreditCard, tone: "success", label: "Pagamento" },
  payment_vpn_failed: { icon: AlertTriangle, tone: "danger", label: "Falha VPN" },
  payment_recovered: { icon: RotateCcw, tone: "warning", label: "Recuperado" },
  renewal_deficit_compensated: { icon: BadgeCheck, tone: "warning", label: "Compensação" },
  trial_created: { icon: UserPlus, tone: "purple", label: "Teste grátis" },
  device_trusted: { icon: KeyRound, tone: "default", label: "Acesso liberado" },
  device_created: { icon: Smartphone, tone: "success", label: "Aparelho novo" },
  free_device_added: { icon: Smartphone, tone: "info", label: "Aparelho grátis" },
  device_linked: { icon: Link2, tone: "info", label: "Vinculado" },
  device_removed: { icon: Trash2, tone: "warning", label: "Removido" },
  plan_changed: { icon: ClipboardList, tone: "primary", label: "Plano alterado" },
  change_request_created: { icon: ClipboardList, tone: "warning", label: "Solicitação" },
  change_request_approved: { icon: BadgeCheck, tone: "success", label: "Aprovada" },
  change_request_rejected: { icon: AlertTriangle, tone: "danger", label: "Rejeitada" },
  refund_requested: { icon: RefreshCw, tone: "warning", label: "Reembolso" },
  refund_approved: { icon: BadgeCheck, tone: "success", label: "Reembolsado" },
  refund_rejected: { icon: AlertTriangle, tone: "danger", label: "Reemb. negado" },
  ticket_created: { icon: LifeBuoy, tone: "warning", label: "Ticket aberto" },
  ticket_answered: { icon: LifeBuoy, tone: "info", label: "Respondido" },
  ticket_closed: { icon: LifeBuoy, tone: "default", label: "Ticket fechado" },
  referral_created: { icon: Gift, tone: "purple", label: "Indicação" },
  referral_bonus: { icon: Gift, tone: "success", label: "Bônus dado" },
  reseller_hired: { icon: Store, tone: "success", label: "Revenda nova" },
  reseller_renewed: { icon: Store, tone: "success", label: "Revenda renov." },
  reseller_setup: { icon: Store, tone: "info", label: "Setup revenda" },
  admin_renew_user: { icon: Wrench, tone: "primary", label: "Renovação manual" },
  admin_delete_user: { icon: Trash2, tone: "danger", label: "Cliente excluído" },
  admin_reseller_adjust: { icon: Wrench, tone: "primary", label: "Ajuste revenda" },
  admin_notice_updated: { icon: Bell, tone: "primary", label: "Aviso global" },
};

const FALLBACK_STYLE: EventStyle = { icon: ScrollText, tone: "default", label: "Evento" };

const ACTOR_LABELS: Record<string, string> = {
  client: "Cliente",
  admin: "Admin",
  system: "Sistema",
  reseller: "Revenda",
};

function formatDateTime(s: string) {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

const PAGE_SIZE = 50;

export function AdminLogs() {
  const { state, update, reset, isDirty } = useUrlState("logs", {
    q: "",
    cat: "all" as CategoryValue,
    actor: "all" as ActorValue,
    from: "" as string,
    to: "" as string,
  });
  const dateRange: DateRange = { from: state.from || null, to: state.to || null };

  const [items, setItems] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [viewUsername, setViewUsername] = useState<string | null>(null);
  const [todayStats, setTodayStats] = useState<{ events: number; payments: number; trials: number } | null>(null);

  // debounce da busca por username
  const [debouncedQ, setDebouncedQ] = useState(state.q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(state.q), 400);
    return () => clearTimeout(t);
  }, [state.q]);

  const activeTypes = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.value === state.cat);
    return cat && cat.value !== "all" ? [...cat.types] : [];
  }, [state.cat]);

  const queryKey = `${state.cat}|${state.actor}|${debouncedQ}|${state.from}|${state.to}`;
  const latestQuery = useRef(queryKey);

  useEffect(() => {
    latestQuery.current = queryKey;
    setLoading(true);
    setError("");
    fetchAdminLogs({
      types: activeTypes,
      username: debouncedQ || undefined,
      actor: state.actor !== "all" ? state.actor : undefined,
      from: state.from || undefined,
      to: state.to || undefined,
      limit: PAGE_SIZE,
      offset: 0,
    })
      .then((res) => {
        if (latestQuery.current !== queryKey) return;
        setItems(res.items);
        setTotal(res.total);
        setTableMissing(!!res.tableMissing);
      })
      .catch((e: any) => {
        if (latestQuery.current !== queryKey) return;
        setError(e.message || "Erro ao carregar logs");
      })
      .finally(() => {
        if (latestQuery.current === queryKey) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // contadores de hoje (leves: head count via total)
  useEffect(() => {
    const today = todayISO();
    Promise.all([
      fetchAdminLogs({ from: today, to: today, limit: 1 }),
      fetchAdminLogs({ from: today, to: today, types: ["payment_approved"], limit: 1 }),
      fetchAdminLogs({ from: today, to: today, types: ["trial_created"], limit: 1 }),
    ])
      .then(([all, pay, trial]) => {
        setTodayStats({ events: all.total, payments: pay.total, trials: trial.total });
      })
      .catch(() => setTodayStats(null));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetchAdminLogs({
        types: activeTypes,
        username: debouncedQ || undefined,
        actor: state.actor !== "all" ? state.actor : undefined,
        from: state.from || undefined,
        to: state.to || undefined,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoadingMore(false);
    }
  }

  function exportCsv() {
    const header = ["data_hora", "tipo", "autor", "username", "descricao"];
    const rows = items.map((l) => [
      formatDateTime(l.created_at),
      l.event_type,
      ACTOR_LABELS[l.actor] || l.actor,
      l.username ?? "",
      l.description,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs_${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const chips = [
    state.cat !== "all" && {
      id: "cat",
      label: `Categoria: ${CATEGORIES.find((c) => c.value === state.cat)?.label}`,
      onRemove: () => update("cat", "all" as CategoryValue),
    },
    state.actor !== "all" && {
      id: "actor",
      label: `Autor: ${ACTOR_OPTIONS.find((o) => o.value === state.actor)?.label}`,
      onRemove: () => update("actor", "all" as ActorValue),
    },
  ].filter(Boolean) as { id: string; label: string; onRemove: () => void }[];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader
          title="Logs"
          subtitle="Registro de toda movimentação do aplicativo"
          actions={
            <button
              type="button"
              onClick={exportCsv}
              disabled={items.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-base bg-bg-surface px-2.5 h-8 text-xs font-bold text-text-base hover:bg-bg-surface-hover transition-colors disabled:opacity-50"
              title="Baixar CSV dos logs carregados"
            >
              <Download size={13} /> CSV
            </button>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Eventos hoje" value={todayStats ? String(todayStats.events) : "…"} variant="accent" />
          <Stat label="Pagamentos hoje" value={todayStats ? String(todayStats.payments) : "…"} variant="info" />
          <Stat label="Testes hoje" value={todayStats ? String(todayStats.trials) : "…"} variant="default" />
        </div>

        <FilterBar
          search={
            <SearchInput
              value={state.q}
              onChange={(v) => update("q", v)}
              placeholder="Buscar por username..."
            />
          }
          filters={
            <>
              <FilterSelect
                label="Categoria"
                value={state.cat}
                options={CATEGORIES.map((c) => ({ value: c.value, label: c.label })) as any}
                onChange={(v) => update("cat", v as CategoryValue)}
              />
              <FilterSelect
                label="Autor"
                value={state.actor}
                options={ACTOR_OPTIONS as any}
                onChange={(v) => update("actor", v as ActorValue)}
              />
              <DateRangePicker
                value={dateRange}
                onChange={(r) => {
                  update("from", r.from ?? "");
                  update("to", r.to ?? "");
                }}
              />
            </>
          }
          chips={chips}
          onReset={isDirty ? reset : undefined}
          total={total}
          filtered={items.length}
        />

        {tableMissing && (
          <Card padding="md" className="border-warning/30 bg-[var(--warning-soft)]">
            <p className="text-sm font-medium text-warning">
              A tabela de logs ainda não foi criada no Supabase. Execute o script SQL no SQL Editor
              (tabela <span className="font-mono">activity_logs</span> em{" "}
              <span className="font-mono">supabase_schema.sql</span>) e recarregue esta página.
            </p>
          </Card>
        )}

        {error && (
          <Card padding="md" className="border-danger/30 bg-[var(--danger-soft)]">
            <p className="text-sm font-medium text-danger">{error}</p>
          </Card>
        )}

        {loading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!loading && !error && items.length === 0 && !tableMissing && (
          <Empty title={isDirty ? "Nenhum log com esses filtros" : "Nenhum log registrado ainda"} />
        )}

        {!loading && items.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-border-base">
              {items.map((log) => {
                const style = EVENT_STYLES[log.event_type] || FALLBACK_STYLE;
                const Icon = style.icon;
                return (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-base bg-bg-surface-hover text-text-muted">
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={style.tone} size="sm" uppercase>
                          {style.label}
                        </Chip>
                        <Chip tone="default" size="sm">
                          {ACTOR_LABELS[log.actor] || log.actor}
                        </Chip>
                        {log.username && (
                          <button
                            type="button"
                            onClick={() => setViewUsername(log.username)}
                            className="text-xs font-bold font-mono text-primary-600 hover:underline"
                            title="Abrir ficha do cliente"
                          >
                            {log.username}
                          </button>
                        )}
                        <span className="ml-auto shrink-0 text-[11px] font-mono text-text-muted">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-text-base">{log.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {items.length < total && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full border-t border-border-base px-4 py-3 text-center text-sm font-bold text-primary-600 hover:bg-bg-surface-hover transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Carregando…" : `Carregar mais (${items.length} de ${total})`}
              </button>
            )}
          </Card>
        )}
      </div>

      {/* Ficha completa do cliente — sem sair da aba de logs */}
      <UserDetailDrawer
        username={viewUsername}
        onClose={() => setViewUsername(null)}
      />
    </div>
  );
}
