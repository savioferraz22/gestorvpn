import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shield, ArrowLeft } from "lucide-react";
import type { AdminTab, AdminReports as AdminReportsData } from "../../types";
import {
  fetchAdminDevices,
  fetchAdminTickets,
  fetchAdminPayments,
  fetchAdminRefunds,
  fetchAdminChangeRequests,
  fetchAdminReports,
  adminLogin,
  setAdminToken,
  getAdminToken,
  ApiError,
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
import { AdminNotifications } from "./AdminNotifications";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ToastProvider, PageTransition } from "./ui";
import { Sidebar } from "./shell/Sidebar";
import { MobileDrawer } from "./shell/MobileDrawer";
import { TopBar } from "./shell/TopBar";
import { CommandPalette } from "./shell/CommandPalette";
import { useAdminTheme } from "./shell/useAdminTheme";

interface AdminShellProps {
  onBack: () => void;
}

const COLLAPSED_KEY = "admin:sidebar:collapsed";

export function AdminShell({ onBack }: AdminShellProps) {
  const [isAuth, setIsAuth] = useState(() => !!getAdminToken());
  const [adminPass, setAdminPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [reportPeriod, setReportPeriod] = useState(30);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const { mode: themeMode, toggle: toggleTheme } = useAdminTheme();

  const [devices, setDevices] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [reports, setReports] = useState<AdminReportsData>({
    testsHistory: [],
    salesHistory: [],
    totalRevenue: 0,
    totalSales: 0,
    totalTests: 0,
    conversionRate: 0,
  });

  const loadAll = useCallback(async () => {
    const [d, t, p, r, c, rep] = await Promise.allSettled([
      fetchAdminDevices(),
      fetchAdminTickets(),
      fetchAdminPayments(),
      fetchAdminRefunds(),
      fetchAdminChangeRequests(),
      fetchAdminReports(reportPeriod),
    ]);

    const unauthorized = [d, t, p, r, c, rep].some(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof ApiError &&
        result.reason.status === 401,
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
  }, [reportPeriod]);

  useEffect(() => {
    if (isAuth) loadAll();
  }, [isAuth, tab, loadAll]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const badges = {
    tickets: allTickets.filter((t) => t.status === "open").length,
    refunds: refunds.filter((r) => r.status === "aguardando").length,
    changes: changeRequests.filter((c) => c.status === "aguardando").length,
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
    setDrawerOpen(false);
  }

  if (!isAuth) {
    return (
      <motion.div
        key="admin-login"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="flex min-h-[100dvh] w-full flex-1 flex-col sm:min-h-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border-base/50 bg-gradient-to-r from-bg-surface to-bg-surface-hover p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-text-base">
              Administração
            </h1>
          </div>
          <button
            onClick={onBack}
            className="p-1 text-text-muted transition-colors hover:text-text-base"
            title="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col items-center p-8">
          <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-base">
                Senha Administrativa
              </label>
              <input
                type="password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                className="w-full rounded-xl border border-border-base bg-bg-surface px-4 py-3 text-text-base outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Digite a senha"
                autoFocus
              />
            </div>
            {loginError && (
              <p className="text-sm font-medium text-[var(--danger)]">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 active:scale-95 disabled:opacity-60"
            >
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </motion.div>
    );
  }

  const sharedProps = {
    devices,
    setDevices,
    allTickets,
    setAllTickets,
    payments,
    setPayments,
    refunds,
    setRefunds,
    changeRequests,
    setChangeRequests,
    reports,
    setReports,
    reportPeriod,
    setReportPeriod,
    navigateTo,
  };

  return (
    <ToastProvider>
      <motion.div
        key="admin-shell"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        data-admin-theme={themeMode}
        className="admin-scope bg-bg-base text-text-base flex h-[100dvh] w-full overflow-hidden"
      >
        <div className="hidden md:flex h-[100dvh] shrink-0">
          <Sidebar
            tab={tab}
            onNavigate={navigateTo}
            onLogout={() => setConfirmLogout(true)}
            badges={badges}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          />
        </div>

        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          tab={tab}
          onNavigate={navigateTo}
          onLogout={() => setConfirmLogout(true)}
          badges={badges}
        />

        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          <TopBar
            tab={tab}
            onOpenDrawer={() => setDrawerOpen(true)}
            onBack={onBack}
            badges={badges}
            onNavigate={navigateTo}
            onOpenCommand={() => setPaletteOpen(true)}
            theme={themeMode}
            onToggleTheme={toggleTheme}
          />

          <main
            className={`flex min-h-0 flex-1 flex-col bg-bg-base ${tab === "tickets" ? "overflow-hidden" : "overflow-auto"}`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <PageTransition
                key={tab}
                pageKey={tab}
                className="flex min-h-0 flex-1 flex-col"
              >
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
              </PageTransition>
            </AnimatePresence>
          </main>
        </div>

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={navigateTo}
          onBack={onBack}
          onLogout={() => setConfirmLogout(true)}
          theme={themeMode}
          onToggleTheme={toggleTheme}
        />

        <ConfirmDialog
          isOpen={confirmLogout}
          title="Sair do Admin"
          message="Deseja encerrar a sessão administrativa?"
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      </motion.div>
    </ToastProvider>
  );
}
