import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, Users, Smartphone, MessageSquare, CreditCard,
  RefreshCw, ClipboardList, BarChart2, LogOut, ArrowLeft, Menu, X,
  Shield, Store, Bell, BellOff, BellRing
} from "lucide-react";
import type { AdminTab, AdminReports as AdminReportsData } from "../../types";
import {
  fetchAdminDevices, fetchAdminTickets, fetchAdminPayments,
  fetchAdminRefunds, fetchAdminChangeRequests, fetchAdminReports,
  adminLogin, setAdminToken, getAdminToken, ApiError
} from "../../services/api";
import { AdminOverview } from "./AdminOverview";
import { AdminUsers } from "./AdminUsers";
import { AdminDevices } from "./AdminDevices";
import { AdminTickets } from "./AdminTickets";
import { AdminPayments } from "./AdminPayments";
import { AdminRefunds } from "./AdminRefunds";
import { AdminChangeReqs } from "./AdminChangeReqs";
import { AdminReports } from "./AdminReports";
import { AdminResellers } from "./AdminResellers";
import { ConfirmDialog } from "../shared/ConfirmDialog";

interface AdminShellProps {
  onBack: () => void;
}

interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ReactNode;
  badgeKey?: "tickets" | "refunds" | "changes";
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Visão Geral", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "users", label: "Usuários", icon: <Users className="w-4 h-4" /> },
  { id: "resellers", label: "Revendedores", icon: <Store className="w-4 h-4" /> },
  { id: "notifications", label: "Notificações", icon: <Bell className="w-4 h-4" /> },
  { id: "devices", label: "Aparelhos", icon: <Smartphone className="w-4 h-4" /> },
  { id: "tickets", label: "Tickets", icon: <MessageSquare className="w-4 h-4" />, badgeKey: "tickets" },
  { id: "payments", label: "Pagamentos", icon: <CreditCard className="w-4 h-4" /> },
  { id: "refunds", label: "Reembolsos", icon: <RefreshCw className="w-4 h-4" />, badgeKey: "refunds" },
  { id: "change_requests", label: "Alterações", icon: <ClipboardList className="w-4 h-4" />, badgeKey: "changes" },
  { id: "reports", label: "Relatórios", icon: <BarChart2 className="w-4 h-4" /> },
];

