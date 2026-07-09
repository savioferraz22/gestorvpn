import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Search, Users } from "lucide-react";
import { fetchAdminUserDetails, fetchAdminUsersList } from "../../services/api";
import type { AdminTab } from "../../types";
import { Card, Chip, Empty, SectionHeader, Skeleton, Stat } from "./ui";
import { UserDetailContent } from "./UserDetailPanel";

interface Props {
  navigateTo: (tab: AdminTab) => void;
}

// VPN panel "expira" is local time — format the date part without shifting.
function formatExpira(expira?: string | null) {
  if (!expira) return "—";
  const [y, m, d] = String(expira).slice(0, 10).split("-");
  if (!y || !m || !d) return String(expira);
  return `${d}/${m}/${y}`;
}

function statusTone(s?: string): "success" | "danger" | "default" {
  if (!s) return "default";
  if (s === "Ativo" || s === "online" || s === "Online") return "success";
  return "danger";
}

function isExpired(expira?: string | null): boolean {
  if (!expira) return false;
  const d = new Date(String(expira).slice(0, 10) + "T23:59:59");
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

export function AdminUsers({ navigateTo }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [query, setQuery] = useState("");

  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function loadList() {
    setListLoading(true);
    setListError("");
    try {
      setUsers(await fetchAdminUsersList());
    } catch (err: any) {
      setListError(err.message || "Erro ao carregar usuários");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (!selectedUsername) {
      setDetailData(null);
      setDetailError("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    setDetailData(null);
    fetchAdminUserDetails(selectedUsername)
      .then((d) => { if (!cancelled) setDetailData(d); })
      .catch((e: any) => { if (!cancelled) setDetailError(e.message || "Erro ao carregar usuário"); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedUsername]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => String(u.login || "").toLowerCase().includes(q));
  }, [users, query]);

  const counts = useMemo(() => {
    let active = 0;
    let expired = 0;
    for (const u of users) {
      if (isExpired(u.expira)) expired++;
      else active++;
    }
    return { active, expired };
  }, [users]);

  // ── Detail view ──
  if (selectedUsername) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedUsername(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-base bg-bg-surface px-3 text-sm font-bold text-text-base hover:bg-bg-surface-hover transition-colors"
            >
              <ArrowLeft size={14} />
              Voltar
            </button>
            <SectionHeader
              title={selectedUsername}
              subtitle="Ficha completa do cliente"
            />
          </div>

          {detailLoading && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}
          {detailError && (
            <Card padding="md" className="border-danger/30 bg-[var(--danger-soft)]">
              <p className="text-sm font-medium text-danger">{detailError}</p>
            </Card>
          )}
          {!detailLoading && !detailError && detailData && (
            <UserDetailContent
              data={detailData}
              navigateTo={navigateTo}
              onDeleted={() => {
                setSelectedUsername(null);
                loadList();
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <SectionHeader
          title="Usuários"
          subtitle="Todos os clientes do painel — clique para abrir a ficha completa"
          actions={
            <button
              type="button"
              onClick={loadList}
              disabled={listLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-base bg-bg-surface text-text-muted hover:bg-bg-surface-hover hover:text-text-base transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={listLoading ? "animate-spin" : ""} />
            </button>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total" value={String(users.length)} icon={<Users size={14} />} variant="accent" />
          <Stat label="Ativos" value={String(counts.active)} variant="info" />
          <Stat label="Vencidos" value={String(counts.expired)} variant={counts.expired > 0 ? "warn" : "default"} />
        </div>

        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por username… (busca parcial)"
            autoFocus
            className="w-full rounded-md border border-border-base bg-bg-surface h-11 pl-9 pr-3 text-sm font-mono outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 transition-colors"
          />
        </div>

        {listError && (
          <Card padding="md" className="border-danger/30 bg-[var(--danger-soft)]">
            <p className="text-sm font-medium text-danger">{listError}</p>
          </Card>
        )}

        {listLoading && users.length === 0 && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!listLoading && filtered.length === 0 && !listError && (
          <Empty title={query ? "Nenhum usuário encontrado" : "Nenhum usuário no painel"} />
        )}

        {filtered.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-border-base">
              {filtered.slice(0, 100).map((u) => (
                <button
                  key={u.login}
                  type="button"
                  onClick={() => setSelectedUsername(u.login)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-bg-surface-hover"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-base font-mono truncate">{u.login}</p>
                    <p className="text-xs text-text-muted font-mono">
                      Vence: {formatExpira(u.expira)}
                    </p>
                  </div>
                  <Chip tone={isExpired(u.expira) ? "danger" : statusTone(u.status)} size="sm" uppercase>
                    {isExpired(u.expira) ? "Vencido" : u.status || "—"}
                  </Chip>
                </button>
              ))}
            </div>
            {filtered.length > 100 && (
              <p className="border-t border-border-base px-4 py-2.5 text-xs text-text-muted">
                Mostrando 100 de {filtered.length} — refine a busca para ver os demais.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
