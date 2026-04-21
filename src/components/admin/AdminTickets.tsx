import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, RefreshCw, Send, Trash2, X } from "lucide-react";
import {
  deleteTicketMessage,
  editTicketMessage,
  fetchAdminTickets,
  fetchAdminUserDetails,
  fetchTicketMessages,
  sendTicketMessage,
  updateTicketStatus,
} from "../../services/api";
import type { AdminTab, TicketMessage } from "../../types";
import { Card, Chip, Empty, SectionHeader, Stat, useToast } from "./ui";
import { FilterBar, FilterSelect, SearchInput, useUrlState } from "./filters";

interface Props {
  allTickets: any[];
  setAllTickets: (t: any[]) => void;
  navigateTo: (tab: AdminTab) => void;
}

function formatDate(s: string | undefined) {
  if (!s) return "—";
  let iso = s;
  if (iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
    if (!iso.endsWith("Z")) iso += "Z";
  }
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_OPTIONS = [
  { value: "all", label: "Todos status" },
  { value: "open", label: "Abertos" },
  { value: "answered", label: "Respondidos" },
  { value: "closed", label: "Fechados" },
] as const;

type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

function statusTone(s: string): "success" | "warning" | "info" | "default" {
  if (s === "open") return "warning";
  if (s === "answered") return "info";
  return "default";
}

function statusLabel(s: string): string {
  if (s === "open") return "Aguardando";
  if (s === "answered") return "Respondido";
  if (s === "closed") return "Fechado";
  return s;
}

export function AdminTickets({ allTickets, setAllTickets }: Props) {
  const toast = useToast();
  const { state, update, reset, isDirty } = useUrlState("tickets", {
    q: "",
    status: "open" as StatusValue,
  });

  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState("");
  const [userDetails, setUserDetails] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return allTickets.filter((t) => {
      if (state.status !== "all" && t.status !== state.status) return false;
      if (q) {
        const hay = `${t.username ?? ""} ${t.subject ?? ""} ${t.category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allTickets, state]);

  const selected = useMemo(
    () => allTickets.find((t) => t.id === selectedId) ?? null,
    [allTickets, selectedId],
  );

  const counts = useMemo(() => {
    let open = 0;
    let answered = 0;
    let closed = 0;
    for (const t of allTickets) {
      if (t.status === "open") open++;
      else if (t.status === "answered") answered++;
      else if (t.status === "closed") closed++;
    }
    return { open, answered, closed };
  }, [allTickets]);

  async function refresh() {
    setLoading(true);
    try {
      setAllTickets(await fetchAdminTickets());
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  async function openTicket(id: string) {
    setSelectedId(id);
    try {
      setMessages(await fetchTicketMessages(id));
    } catch (err) {
      console.warn(err);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    const ref = messagesEndRef.current;
    if (ref) ref.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, selectedId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key !== "j" && e.key !== "k" && e.key !== "Escape") return;
      if (e.key === "Escape") {
        if (selectedId) setSelectedId(null);
        return;
      }
      if (filtered.length === 0) return;
      const idx = selectedId ? filtered.findIndex((t) => t.id === selectedId) : -1;
      const next = e.key === "j" ? idx + 1 : idx - 1;
      const clamped = Math.max(0, Math.min(filtered.length - 1, next));
      const target2 = filtered[clamped];
      if (target2) void openTicket(target2.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selected) return;
    setSending(true);
    try {
      await sendTicketMessage(selected.id, "admin", newMessage.trim());
      setNewMessage("");
      setMessages(await fetchTicketMessages(selected.id));
      await refresh();
    } catch (err) {
      console.warn(err);
    } finally {
      setSending(false);
    }
  }

  async function handleEditMsg(messageId: string) {
    const trimmed = editingMsgText.trim();
    if (!trimmed || !selected) return;
    try {
      await editTicketMessage(messageId, trimmed);
      setEditingMsgId(null);
      setEditingMsgText("");
      setMessages(await fetchTicketMessages(selected.id));
    } catch (err) {
      console.warn(err);
    }
  }

  async function handleDeleteMsg(messageId: string) {
    try {
      await deleteTicketMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.warn(err);
    }
  }

  async function handleClose() {
    if (!selected) return;
    try {
      await updateTicketStatus(selected.id, "closed");
      await refresh();
      toast.success("Ticket fechado");
    } catch (err) {
      console.warn(err);
      toast.error("Falha ao fechar ticket", err instanceof Error ? err.message : undefined);
    }
  }

  async function loadUserDetails(username: string) {
    try {
      const data = await fetchAdminUserDetails(username);
      setUserDetails(data);
      setShowUserModal(true);
    } catch (err) {
      console.warn(err);
    }
  }

  const chips = [
    state.status !== "open" && {
      id: "status",
      label: `Status: ${STATUS_OPTIONS.find((o) => o.value === state.status)?.label}`,
      onRemove: () => update("status", "open" as StatusValue),
    },
  ].filter(Boolean) as { id: string; label: string; onRemove: () => void }[];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto grid min-h-0 w-full max-w-7xl flex-1 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-4 overflow-hidden p-4 sm:p-6">
        <SectionHeader
          title="Tickets"
          subtitle={
            counts.open > 0
              ? `${counts.open} aguardando`
              : `${allTickets.length} ${allTickets.length === 1 ? "ticket" : "tickets"}`
          }
          actions={
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-base/60 bg-bg-surface text-text-muted shadow-[var(--shadow-card-sm)] hover:bg-bg-surface-hover disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Abertos" value={String(counts.open)} variant={counts.open > 0 ? "warn" : "default"} />
          <Stat label="Respondidos" value={String(counts.answered)} variant="info" />
          <Stat label="Fechados" value={String(counts.closed)} variant="default" />
          <Stat label="Total" value={String(allTickets.length)} variant="accent" />
        </div>

        <FilterBar
          search={
            <SearchInput
              value={state.q}
              onChange={(v) => update("q", v)}
              placeholder="Buscar por usuário, assunto, categoria..."
            />
          }
          filters={
            <FilterSelect
              label="Status"
              value={state.status}
              options={STATUS_OPTIONS as any}
              onChange={(v) => update("status", v)}
            />
          }
          chips={chips}
          onReset={isDirty ? reset : undefined}
          total={allTickets.length}
          filtered={filtered.length}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 md:w-[22rem] md:flex-none">
            {filtered.length === 0 ? (
              <Empty title={isDirty ? "Nenhum ticket com esse filtro" : "Nenhum ticket"} />
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((t) => {
                  const active = t.id === selectedId;
                  return (
                    <Card
                      key={t.id}
                      padding="sm"
                      interactive
                      onClick={() => openTicket(t.id)}
                      className={`flex flex-col gap-1.5 ${active ? "border-primary-500/60 ring-2 ring-[var(--ring-focus)]" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-bold text-text-base">
                          {t.subject}
                        </p>
                        <Chip tone={statusTone(t.status)} size="sm" uppercase>
                          {statusLabel(t.status)}
                        </Chip>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-text-muted">
                        <span className="truncate">
                          {t.username} · {t.category}
                        </span>
                        <span className="shrink-0">{formatDate(t.created_at)}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hidden min-h-0 md:flex md:flex-1 md:flex-col md:overflow-hidden">
            {selected ? (
              <TicketThread
                ticket={selected}
                messages={messages}
                newMessage={newMessage}
                setNewMessage={setNewMessage}
                sending={sending}
                editingMsgId={editingMsgId}
                editingMsgText={editingMsgText}
                setEditingMsgId={setEditingMsgId}
                setEditingMsgText={setEditingMsgText}
                onSend={handleSend}
                onEdit={handleEditMsg}
                onDelete={handleDeleteMsg}
                onClose={handleClose}
                onViewUser={() => loadUserDetails(selected.username)}
                messagesEndRef={messagesEndRef}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border-base/60 bg-bg-surface/40 p-8 text-center">
                <div>
                  <p className="text-sm font-bold text-text-base">Selecione um ticket</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Use <kbd className="rounded bg-bg-surface-hover px-1">J</kbd>/<kbd className="rounded bg-bg-surface-hover px-1">K</kbd> para navegar · <kbd className="rounded bg-bg-surface-hover px-1">Esc</kbd> fecha
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-x-0 top-0 z-40 flex flex-col bg-bg-base md:hidden"
          style={{ height: "100dvh" }}
        >
          <TicketThread
            ticket={selected}
            messages={messages}
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            sending={sending}
            editingMsgId={editingMsgId}
            editingMsgText={editingMsgText}
            setEditingMsgId={setEditingMsgId}
            setEditingMsgText={setEditingMsgText}
            onSend={handleSend}
            onEdit={handleEditMsg}
            onDelete={handleDeleteMsg}
            onClose={handleClose}
            onViewUser={() => loadUserDetails(selected.username)}
            onBack={() => setSelectedId(null)}
            messagesEndRef={messagesEndRef}
          />
        </div>
      )}

      {showUserModal && userDetails && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setShowUserModal(false)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl bg-bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold text-text-base">
                {userDetails.user?.login || selected?.username}
              </p>
              <button onClick={() => setShowUserModal(false)}>
                <X className="h-4 w-4 text-text-muted" />
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Status: {userDetails.user?.status || "N/A"}
            </p>
            <p className="text-sm text-text-muted">
              Expira: {userDetails.user?.expira || "N/A"}
            </p>
            <p className="text-sm text-text-muted">
              Pagamentos aprovados:{" "}
              {(userDetails.payments || []).filter((p: any) => p.status === "approved").length}
            </p>
            <p className="text-sm text-text-muted">Pontos: {userDetails.points || 0}</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ThreadProps {
  ticket: any;
  messages: TicketMessage[];
  newMessage: string;
  setNewMessage: (v: string) => void;
  sending: boolean;
  editingMsgId: string | null;
  editingMsgText: string;
  setEditingMsgId: (v: string | null) => void;
  setEditingMsgText: (v: string) => void;
  onSend: (e: React.FormEvent) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onViewUser: () => void;
  onBack?: () => void;
  messagesEndRef: React.MutableRefObject<HTMLDivElement | null>;
}

function TicketThread({
  ticket,
  messages,
  newMessage,
  setNewMessage,
  sending,
  editingMsgId,
  editingMsgText,
  setEditingMsgId,
  setEditingMsgText,
  onSend,
  onEdit,
  onDelete,
  onClose,
  onViewUser,
  onBack,
  messagesEndRef,
}: ThreadProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-base/60 bg-bg-surface shadow-[var(--shadow-card-sm)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-border-base/60 p-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-bg-surface-hover"
          >
            <X size={14} className="text-text-muted" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text-base">{ticket.subject}</p>
          <p className="truncate text-[11px] text-text-muted">
            {ticket.username} · {ticket.category}
          </p>
        </div>
        <Chip tone={statusTone(ticket.status)} size="sm" uppercase>
          {statusLabel(ticket.status)}
        </Chip>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onViewUser}
            className="rounded-lg border border-border-base/60 bg-bg-surface px-2.5 py-1 text-[11px] font-bold text-text-base hover:bg-bg-surface-hover"
          >
            Usuário
          </button>
          {ticket.status !== "closed" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger hover:bg-danger/20"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((msg) => {
          const isAdmin = msg.sender === "admin";
          const isEditing = editingMsgId === msg.id;
          const canAct = isAdmin && ticket.status !== "closed";
          return (
            <div
              key={msg.id}
              className={`group flex flex-col ${isAdmin ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  isAdmin
                    ? "rounded-br-sm bg-primary-600 text-white"
                    : "rounded-bl-sm border border-border-base/50 bg-bg-surface-hover/40 text-text-base"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingMsgText}
                      onChange={(e) => setEditingMsgText(e.target.value)}
                      autoFocus
                      className="min-h-[60px] w-full resize-none rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none focus:border-white/60"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onEdit(msg.id);
                        }
                        if (e.key === "Escape") {
                          setEditingMsgId(null);
                          setEditingMsgText("");
                        }
                      }}
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setEditingMsgId(null);
                          setEditingMsgText("");
                        }}
                        className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium hover:bg-white/20"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => onEdit(msg.id)}
                        disabled={!editingMsgText.trim()}
                        className="inline-flex items-center gap-1 rounded-lg bg-white/30 px-2.5 py-1 text-[11px] font-bold hover:bg-white/40 disabled:opacity-40"
                      >
                        <Check className="h-3 w-3" />
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap font-medium leading-relaxed">
                    {msg.message}
                  </p>
                )}
                {!isEditing && (
                  <p className={`mt-1 text-[10px] ${isAdmin ? "text-primary-200" : "text-text-muted"}`}>
                    {isAdmin ? "Admin" : msg.sender} · {formatDate(msg.created_at)}
                  </p>
                )}
              </div>
              {canAct && !isEditing && (
                <div className="mt-0.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    onClick={() => {
                      setEditingMsgId(msg.id);
                      setEditingMsgText(msg.message);
                    }}
                    className="rounded-md p-1 text-text-muted hover:bg-primary-50 hover:text-primary-600"
                    title="Editar"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onDelete(msg.id)}
                    className="rounded-md p-1 text-text-muted hover:bg-danger/10 hover:text-danger"
                    title="Excluir"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {ticket.status !== "closed" && (
        <form
          onSubmit={onSend}
          className="flex shrink-0 gap-2 border-t border-border-base/60 p-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Responder como admin..."
            className="flex-1 rounded-xl border border-border-base/60 bg-bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary-500/70 focus:ring-2 focus:ring-[var(--ring-focus)]"
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white transition-transform hover:bg-primary-700 active:scale-95 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}