function AdminNotifications() {
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!("Notification" in window)) { setPermission("unsupported"); return; }
    setPermission(Notification.permission);
  }, []);

  const urlBase64ToUint8Array = (b64: string) => {
    const padding = "=".repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  };

  const activate = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === "granted") {
        const vapidRes = await fetch("/api/push/vapid-public-key");
        const { publicKey } = await vapidRes.json();
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "__admin__", subscription: sub.toJSON() }),
        });
      }
    } catch (e) { console.error(e); }
    setBusy(false);
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setPermission("default");
    } catch (e) { console.error(e); }
    setBusy(false);
  };

  return (
    <div className="p-6 max-w-md mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-primary-100 rounded-2xl flex items-center justify-center"><Bell className="w-5 h-5 text-primary-600" /></div>
        <div>
          <h2 className="font-bold text-text-base">Notificações Admin</h2>
          <p className="text-xs text-text-muted">Receba alerts de novos tickets, solicitações e pagamentos</p>
        </div>
      </div>
      {permission === "unsupported" && <p className="text-sm text-text-muted bg-bg-surface-hover rounded-2xl p-4">Seu navegador não suporta notificações push.</p>}
      {permission === "granted" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
          <BellRing className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">Notificações ativas neste dispositivo</p>
            <p className="text-xs text-emerald-700 mt-0.5">Você receberá alertas de novos tickets e pagamentos.</p>
          </div>
          <button onClick={deactivate} disabled={busy} className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded-lg border border-red-200 bg-white transition-colors">Desativar</button>
        </div>
      )}
      {(permission === "default" || permission === "denied") && (
        <div className="bg-bg-surface border border-border-base rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BellOff className="w-5 h-5 text-text-muted" />
            <p className="text-sm font-semibold text-text-base">{permission === "denied" ? "Notificações bloqueadas pelo navegador" : "Notificações desativadas"}</p>
          </div>
          {permission === "denied" ? (
            <p className="text-xs text-text-muted">Acesse as configurações do navegador, encontre este site em Notificações e altere para <strong>Permitir</strong>.</p>
          ) : (
            <button onClick={activate} disabled={busy} className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
              {busy ? "Ativando..." : "Ativar Notificações Admin"}
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-text-muted bg-bg-surface-hover rounded-xl p-3">As notificações ficam vinculadas a <strong>este navegador/dispositivo</strong>. Para receber em outro dispositivo, acesse o painel lá e ative novamente.</p>
    </div>
  );
}

export function AdminShell({ onBack }: AdminShellProps) {
  const [isAuth, setIsAuth] = useState(() => !!getAdminToken());
  const [adminPass, setAdminPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [reportPeriod, setReportPeriod] = useState(30);

  // Shared state for all admin data
  const [devices, setDevices] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [reports, setReports] = useState<AdminReportsData>({
    testsHistory: [], salesHistory: [], totalRevenue: 0,
    totalSales: 0, totalTests: 0, conversionRate: 0,
  });

  async function loadAll() {
    const [d, t, p, r, c, rep] = await Promise.allSettled([
      fetchAdminDevices(),
      fetchAdminTickets(),
      fetchAdminPayments(),
      fetchAdminRefunds(),
      fetchAdminChangeRequests(),
      fetchAdminReports(reportPeriod),
    ]);

    // Se qualquer request retornou 401, o token expirou → forçar novo login
    const unauthorized = [d, t, p, r, c, rep].some(
      result => result.status === "rejected" && result.reason instanceof ApiError && result.reason.status === 401
    );
    if (unauthorized) {
      setAdminToken(null);
      setIsAuth(false);
      return;
    }

    if (d.status === "fulfilled") setDevices(d.value);
    if (t.status === "fulfilled") setAllTickets(t.value);
    if (p.status === "fulfilled") setPayments(p.value);
    if (r.status === "fulfilled") setRefunds(r.value);
    if (c.status === "fulfilled") setChangeRequests(c.value);
    if (rep.status === "fulfilled") setReports(rep.value);
  }

  useEffect(() => {
    if (isAuth) loadAll();
  }, [isAuth, tab]);

  const badges = {
    tickets: allTickets.filter(t => t.status === "open").length,
    refunds: refunds.filter(r => r.status === "aguardando").length,
    changes: changeRequests.filter(c => c.status === "aguardando").length,
  };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const { token } = await adminLogin(adminPass);
      setAdminToken(token);
      setIsAuth(true);
    } catch (err: any) {
      setLoginError(err.message || "Senha incorreta");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    setAdminToken(null);
    setIsAuth(false);
    setAdminPass("");
    setConfirmLogout(false);
  }

  function navigateTo(id: AdminTab) {
    setTab(id);
    setSidebarOpen(false);
  }

  if (!isAuth) {
    return (
      <motion.div
        key="admin-login"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full flex-1 flex flex-col min-h-[100dvh] sm:min-h-0"
      >
        <div className="bg-gradient-to-r from-bg-surface to-bg-surface-hover p-6 flex justify-between items-center shrink-0 border-b border-border-base/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-text-base">Administração</h1>
          </div>
          <button onClick={onBack} className="text-text-muted hover:text-text-base transition-colors p-1" title="Voltar">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="p-8 flex flex-col items-center">
          <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-base mb-1.5">Senha Administrativa</label>
              <input
                type="password"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border-base focus:ring-2 focus:ring-primary-500 outline-none bg-bg-surface text-text-base"
                placeholder="Digite a senha"
                autoFocus
              />
            </div>
            {loginError && <p className="text-red-500 text-sm font-medium">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-semibold transition-colors shadow-sm active:scale-95 disabled:opacity-60"
            >
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </motion.div>
    );
  }

  const sharedProps = {
    devices, setDevices,
    allTickets, setAllTickets,
    payments, setPayments,
    refunds, setRefunds,
    changeRequests, setChangeRequests,
    reports, setReports,
    reportPeriod, setReportPeriod,
    navigateTo,
  };

  return (
    <motion.div
      key="admin-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full flex-1 flex flex-col overflow-hidden min-h-[100dvh] sm:min-h-0"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-base/50 bg-gradient-to-r from-bg-surface to-bg-surface-hover shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="md:hidden p-2 rounded-xl hover:bg-bg-surface-hover text-text-muted transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-text-base hidden sm:block">VS Admin</span>
          <span className="text-text-muted text-sm hidden sm:block">•</span>
          <span className="text-text-muted text-sm hidden sm:block capitalize">{NAV_ITEMS.find(n => n.id === tab)?.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-base px-3 py-2 rounded-xl hover:bg-bg-surface-hover transition-colors border border-border-base/50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Voltar ao app</span>
          </button>
          <button
            onClick={() => setConfirmLogout(true)}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors border border-red-100"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar overlay on mobile */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="md:hidden fixed inset-0 bg-black/40 z-10"
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside
          className={`
            absolute md:relative z-20 md:z-auto
            flex flex-col h-full w-56 shrink-0
            bg-bg-base border-r border-border-base/50
            transition-transform duration-200
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}
        >
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map(item => {
              const badge = item.badgeKey ? badges[item.badgeKey] : 0;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                    transition-all active:scale-95 text-left
                    ${active
                      ? "bg-primary-600 text-white shadow-sm"
                      : "text-text-muted hover:bg-bg-surface-hover hover:text-text-base"
                    }
                  `}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20 text-white" : "bg-primary-600 text-white"}`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-border-base/50 shrink-0">
            <button
              onClick={() => setConfirmLogout(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair do Admin
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {tab === "overview" && <AdminOverview {...sharedProps} />}
          {tab === "users" && <AdminUsers {...sharedProps} />}
          {tab === "resellers" && <AdminResellers />}
          {tab === "notifications" && <AdminNotifications />}
          {tab === "devices" && <AdminDevices {...sharedProps} />}
          {tab === "tickets" && <AdminTickets {...sharedProps} />}
          {tab === "payments" && <AdminPayments {...sharedProps} />}
          {tab === "refunds" && <AdminRefunds {...sharedProps} />}
          {tab === "change_requests" && <AdminChangeReqs {...sharedProps} />}
          {tab === "reports" && <AdminReports {...sharedProps} />}
        </main>
      </div>

      <ConfirmDialog
        isOpen={confirmLogout}
        title="Sair do Admin"
        message="Deseja encerrar a sessão administrativa?"
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </motion.div>
  );
}
