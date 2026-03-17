import React, { useState } from "react";
import { Search, RefreshCw, Send, X, Pencil, Trash2, Check } from "lucide-react";
import { fetchAdminTickets, fetchTicketMessages, sendTicketMessage, updateTicketStatus, fetchAdminUserDetails, editTicketMessage, deleteTicketMessage } from "../../services/api";
import type { Ticket, TicketMessage, AdminTab } from "../../types";

interface Props {
  allTickets: any[];
  setAllTickets: (t: any[]) => void;
  navigateTo: (tab: AdminTab) => void;
}

function formatDate(dateString: string) {
  if (!dateString) return "N/A";
  let s = dateString;
  if (s.includes(" ") && !s.includes("T")) { s = s.replace(" ", "T"); if (!s.endsWith("Z")) s += "Z"; }
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AdminTickets({ allTickets, setAllTickets, navigateTo }: Props) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState("");
  const [userDetails, setUserDetails] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setAllTickets(await fetchAdminTickets()); } catch (err) { console.warn(err); } finally { setLoading(false); }
  }

  async function openTicket(t: any) {
    setSelectedTicket(t);
    try {
      const msgs = await fetchTicketMessages(t.id);
      setMessages(msgs);
    } catch (err) { console.warn(err); }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTicket) return;
    setSending(true);
    try {
      await sendTicketMessage(selectedTicket.id, "admin", newMessage.trim());
      setNewMessage("");
      const msgs = await fetchTicketMessages(selectedTicket.id);
      setMessages(msgs);
      await refresh();
      setSelectedTicket((t: any) => t ? { ...t, status: "answered" } : t);
    } catch (err) { console.warn(err); } finally { setSending(false); }
  }

  async function handleEditMsg(messageId: string) {
    const trimmed = editingMsgText.trim();
    if (!trimmed || !selectedTicket) return;
    try {
      await editTicketMessage(messageId, trimmed);
      setEditingMsgId(null);
      setEditingMsgText("");
      setMessages(await fetchTicketMessages(selectedTicket.id));
    } catch (err) { console.warn(err); }
  }

  async function handleDeleteMsg(messageId: string) {
    try {
      await deleteTicketMessage(messageId);
      setMessages(prev => prev.filter((m: TicketMessage) => m.id !== messageId));
    } catch (err) { console.warn(err); }
  }

  async function handleClose() {
    if (!selectedTicket) return;
    try {
      await updateTicketStatus(selectedTicket.id, "closed");
      setSelectedTicket(null);
      await refresh();
    } catch (err) { console.warn(err); }
  }

  async function loadUserDetails(username: string) {
    try {
      const data = await fetchAdminUserDetails(username);
      setUserDetails(data);
      setShowUserModal(true);
    } catch (err) { console.warn(err); }
  }

  const filtered = allTickets
    .filter(t => filterStatus === "all" || t.status === filterStatus)
    .filter(t => t.username?.toLowerCase().includes(search.toLowerCase()));

  if (selectedTicket) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden p-5 space-y-4">
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setSelectedTicket(null)} className="p-2 rounded-xl hover:bg-bg-surface-hover transition-colors">
            <X className="w-4 h-4 text-text-muted" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-text-base truncate">{selectedTicket.subject}</p>
            <p className="text-xs text-text-muted">{selectedTicket.username} · {selectedTicket.category}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => loadUserDetails(selectedTicket.username)}
              className="text-xs text-primary-600 hover:text-primary-700 border border-primary-200 bg-primary-50 px-3 py-1.5 rounded-xl font-bold"
            >
              Ver Usuário
            </button>
            {selectedTicket.status !== "closed" && (
              <button
                onClick={handleClose}
                className="text-xs text-red-600 hover:text-red-700 border border-red-200 bg-red-50 px-3 py-1.5 rounded-xl font-bold"
              >
                Fechar
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((msg: TicketMessage) => {
            const isAdmin = msg.sender === "admin";
            const isEditing = editingMsgId === msg.id;
            const canAct = isAdmin && selectedTicket.status !== "closed";
            return (
              <div key={msg.id} className={`group flex flex-col ${isAdmin ? "items-end" : "items-start"}`}>
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                  isAdmin
                    ? "bg-primary-600 text-white rounded-br-sm"
                    : "bg-bg-surface border border-border-base/50 text-text-base rounded-bl-sm"
                }`}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingMsgText}
                        onChange={e => setEditingMsgText(e.target.value)}
                        className="w-full text-sm bg-white/20 rounded-xl px-3 py-2 outline-none resize-none border border-white/30 focus:border-white/60 min-h-[60px]"
                        autoFocus
                        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditMsg(msg.id); }
                          if (e.key === "Escape") { setEditingMsgId(null); setEditingMsgText(""); }
                        }}
                      />
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => { setEditingMsgId(null); setEditingMsgText(""); }} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors font-medium">Cancelar</button>
                        <button onClick={() => handleEditMsg(msg.id)} disabled={!editingMsgText.trim()} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/30 hover:bg-white/40 transition-colors font-bold disabled:opacity-40 flex items-center gap-1"><Check className="w-3 h-3" />Salvar</button>
                      </div>
                    </div>
                  ) : (
                    <p className="font-medium leading-relaxed">{msg.message}</p>
                  )}
                  {!isEditing && (
                    <p className={`text-[10px] mt-1 ${isAdmin ? "text-primary-200" : "text-text-muted"}`}>
                      {isAdmin ? "Admin" : msg.sender} · {formatDate(msg.created_at)}
                    </p>
                  )}
                </div>
                {canAct && !isEditing && (
                  <div className="flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingMsgId(msg.id); setEditingMsgText(msg.message); }} className="p-1 rounded-md text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Editar"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => handleDeleteMsg(msg.id)} className="p-1 rounded-md text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors" title="Excluir"><Trash2 className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedTicket.status !== "closed" && (
          <form onSubmit={handleSend} className="flex gap-2 shrink-0">
            <input
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Responder como admin..."
              className="flex-1 px-4 py-3 rounded-xl border border-border-base text-sm outline-none focus:ring-2 focus:ring-primary-500/50 bg-bg-surface"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="bg-primary-600 hover:bg-primary-700 text-white p-3 rounded-xl transition-colors active:scale-95 disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* User modal */}
        {showUserModal && userDetails && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowUserModal(false)}>
            <div className="bg-bg-surface rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <p className="font-bold text-text-base">{userDetails.user?.login || selectedTicket.username}</p>
                <button onClick={() => setShowUserModal(false)}><X className="w-4 h-4 text-text-muted" /></button>
              </div>
              <p className="text-sm text-text-muted">Status: {userDetails.user?.status || "N/A"}</p>
              <p className="text-sm text-text-muted">Expira: {userDetails.user?.expira || "N/A"}</p>
              <p className="text-sm text-text-muted">Pagamentos aprovados: {(userDetails.payments || []).filter((p: any) => p.status === "approved").length}</p>
              <p className="text-sm text-text-muted">Pontos: {userDetails.points || 0}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-5 space-y-4">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="font-bold text-text-base">Tickets ({allTickets.length})</h2>
        <button onClick={refresh} disabled={loading} className="p-2 rounded-xl border border-border-base/50 hover:bg-bg-surface-hover transition-colors active:scale-95">
          <RefreshCw className={`w-4 h-4 text-text-muted ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar usuário..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border-base text-sm outline-none focus:ring-2 focus:ring-primary-500/50 bg-bg-surface font-medium"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border-base text-sm outline-none bg-bg-surface font-bold cursor-pointer"
        >
          <option value="all">Todos</option>
          <option value="open">Abertos</option>
          <option value="answered">Respondidos</option>
          <option value="closed">Fechados</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filtered.length === 0 ? (
          <div className="bg-bg-surface/50 border border-border-base/50 p-6 rounded-2xl text-center">
            <p className="text-sm font-medium text-text-muted">Nenhum ticket encontrado.</p>
          </div>
        ) : (
          filtered.map(t => (
            <div
              key={t.id}
              onClick={() => openTicket(t)}
              className="bg-bg-surface border border-border-base/50 p-4 rounded-2xl cursor-pointer hover:border-primary-400 hover:shadow-md transition-all shadow-sm group"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center overflow-hidden pr-2">
                  {t.status === "open" && (
                    <span className="flex h-2.5 w-2.5 relative mr-2.5 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                    </span>
                  )}
                  <h3 className="font-bold text-text-base truncate group-hover:text-primary-600 transition-colors">{t.subject}</h3>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-lg flex-shrink-0 font-bold border ${
                  t.status === "open" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  t.status === "answered" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  "bg-bg-surface-hover text-text-muted border-border-base"
                }`}>
                  {t.status === "open" ? "Aguardando" : t.status === "answered" ? "Respondido" : "Fechado"}
                </span>
              </div>
              <div className="flex justify-between text-xs text-text-muted font-medium items-end mt-3">
                <span className="bg-bg-surface-hover px-2 py-1 rounded-md border border-border-base/50">{t.username} · {t.category}</span>
                <span>{formatDate(t.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
