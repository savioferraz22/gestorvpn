/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Copy, Loader2, QrCode, LogIn, UserPlus, ArrowLeft, Shield, Clock, Trash2, Key, Lock, Eye, EyeOff, MessageSquare, Plus, Send, User, Bell, Search, Filter, XCircle, Minimize2, Download, HelpCircle, ChevronDown, ChevronUp, ChevronRight, BookOpen, Smartphone, Plane, Settings2, RefreshCw, AlertTriangle, ExternalLink, Star, Users, Calendar, CalendarDays, X, AlertCircle, History, CreditCard, LayoutDashboard, LogOut, Menu, DollarSign, TrendingUp, Store, BadgePercent, Package, Zap, BarChart2 } from "lucide-react";
import { AdminShell } from "./components/admin/AdminShell";

type ViewState = "login" | "dashboard" | "create_user" | "show_credentials" | "pix_flow" | "admin" | "tickets" | "ticket_detail" | "admin_tickets" | "admin_ticket_detail" | "help" | "reseller_info" | "reseller_dashboard" | "reseller_pix";

interface Referral {
  id: string;
  referrer_username: string;
  referred_username: string;
  status: string;
  created_at: string;
}

interface UserData {
  login: string;
  senha?: string;
  pass?: string;
  password?: string;
  expira: string;
  status: string;
  limite: number;
  uuid?: string;
  isTrusted?: boolean;
  points?: number;
  referrals?: Referral[];
  refundRequest?: any;
  changeRequests?: any[];
  lastPaymentDate?: string;
  payments?: any[];
}

interface Ticket {
  id: string;
  username: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender: string;
  message: string;
  created_at: string;
}

export default function App() {
  const [view, setView] = useState<ViewState>("login");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [existingTestUsername, setExistingTestUsername] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);

  // Pix state
  const [paymentData, setPaymentData] = useState<{
    paymentId: string;
    qrCodeBase64: string;
    qrCode: string;
    amount?: number;
    discountApplied?: boolean;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "approved">("pending");
  const [pixExpired, setPixExpired] = useState(false);
  const [copied, setCopied] = useState(false);

  // New User state
  const [newUsername, setNewUsername] = useState("");
  const [referrerUsername, setReferrerUsername] = useState("");
  const [credentials, setCredentials] = useState<{ username: string, password: string, uuid: string } | null>(null);

  const [showData, setShowData] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // Group state
  const [groupData, setGroupData] = useState<{
    groupId: string;
    users: string[];
    plan: {
      plan_type: string;
      plan_months: number;
      plan_devices: number;
      plan_price: number;
    };
  } | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showDateChangeModal, setShowDateChangeModal] = useState(false);
  const [showUsernameChangeModal, setShowUsernameChangeModal] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [changeUsernameValue, setChangeUsernameValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pixType, setPixType] = useState("cpf");
  const [pixKey, setPixKey] = useState("");
  const [requestStatus, setRequestStatus] = useState("");

  const [newDeviceUsername, setNewDeviceUsername] = useState("");
  const [isAddingDevice, setIsAddingDevice] = useState(false);

  const [groupUsersDetails, setGroupUsersDetails] = useState<any[]>([]);
  const [planUpgradeStep, setPlanUpgradeStep] = useState<'select' | 'prompt' | 'existing' | 'new' | 'pix'>('select');
  const [pendingPlan, setPendingPlan] = useState<any>(null);
  const [upgradeUsername, setUpgradeUsername] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [upgradePix, setUpgradePix] = useState<any>(null);
  const [upgradeError, setUpgradeError] = useState("");

  // Device picker for multi-device change actions
  const [showDevicePickerModal, setShowDevicePickerModal] = useState(false);
  const [pendingChangeAction, setPendingChangeAction] = useState<string | null>(null); // 'username'|'password'|'date'
  const [selectedChangeDevice, setSelectedChangeDevice] = useState<string>("");

  const getDeviceLabel = (username: string) => {
    if (!groupUsersDetails || groupUsersDetails.length === 0) return "Aparelho 1";
    const sorted = [...groupUsersDetails].sort((a, b) =>
      a.login === currentUser?.login ? -1 : b.login === currentUser?.login ? 1 : 0
    );
    const index = sorted.findIndex(u => u.login === username);
    return index !== -1 ? `Aparelho ${index + 1}` : "Aparelho 1";
  };

  // Plan selector state
  const [planMonths, setPlanMonths] = useState(1);
  const [planDevices, setPlanDevices] = useState(1);

  // ─── Reseller state ──────────────────────────────────────────────────────
  const [resellerUsername, setResellerUsername] = useState("");
  const [resellerToken, setResellerToken] = useState<string | null>(null);
  const [resellerData, setResellerData] = useState<any>(null); // { reseller, payments, users }
  const [resellerLoading, setResellerLoading] = useState(false);
  const [resellerError, setResellerError] = useState("");
  // New hire form
  const [hireUsername, setHireUsername] = useState("");
  const [hirePassword, setHirePassword] = useState("");
  const [hireLogins, setHireLogins] = useState(20);
  const [hireMonths, setHireMonths] = useState(1);
  // Renew form
  const [renewMonths, setRenewMonths] = useState(1);
  // Login change request section
  const [resellerLoginsReq, setResellerLoginsReq] = useState<number | null>(null);
  const [resellerLoginsBusy, setResellerLoginsBusy] = useState(false);
  // My requests section
  const [resellerRequests, setResellerRequests] = useState<any[]>([]);
  const [resellerRequestsLoaded, setResellerRequestsLoaded] = useState(false);
  // Profit estimator
  const [profitLogins, setProfitLogins] = useState(20);
  const [profitSellPrice, setProfitSellPrice] = useState(15);
  // Reseller PIX
  const [resellerPixData, setResellerPixData] = useState<{ paymentId: string; qrCodeBase64: string; qrCode: string; amount: number; discountApplied?: boolean; logins?: number; months?: number; newLogins?: number; loginDiff?: number; daysLeft?: number; mode: "hire" | "renew" | "logins_upgrade" } | null>(null);
  const [resellerPixStatus, setResellerPixStatus] = useState<"pending" | "approved">("pending");
  const [resellerPixExpired, setResellerPixExpired] = useState(false);
  // Change password modal for reseller
  const [showResellerPassModal, setShowResellerPassModal] = useState(false);
  const [resellerNewPass, setResellerNewPass] = useState("");
  // Reseller tickets
  const [resellerTickets, setResellerTickets] = useState<any[]>([]);
  const [resellerTicketsLoaded, setResellerTicketsLoaded] = useState(false);
  const [showResellerTicketForm, setShowResellerTicketForm] = useState(false);
  const [resellerTicketSubject, setResellerTicketSubject] = useState("");
  const [resellerTicketMsg, setResellerTicketMsg] = useState("");
  // Reseller first-access setup
  const [resellerSetupLogins, setResellerSetupLogins] = useState(20);
  const [resellerSetupExpiry, setResellerSetupExpiry] = useState("");
  // Password verification — cached in localStorage after first verify
  const [resellerVerifiedPass, setResellerVerifiedPass] = useState<string | null>(null);
  const [showResellerPass, setShowResellerPass] = useState(false);
  const [showPassVerifyModal, setShowPassVerifyModal] = useState(false);
  const [passVerifyInput, setPassVerifyInput] = useState("");
  const [passVerifyError, setPassVerifyError] = useState("");
  // ─────────────────────────────────────────────────────────────────────────

  const calcResellerPrice = (months: number, logins: number) => (30 + logins) * months;

  // Calculate plan price
  const calcPlanPrice = (months: number, devices: number) =>
    5 + devices * months * 10;

  // Calculate loyalty points from APPROVED payment history only
  const calcLoyaltyPoints = (payments: any[]): number => {
    let pts = 0;
    const sorted = [...payments]
      .filter(p => p.status === "approved")
      .sort((a, b) =>
        new Date(a.paid_at || a.created_at).getTime() - new Date(b.paid_at || b.created_at).getTime()
      );
    for (const p of sorted) {
      let meta: any = {};
      try { meta = p.metadata ? (typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata) : {}; } catch { }
      if (meta.discountApplied === true) { pts = 0; }
      else if (meta.paidOnTime === true) { pts++; }
    }
    return Math.min(pts, 3);
  };

  // Tickets state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [ticketForm, setTicketForm] = useState({ category: "Suporte Técnico", subject: "", message: "" });
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);

  // Admin Tickets state
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [adminTicketUserDetails, setAdminTicketUserDetails] = useState<any>(null);
  const [showAdminUserModal, setShowAdminUserModal] = useState<boolean>(false);
  const [showAdminSecretData, setShowAdminSecretData] = useState<boolean>(false);
  const [showAdminHistory, setShowAdminHistory] = useState<boolean>(false);
  const [showAdminReferrals, setShowAdminReferrals] = useState<boolean>(false);

  const fetchAdminTicketUserDetails = async (username: string) => {
    try {
      setAdminTicketUserDetails(null); // Clear previous state
      const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/details`);
      if (res.ok) {
        const data = await res.json();
        setAdminTicketUserDetails(data);
      } else {
        const errData = await res.json();
        console.error("Backend error fetching user details:", errData);
        // Fallback with empty data so the modal stops loading at least
        setAdminTicketUserDetails({ user: { login: username, status: 'Desconhecido' } });
      }
    } catch (err) {
      console.error("Network error fetching user details:", err);
      setAdminTicketUserDetails({ user: { login: username, status: 'Erro na Rede' } });
    }
  };
  const [adminPayments, setAdminPayments] = useState<any[]>([]);
  const [adminRefunds, setAdminRefunds] = useState<any[]>([]);
  const [adminChangeRequests, setAdminChangeRequests] = useState<any[]>([]);
  const [adminReports, setAdminReports] = useState<any>({ testsHistory: [], salesHistory: [], totalRevenue: 0, totalSales: 0, totalTests: 0, conversionRate: 0 });
  const [adminReportPeriod, setAdminReportPeriod] = useState<number>(30);
  const [adminTab, setAdminTab] = useState<"devices" | "tickets" | "payments" | "refunds" | "change_requests" | "reports">("devices");
  const [adminTicketFilterStatus, setAdminTicketFilterStatus] = useState<string>("all");
  const [adminTicketSearchUser, setAdminTicketSearchUser] = useState<string>("");
  const [adminPass, setAdminPass] = useState("");
  const [approvingRefundId, setApprovingRefundId] = useState<string | null>(null);
  const [refundDateTime, setRefundDateTime] = useState<string>("");

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { }
  });

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm });
  };

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: "",
    message: ""
  });

  const showAlertDialog = (message: string, title: string = "Aviso") => {
    setAlertDialog({ isOpen: true, title, message });
  };

  // Help state
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openTrouble, setOpenTrouble] = useState<number | null>(null);

  // User sidebar mobile open state
  const [userSidebarOpen, setUserSidebarOpen] = useState(false);

  const troubleshootingSteps = [
    {
      title: "1. Validade do Chip (Fazer Login na Rede)",
      content: "A validade do chip se refere ao tempo desde a última recarga. Verifique nas notificações se aparece 'Fazer Login na Rede', 'Sem Internet' ou 'Os Dados podem ter acabado'. Se aparecer, seu chip está válido! Se não aparecer e for pré-pago, pode ser necessário fazer uma recarga para validar o chip."
    },
    {
      title: "2. IP Bloqueado (Modo Avião)",
      content: "Se o chip está válido e não conecta, o IP pode estar bloqueado. Ligue o 'Modo Avião' do celular por 10 segundos e desligue. Isso muda o IP. Tente conectar novamente no app."
    },
    {
      title: "3. Testar Diferentes Conexões",
      content: "No app existem várias opções (Gcloud, Front, Flare, etc). Elas usam métodos diferentes. Algumas funcionam melhor em certas regiões. Teste uma por uma até achar a melhor para você."
    },
    {
      title: "4. Ajustar APN do Celular",
      content: "Vá em Configurações > Rede Móvel > Nomes dos Pontos de Acesso (APN). Clique em Restaurar Padrão. Selecione o APN atual e altere: Tipo de autenticação para PAP ou CHAP; Protocolo APN para IPV4; Protocolo de Roaming para IPV4. Salve e tente novamente."
    },
    {
      title: "5. App Desatualizado ou Bugado",
      content: "Se as conexões sumiram ou não atualizam, desinstale o app e instale novamente pela Play Store. Abra-o com o Wi-Fi ligado para atualizar as configurações, ou clique na seta girando no app."
    },
    {
      title: "6. Erro de Usuário/Senha ou Autenticação",
      content: "Se der erro de autenticação, desinstale e instale o app novamente. Se você acabou de pagar a renovação, aguarde alguns minutos até que o pagamento seja processado e o acesso renovado."
    }
  ];

  const faqItems = [
    {
      title: "Funciona em iPhone?",
      content: "Não. O app CloudBR DT é exclusivo para Android. Não temos compatibilidade com iPhone (iOS) e não há previsão de suporte."
    },
    {
      title: "Funciona com qualquer chip?",
      content: "Não. O app CloudBR DT funciona somente com chips das operadoras TIM e VIVO. Chips de outras operadoras (Claro, Oi, etc.) não são compatíveis."
    },
    {
      title: "É possível rotear a internet?",
      content: "Sim, porém é necessário pesquisar no YouTube como fazer isso. Na maioria das vezes não funciona para roteamento (vai da sorte), por isso não oferecemos suporte para essa função."
    },
    {
      title: "Pode usar Torrent?",
      content: "Não! O uso de Torrents (uTorrent, BitTorrent, etc) é totalmente proibido e prejudica nossos servidores. O descumprimento pode gerar bloqueio."
    },
    {
      title: "Algum app ou site pode não funcionar?",
      content: "Sim. Como a VPN altera seu IP, alguns apps (como sites de aposta ou bancos) podem bloquear o acesso. Se um app não abrir, teste outro para confirmar que a internet está funcionando."
    },
    {
      title: "Funciona em Zona Rural?",
      content: "Depende exclusivamente de ter sinal da operadora (TIM/Vivo) na sua região. Se houver sinal no celular, funciona. Antenas rurais (como Amplimax) não servem, pois o app precisa estar no celular."
    },
    {
      title: "Qual a velocidade da internet?",
      content: "Varia entre 5 e 100 megas, dependendo da força do sinal da operadora na sua região. Lentidões temporárias podem ocorrer."
    },
    {
      title: "Se eu tiver crédito, vai gastar meu saldo?",
      content: "Sim. Se o chip tiver saldo, a operadora vai consumir ele primeiro. O ideal é usar um chip pré-pago SEM crédito."
    },
    {
      title: "Ganho algo por indicar amigos?",
      content: "Sim! Sempre que você indicar um amigo e ele assinar, você ganha 1 mês de internet ilimitada grátis."
    }
  ];

  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);

  const fetchDevices = async () => {
    try {
      const res = await fetch("/api/admin/devices");
      const data = await res.json();
      setDevices(data);
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllDevices = async () => {
    confirmAction("Limpar Todos", "Tem certeza que deseja limpar todos os registros?", async () => {
      try {
        await fetch("/api/admin/devices", { method: "DELETE" });
        fetchDevices();
      } catch (err) {
        console.error(err);
      }
    });
  };

  const maskText = (text: string) => {
    if (!text) return "";
    // Show exactly half the text, masked when blocked
    const visibleLen = Math.floor(text.length / 2);
    if (visibleLen === 0 && text.length > 0) return "*".repeat(text.length);
    return text.substring(0, visibleLen) + "*".repeat(text.length - visibleLen);
  };

  // Device ID management
  const [deviceId, setDeviceId] = useState("");
  useEffect(() => {
    let id = localStorage.getItem("vpn_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("vpn_device_id", id);
    }
    setDeviceId(id);

    // Handle referral link: ?ref=USERNAME
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get("ref");
    if (refParam) {
      const sanitized = refParam.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
      if (sanitized) {
        setReferrerUsername(sanitized);
        setView("create_user");
        // Clean URL without reload
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
    }

    const savedUsername = localStorage.getItem("vpn_saved_username");
    if (savedUsername) {
      setUsername(savedUsername);
      handleLogin(savedUsername);
    }
  }, []);

  // Pix status polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;

    if (paymentData && paymentStatus === "pending" && !pixExpired) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/status/${paymentData.paymentId}`);
          const data = await res.json();
          if (data.status === "approved") {
            setPaymentStatus("approved");
            clearInterval(interval);
            clearTimeout(timeout);
            // Refresh user data after approval
            if (currentUser) {
              handleLogin(currentUser.login);
            }
          }
        } catch (err) {
          console.error("Error checking status:", err);
        }
      }, 5000);

      // 15-minute timeout
      timeout = setTimeout(() => {
        clearInterval(interval);
        setPixExpired(true);
      }, 15 * 60 * 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [paymentData, paymentStatus, pixExpired, currentUser]);

  // Reseller PIX polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;

    if (resellerPixData && resellerPixStatus === "pending" && !resellerPixExpired) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/reseller/status/${resellerPixData.paymentId}`);
          const data = await res.json();
          if (data.status === "approved") {
            setResellerPixStatus("approved");
            clearInterval(interval);
            clearTimeout(timeout);
          }
        } catch (err) {
          console.error("Error checking reseller status:", err);
        }
      }, 5000);

      timeout = setTimeout(() => {
        clearInterval(interval);
        setResellerPixExpired(true);
      }, 15 * 60 * 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [resellerPixData, resellerPixStatus, resellerPixExpired]);

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const sanitized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "");
    setUsername(sanitized);
  };

  const handleLogin = async (loginUsername: string = username) => {
    if (!loginUsername.trim()) {
      setError("Por favor, digite o nome de usuário.");
      return;
    }

    setLoading(true);
    setError("");

    const currentDeviceId = deviceId || localStorage.getItem("vpn_device_id");

    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), deviceId: currentDeviceId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Usuário não encontrado. Verifique se digitou corretamente com letras maiúsculas e minúsculas. Se ainda não tem um acesso, clique em 'Criar Teste Grátis' abaixo.");
        }
        throw new Error(data.error || "Erro ao fazer login");
      }

      // Fetch group data
      const groupRes = await fetch(`/api/group/${loginUsername.trim()}`);
      if (groupRes.ok) {
        const groupData = await groupRes.json();
        setGroupData(groupData);

        const detailsRes = await fetch(`/api/group/details/${groupData.groupId}`);
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          setGroupUsersDetails(detailsData);
        }
      }

      setCurrentUser(data);
      setShowData(data.isTrusted || false);
      setView("dashboard");
      localStorage.setItem("vpn_saved_username", loginUsername.trim());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResellerLogin = async () => {
    if (!resellerUsername.trim()) return;
    setResellerLoading(true);
    setResellerError("");
    try {
      const res = await fetch("/api/reseller/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resellerUsername.trim() }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* non-JSON 404 fallback */ }
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}: verifique se o servidor foi reiniciado.`);
      setResellerToken(data.token);
      setResellerData(data);
      setView("reseller_dashboard");
    } catch (err: any) {
      setResellerError(err.message);
    } finally {
      setResellerLoading(false);
    }
  };

  const refreshResellerData = async (token: string) => {
    try {
      const res = await fetch("/api/reseller/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResellerData(data);
      }
    } catch { /* silent */ }
  };

  const fetchGroupData = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/group/${currentUser.login}`);
      if (res.ok) {
        const data = await res.json();
        setGroupData(data);

        const detailsRes = await fetch(`/api/group/details/${data.groupId}`);
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          setGroupUsersDetails(detailsData);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceUsername || !groupData) return;
    setIsAddingDevice(true);
    setError("");
    try {
      const res = await fetch("/api/group/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: groupData.groupId, newUsername: newDeviceUsername })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao adicionar aparelho");
      }
      setNewDeviceUsername("");
      fetchGroupData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAddingDevice(false);
    }
  };

  const handleRemoveDevice = async (usernameToRemove: string) => {
    if (!groupData) return;
    confirmAction("Remover do Plano", `Remover ${usernameToRemove} do plano?`, async () => {
      try {
        const res = await fetch("/api/group/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId: groupData.groupId, usernameToRemove })
        });
        if (res.ok) {
          fetchGroupData();
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  const handleChangePlan = async (plan_type: string, plan_months: number, plan_devices: number, plan_price: number) => {
    if (!groupData) return;

    // Prevent changing to a plan with fewer devices than currently linked
    if (plan_type === 'devices' && plan_devices < groupData.users.length) {
      showAlertDialog(`Você tem ${groupData.users.length} aparelhos vinculados. Remova ${groupData.users.length - plan_devices} aparelho(s) antes de mudar para este plano.`);
      return;
    }
    if (plan_type === 'period' && groupData.users.length > 1) {
      showAlertDialog(`Planos por período são apenas para 1 aparelho. Remova os outros aparelhos antes de mudar para este plano.`);
      return;
    }

    try {
      const res = await fetch("/api/group/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: groupData.groupId, plan_type, plan_months, plan_devices, plan_price })
      });
      if (res.ok) {
        fetchGroupData();
        setShowPlanModal(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPassword) return;

    setIsVerifying(true);
    setVerifyError("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser?.login, password: verifyPassword, deviceId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Senha incorreta");
      }

      setShowData(true);
      setShowVerifyModal(false);
      setVerifyPassword("");
      showAlertDialog("Senha confirmada! Acesso liberado.");
    } catch (err: any) {
      setVerifyError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const fetchUserTickets = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/tickets/${currentUser.login}`);
      const data = await res.json();
      setTickets(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminTickets = async () => {
    try {
      const res = await fetch("/api/admin/tickets");
      const data = await res.json();
      setAllTickets(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminPayments = async () => {
    try {
      const res = await fetch("/api/admin/payments");
      const data = await res.json();
      setAdminPayments(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminRefunds = async () => {
    try {
      const res = await fetch("/api/admin/refunds");
      const data = await res.json();
      setAdminRefunds(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminChangeRequests = async () => {
    try {
      const res = await fetch("/api/admin/change-requests");
      const data = await res.json();
      setAdminChangeRequests(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminReports = async (period: number) => {
    try {
      const res = await fetch(`/api/admin/reports?period=${period}`);
      const data = await res.json();
      setAdminReports(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestUuidReset = async (targetUsername: string) => {
    if (!currentUser) return;
    // Check for existing pending request for this specific targetUsername
    const pendingUuid = currentUser.changeRequests?.find((r: any) => r.username === targetUsername && r.type === 'uuid' && r.status === 'aguardando');
    if (pendingUuid) {
      showAlertDialog(`Já existe uma solicitação de UUID em andamento para o aparelho ${targetUsername}.`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/user/update-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: targetUsername,
          action: "uuid",
          newValue: "reset"
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showAlertDialog("✅ Solicitação de UUID enviada com sucesso! Aguarde a aprovação do administrador. Você pode acompanhar o status em \"Minhas Solicitações\".");
        // Refresh user data to show pending status
        if (currentUser) {
          const refreshRes = await fetch("/api/user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: currentUser.login, deviceId }),
          });
          if (refreshRes.ok) {
            const updatedUser = await refreshRes.json();
            setCurrentUser(updatedUser);
          }
        }
      } else {
        showAlertDialog(data.error || "Erro ao solicitar UUID.");
      }
    } catch (err) {
      showAlertDialog("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.subject || !ticketForm.message || !currentUser) return;
    setLoading(true);
    try {
      await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser.login,
          category: ticketForm.category,
          subject: ticketForm.subject,
          message: ticketForm.message
        }),
      });
      setTicketForm({ category: "Suporte Técnico", subject: "", message: "" });
      setShowNewTicketModal(false);
      fetchUserTickets();
      setView("tickets");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent, sender: "user" | "admin") => {
    e.preventDefault();
    if (!newMessage || !currentTicket) return;
    try {
      await fetch(`/api/tickets/${currentTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, message: newMessage }),
      });
      setNewMessage("");
      fetchMessages(currentTicket.id);
      if (sender === "user") fetchUserTickets();
      if (sender === "admin") fetchAdminTickets();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCloseTicket = async () => {
    if (!currentTicket) return;
    try {
      await fetch(`/api/tickets/${currentTicket.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (isAdminAuth) {
        fetchAdminTickets();
        setView("admin");
        setAdminTab("tickets");
      } else {
        fetchUserTickets();
        setView("tickets");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateFreeUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      setError("Por favor, digite um nome de usuário.");
      return;
    }

    if (!/^[a-zA-Z0-9]{1,10}$/.test(newUsername)) {
      setError("Usuário inválido. Use apenas letras e números, até 10 caracteres.");
      return;
    }

    setLoading(true);
    setError("");

    const currentDeviceId = deviceId || localStorage.getItem("vpn_device_id");

    try {
      const res = await fetch("/api/create-free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim(), deviceId: currentDeviceId, referrer: referrerUsername.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.existing_username) {
          setExistingTestUsername(data.existing_username);
        }
        throw new Error(data.error || "Erro ao criar usuário");
      }

      setExistingTestUsername(null);
      setCredentials(data);
      setView("show_credentials");
      localStorage.setItem("vpn_saved_username", newUsername.trim());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (type: string, months: number, devices: number, price: number) => {
    if (!groupData) return;

    // Trigger device-linking flow whenever selected devices exceed currently linked devices
    if (devices > groupData.users.length) {
      if (devices > groupData.users.length + 1) {
        showAlertDialog(`Por favor, adicione um aparelho por vez. Selecione ${groupData.users.length + 1} celular(es) primeiro e vincule o acesso, depois adicione mais.`);
        return;
      }
      setPendingPlan({ type, months, devices, price });
      setPlanUpgradeStep('prompt');
    } else {
      handleChangePlan(type, months, devices, price);
    }
  };

  const handleUpgradeUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const sanitized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "");
    setUpgradeUsername(sanitized);
    setUpgradeError("");
  };

  const handleLinkExistingDevice = async () => {
    setLoading(true);
    setUpgradeError("");
    try {
      const res = await fetch("/api/group/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: groupData?.groupId, newUsername: upgradeUsername, password: upgradePassword })
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          setUpgradeError("Acesso não encontrado no sistema. Verifique se digitou corretamente com letras maiúsculas e minúsculas.");
        } else {
          setUpgradeError(data.error || "Erro ao vincular aparelho.");
        }
        setLoading(false);
        return;
      }

      setPlanUpgradeStep('select');
      setShowPlanModal(false);
      fetchGroupData();
    } catch (err) {
      setUpgradeError("Erro de conexão.");
    }
    setLoading(false);
  };

  const handleCreateNewDevicePix = async () => {
    setLoading(true);
    setUpgradeError("");
    try {
      const res = await fetch("/api/pix/new-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: groupData?.groupId,
          mainUsername: currentUser?.login,
          newUsername: upgradeUsername
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setUpgradeError(data.error || "Erro ao gerar PIX.");
        setLoading(false);
        return;
      }

      if (data.free) {
        const freeRes = await fetch("/api/group/add-free-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: groupData?.groupId,
            mainUsername: currentUser?.login,
            newUsername: upgradeUsername,
            remainingDays: data.remainingDays
          })
        });
        if (freeRes.ok) {
          showAlertDialog("Aparelho adicionado com sucesso!");
          setPlanUpgradeStep('select');
          setShowPlanModal(false);
          fetchGroupData();
        } else {
          setUpgradeError("Erro ao criar aparelho.");
        }
        setLoading(false);
        return;
      }

      setUpgradePix(data);
      setPlanUpgradeStep('pix');

      const interval = setInterval(async () => {
        try {
          const checkRes = await fetch(`/api/pix/status/${data.transactionId}`);
          const checkData = await checkRes.json();
          if (checkData.status === 'approved') {
            clearInterval(interval);
            showAlertDialog("Pagamento aprovado! O novo aparelho foi criado e vinculado.");
            setPlanUpgradeStep('select');
            setShowPlanModal(false);
            fetchGroupData();
          }
        } catch (e) { }
      }, 5000);

    } catch (err) {
      setUpgradeError("Erro de conexão.");
    }
    setLoading(false);
  };

  const handleDevicePick = (login: string) => {
    // Check if there's already a pending request of the same type for THIS specific device
    const hasPending = currentUser?.changeRequests?.some((r: any) => r.username === login && r.type === pendingChangeAction && r.status === 'aguardando');

    if (hasPending) {
      const typeLabel = pendingChangeAction === 'username' ? 'usuário' : pendingChangeAction === 'password' ? 'senha' : 'vencimento';
      showAlertDialog(`Já existe uma solicitação de alteração de ${typeLabel} em andamento para o aparelho ${login}.`);
      setShowDevicePickerModal(false);
      setPendingChangeAction(null);
      return;
    }

    setSelectedChangeDevice(login);
    setShowDevicePickerModal(false);
    if (pendingChangeAction === 'username') setShowUsernameChangeModal(true);
    if (pendingChangeAction === 'password') setShowPasswordChangeModal(true);
    if (pendingChangeAction === 'date') setShowDateChangeModal(true);
    setPendingChangeAction(null);
  };

  const handleDateChange = async () => {
    if (!currentUser || !newDate) return;
    setLoading(true);
    setRequestStatus("");
    const targetUsername = selectedChangeDevice || currentUser.login;
    try {
      const res = await fetch("/api/user/update-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername, action: "date", newValue: newDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao solicitar alteração de data");
      setRequestStatus("Solicitação enviada com sucesso!");
      setTimeout(() => {
        setShowDateChangeModal(false);
        setRequestStatus("");
        setSelectedChangeDevice("");
        handleLogin(currentUser.login);
      }, 2000);
    } catch (err: any) {
      setRequestStatus(err.message);
    }
    setLoading(false);
  };

  const handleUsernameChange = async () => {
    if (!currentUser || !changeUsernameValue) return;
    setLoading(true);
    setRequestStatus("");
    const targetUsername = selectedChangeDevice || currentUser.login;
    try {
      const res = await fetch("/api/user/update-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername, action: "username", newValue: changeUsernameValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao solicitar alteração de usuário");
      setRequestStatus("Solicitação enviada com sucesso!");
      setTimeout(() => {
        setShowUsernameChangeModal(false);
        setRequestStatus("");
        setSelectedChangeDevice("");
        handleLogin(currentUser.login);
      }, 2000);
    } catch (err: any) {
      setRequestStatus(err.message);
    }
    setLoading(false);
  };

  const handlePasswordChange = async () => {
    if (!currentUser || !newPassword) return;
    if (newPassword.length < 4 || newPassword.length > 10) {
      setRequestStatus("A senha deve ter entre 4 e 10 números.");
      return;
    }
    setLoading(true);
    setRequestStatus("");
    const targetUsername = selectedChangeDevice || currentUser.login;
    try {
      const res = await fetch("/api/user/update-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername, action: "password", newValue: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao solicitar alteração de senha");
      setRequestStatus("Solicitação enviada com sucesso!");
      setTimeout(() => {
        setShowPasswordChangeModal(false);
        setRequestStatus("");
        setSelectedChangeDevice("");
        handleLogin(currentUser.login);
      }, 2000);
    } catch (err: any) {
      setRequestStatus(err.message);
    }
    setLoading(false);
  };

  const handleRefund = async () => {
    if (!currentUser || !pixKey) return;
    setLoading(true);
    setRequestStatus("");
    try {
      const res = await fetch("/api/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser.login, pixType, pixKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao solicitar reembolso");
      setRequestStatus("Solicitação enviada com sucesso!");
      setTimeout(() => {
        setShowRefundModal(false);
        setRequestStatus("");
        handleLogin(currentUser.login);
      }, 2000);
    } catch (err: any) {
      setRequestStatus(err.message);
    }
    setLoading(false);
  };

  const cancelChangeRequest = async (id: string) => {
    try {
      const res = await fetch(`/api/user/change-requests/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao cancelar solicitação.");
      if (currentUser) handleLogin(currentUser.login);
    } catch (err) {
      showAlertDialog("Não foi possível cancelar a solicitação.");
    }
  };

  const cancelRefundRequest = async (id: string) => {
    try {
      const res = await fetch(`/api/user/refunds/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao cancelar reembolso.");
      if (currentUser) handleLogin(currentUser.login);
    } catch (err) {
      showAlertDialog("Não foi possível cancelar o reembolso.");
    }
  };

  const handleGeneratePix = async () => {
    if (!currentUser) return;

    setLoading(true);
    setError("");
    setPaymentData(null);
    setPaymentStatus("pending");

    try {
      const res = await fetch("/api/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser.login }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao gerar Pix");
      }

      setPaymentData(data);
      setView("pix_flow");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";

    let parsedString = dateString;

    // Check if it's DD/MM/YYYY format
    if (parsedString.includes('/') && parsedString.length === 10) {
      const [day, month, year] = parsedString.split('/');
      parsedString = `${year}-${month}-${day}T12:00:00`;
    } else {
      // Convert SQLite timestamp (YYYY-MM-DD HH:MM:SS) to ISO format with Z for UTC
      if (parsedString.includes(' ') && !parsedString.includes('T')) {
        parsedString = parsedString.replace(' ', 'T');
        if (!parsedString.endsWith('Z')) parsedString += 'Z';
      } else if (parsedString.length === 10 && parsedString.includes('-')) {
        // Handle YYYY-MM-DD date-only strings to avoid timezone shift
        parsedString += 'T12:00:00';
      }
    }

    const date = new Date(parsedString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: parsedString.includes('T12:00:00') ? undefined : "2-digit",
      minute: parsedString.includes('T12:00:00') ? undefined : "2-digit"
    });
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return "";
    let parsedString = dateString;
    if (parsedString.includes(' ') && !parsedString.includes('T')) {
      parsedString = parsedString.replace(' ', 'T');
      if (!parsedString.endsWith('Z')) parsedString += 'Z';
    }
    const date = new Date(parsedString);
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-[100dvh] bg-bg-base font-sans w-full relative flex">
      {/* Background decoration elements */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] max-w-[500px] max-h-[500px] rounded-full bg-primary-500/10 blur-[80px]" />
        <div className="absolute bottom-[10%] -left-[10%] w-[60vw] h-[60vw] max-w-[400px] max-h-[400px] rounded-full bg-primary-400/10 blur-[60px]" />
      </div>

      {/* User Sidebar — shown when logged in (not admin/public views) */}
      {currentUser && !["login", "create_user", "admin", "show_credentials", "pix_flow", "reseller_info", "reseller_dashboard", "reseller_pix"].includes(view) && (
        <>
          {/* Mobile overlay */}
          {userSidebarOpen && (
            <div
              className="md:hidden fixed inset-0 bg-black/40 z-10"
              onClick={() => setUserSidebarOpen(false)}
            />
          )}
          <aside className={`
            fixed md:relative z-20 md:z-auto
            flex flex-col h-full md:h-screen w-64 shrink-0
            bg-bg-surface border-r border-border-base/50
            transition-transform duration-200
            ${userSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}>
            {/* Brand */}
            <div className="p-5 border-b border-border-base/50 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  onDoubleClick={() => { setUserSidebarOpen(false); setView("admin"); }}
                  className="w-10 h-10 rounded-2xl bg-primary-600 flex items-center justify-center cursor-pointer select-none hover:bg-primary-700 transition-colors"
                  title="Área Administrativa (Duplo Clique)"
                >
                  <img src="/logo.png" alt="VS+" className="w-8 h-8 object-contain" />
                </div>
                <div>
                  <p className="font-bold text-text-base text-sm leading-tight">VS Plus</p>
                  <p className="text-text-muted text-xs truncate max-w-[120px]">{currentUser?.login}</p>
                </div>
              </div>
            </div>
            {/* Nav */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              <button
                onClick={() => { setView("dashboard"); setUserSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 text-left ${view === "dashboard" ? "bg-primary-600 text-white shadow-sm" : "text-text-muted hover:bg-bg-surface-hover hover:text-text-base"}`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Meu Painel</span>
              </button>
              <button
                onClick={() => { fetchUserTickets(); setView("tickets"); setUserSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 text-left ${["tickets", "ticket_detail"].includes(view) ? "bg-primary-600 text-white shadow-sm" : "text-text-muted hover:bg-bg-surface-hover hover:text-text-base"}`}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="flex-1">Suporte</span>
                {tickets.filter(t => t.status === "answered").length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${["tickets", "ticket_detail"].includes(view) ? "bg-white/20 text-white" : "bg-primary-600 text-white"}`}>
                    {tickets.filter(t => t.status === "answered").length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setView("help"); setUserSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 text-left ${view === "help" ? "bg-primary-600 text-white shadow-sm" : "text-text-muted hover:bg-bg-surface-hover hover:text-text-base"}`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>Ajuda</span>
              </button>
            </nav>
            {/* Logout */}
            <div className="p-3 border-t border-border-base/50 shrink-0">
              <button
                onClick={() => { setView("login"); setCurrentUser(null); setShowData(false); localStorage.removeItem("vpn_saved_username"); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Main content wrapper */}
      <div className="flex-1 overflow-hidden flex flex-col relative z-10">
        {/* Notification Toast for Copy */}
        <AnimatePresence>
          {copied && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 20, x: "-50%" }}
              className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-900/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-2xl z-[100] flex items-center gap-3 border border-white/10"
            >
              <div className="bg-green-500 rounded-full p-1">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              Copiado com sucesso!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Views area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {view === "login" && (
              <motion.div
                key="login"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="w-full flex-1 flex justify-center items-center p-6"
              >
                <div className="w-full max-w-sm">
                  {/* Glossy Header Effect */}
                  <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-primary-500/10 to-transparent pointer-events-none" />

                  <div className="pt-10 pb-8 text-center flex flex-col items-center relative z-10 space-y-3">
                    <div className="flex items-center justify-center relative p-4">
                      <div className="absolute inset-0 bg-primary-500 blur-3xl opacity-20 rounded-full w-32 h-32 mx-auto" />
                      <img src="/logo-icon.png" alt="VS Plus" className="h-16 md:h-20 w-auto object-contain relative z-10 drop-shadow-lg" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-text-base tracking-tight">Bem-vindo(a) de volta</h1>
                      <p className="text-text-muted mt-1 text-sm font-medium">
                        Conecte-se para gerenciar sua assinatura
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6 relative z-10 pt-2">
                    <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-5">
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                          <User className="h-5 w-5 text-text-muted transition-colors group-focus-within:text-primary-500" />
                        </div>
                        <input
                          id="username"
                          type="text"
                          value={username}
                          onChange={handleLoginChange}
                          className="w-full pl-12 pr-4 py-4 rounded-2xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 focus:bg-bg-surface outline-none transition-all font-semibold text-text-base placeholder-text-muted shadow-sm"
                          placeholder="Seu nome de usuário"
                          disabled={loading}
                        />
                      </div>

                      {error && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex items-start gap-3 p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <span className="text-sm font-medium">{error}</span>
                        </motion.div>
                      )}

                      <button
                        type="submit"
                        disabled={loading || !username.trim()}
                        className="relative w-full overflow-hidden bg-primary-600 hover:bg-primary-700 text-white font-semibold py-4 px-4 rounded-2xl transition-all shadow-[0_8px_16px_-6px_rgba(79,70,229,0.5)] flex items-center justify-center disabled:opacity-60 disabled:shadow-none active:scale-[0.98]"
                      >
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            Acessar Painel
                            <ArrowLeft className="w-5 h-5 ml-2 transform rotate-180" />
                          </>
                        )}
                      </button>
                    </form>

                    <div className="relative pt-2 pb-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border-base border-dashed"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-bg-surface text-text-muted font-medium text-xs uppercase tracking-wider">Ou</span>
                      </div>
                    </div>

                    <button
                      onClick={() => { setError(""); setView("create_user"); }}
                      className="w-full bg-bg-surface hover:bg-bg-surface-hover text-text-base font-semibold py-4 px-4 rounded-2xl transition-colors flex items-center justify-center border border-border-base active:scale-[0.98] shadow-sm"
                    >
                      <UserPlus className="w-5 h-5 mr-3 text-primary-600" />
                      Criar Teste Grátis (2 Dias)
                    </button>

                    {/* ── Trabalhe Conosco divider ── */}
                    <div className="relative pt-2 pb-1">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-emerald-200 dark:border-emerald-900 border-dashed"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="px-3 bg-bg-surface text-emerald-600 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5" />
                          Trabalhe Conosco
                        </span>
                      </div>
                    </div>

                    {/* Reseller login field + buttons */}
                    <div className="space-y-2">
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                          <Store className="h-5 h-5 text-text-muted group-focus-within:text-emerald-500 transition-colors" />
                        </div>
                        <input
                          type="text"
                          value={resellerUsername}
                          onChange={e => setResellerUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                          onKeyDown={e => e.key === "Enter" && handleResellerLogin()}
                          className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 focus:bg-bg-surface outline-none transition-all font-semibold text-text-base placeholder-text-muted shadow-sm text-sm"
                          placeholder="Usuário revendedor (opcional)"
                        />
                      </div>
                      {resellerError && (
                        <p className="text-xs text-red-500 font-medium px-1">{resellerError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={handleResellerLogin}
                          disabled={resellerLoading || !resellerUsername.trim()}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-3 px-2 rounded-2xl transition-colors flex items-center justify-center active:scale-[0.98] shadow-sm text-xs gap-1.5"
                        >
                          {resellerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4 shrink-0" />}
                          Acessar Área do Revendedor
                        </button>
                        <button
                          onClick={() => { setResellerError(""); setView("reseller_info"); }}
                          className="flex-1 bg-bg-surface hover:bg-bg-surface-hover text-emerald-600 font-semibold py-3 px-2 rounded-2xl transition-colors flex items-center justify-center border border-emerald-300 active:scale-[0.98] shadow-sm text-xs gap-1.5"
                        >
                          <TrendingUp className="w-4 h-4 shrink-0" />
                          Contratar / Conhecer
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 text-center">
                      <button
                        onClick={() => { setError(""); setAdminPass(""); setIsAdminAuth(false); setView("admin"); }}
                        className="text-text-muted hover:text-text-base inline-flex items-center justify-center text-sm font-medium transition-colors p-2 rounded-xl"
                      >
                        <Lock className="w-4 h-4 mr-2 opacity-70" />
                        Área Administrativa
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === "dashboard" && currentUser && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="w-full flex-1 bg-bg-base overflow-x-hidden overflow-y-auto relative flex flex-col"
              >
                {/* Premium Header */}
                <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-5 shadow-md relative z-10 shrink-0">
                  <div className="flex justify-between items-center relative z-10">
                    <div className="flex items-center gap-3">
                      {/* Mobile hamburger */}
                      <button
                        onClick={() => setUserSidebarOpen(v => !v)}
                        className="md:hidden p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                      >
                        <Menu className="w-5 h-5" />
                      </button>
                      <div
                        onDoubleClick={() => { setError(""); setAdminPass(""); setIsAdminAuth(false); setView("admin"); }}
                        className="w-12 h-12 flex items-center justify-center shadow-inner rounded-2xl overflow-hidden bg-black/20 backdrop-blur-md border border-white/10 cursor-pointer select-none transition-transform active:scale-95 hover:bg-black/30"
                        title="Área Administrativa (Duplo Clique)"
                      >
                        <img src="/logo.png" alt="VS+" className="w-10 h-10 object-contain drop-shadow-md" />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold text-white tracking-tight leading-tight">Olá, {currentUser.login}</h1>

                      </div>
                    </div>
                    <button
                      onClick={() => setUserSidebarOpen(true)}
                      className="md:hidden text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                      title="Menu"
                    >
                      <Menu className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-6 space-y-6 flex-1 bg-bg-base relative z-0 pb-24 md:pb-6">
                  {/* Security Hint Banner for Unverified Users */}
                  {!showData && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-primary-50 border border-primary-100 rounded-3xl p-4 flex items-center gap-3 shadow-sm relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all"
                      onClick={() => setShowVerifyModal(true)}
                    >
                      <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Shield className="w-14 h-14 -rotate-12" />
                      </div>
                      <div className="w-10 h-10 bg-primary-600 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-primary-500/20">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[14px] font-bold text-primary-900 tracking-tight">Painel em Modo Limitado</h3>
                          <span className="bg-primary-200 text-primary-800 text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter">Dica Ativa</span>
                        </div>
                        <p className="text-[11px] text-primary-700 leading-snug font-medium mt-0.5">Clique aqui e digite sua senha para liberar o acesso total ao painel.</p>
                      </div>
                      <div className="bg-white/50 p-1.5 rounded-xl border border-primary-200 group-hover:bg-white transition-colors shrink-0">
                        <ChevronRight className="w-4 h-4 text-primary-600" />
                      </div>
                    </motion.div>
                  )}


                  <div className="space-y-4">
                    {(groupUsersDetails.length > 0
                      // Sort: current user first, then others
                      ? [...groupUsersDetails].sort((a, b) =>
                          a.login === currentUser.login ? -1 : b.login === currentUser.login ? 1 : 0
                        )
                      : [currentUser]
                    ).map((device, index) => (
                      <div key={device.login} className="bg-bg-surface rounded-3xl p-5 border border-border-base space-y-4 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <div className="absolute top-0 right-0 flex items-center gap-1.5 bg-primary-100/50 backdrop-blur-md text-primary-800 text-xs font-bold px-4 py-1.5 rounded-bl-2xl border-b border-l border-primary-200/50">
                          Aparelho {index + 1}
                          {device.status !== undefined && device.status !== null && (
                            (() => {
                              const s = String(device.status).toLowerCase();
                              const isOnline = s === 'online' || s === '1' || s === 'true' || s === 'ativo';
                              const isOffline = s === 'offline' || s === '0' || s === 'false' || s === 'inativo';
                              return (
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isOnline ? 'bg-green-100 text-green-700' :
                                  isOffline ? 'bg-gray-100 text-gray-500' :
                                  'bg-red-100 text-red-600'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    isOnline ? 'bg-green-500' :
                                    isOffline ? 'bg-gray-400' :
                                    'bg-red-500'
                                  }`} />
                                  {isOnline ? 'Online' : isOffline ? 'Offline' : String(device.status)}
                                </span>
                              );
                            })()
                          )}
                        </div>

                        {/* User Section */}
                        <div className="flex items-center pt-2 gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-primary-50 flex items-center justify-center flex-shrink-0 text-primary-600">
                            <User className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-0.5">Usuário</p>
                            <div className="flex items-center justify-between">
                              <p className="text-lg font-bold text-text-base font-mono">
                                {device.login}
                              </p>
                              <button onClick={() => copyToClipboard(device.login)} className="bg-bg-surface-hover hover:bg-border-base p-1.5 rounded-xl text-text-muted hover:text-primary-600 transition-colors">
                                <Copy className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Password Section */}
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0 text-amber-600">
                            <Lock className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-0.5">Senha</p>
                            {showData ? (
                              <div className="flex items-center justify-between">
                                <p className="text-lg font-bold text-text-base font-mono">
                                  {device.senha || device.pass || device.password || "N/A"}
                                </p>
                                <button onClick={() => copyToClipboard(device.senha || device.pass || device.password || "")} className="bg-bg-surface-hover hover:bg-border-base p-1.5 rounded-xl text-text-muted hover:text-amber-600 transition-colors">
                                  <Copy className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <p className="text-lg font-bold text-text-base font-mono tracking-[0.2em] pt-1">
                                {maskText(device.senha || device.pass || device.password || "******")}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* UUID Section */}
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600">
                            <Key className="w-5 h-5" />
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-0.5" title="UUID opcional usado no app CloudBR DT para conexão sem usuário/senha">UUID do Aparelho</p>
                            {device.uuid && device.uuid !== "NULL" && device.uuid !== "" ? (
                              showData ? (
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-semibold text-text-base font-mono truncate mr-2 bg-bg-surface-hover px-2 py-1 rounded-lg border border-border-base">
                                    {device.uuid}
                                  </p>
                                  <button onClick={() => copyToClipboard(device.uuid || "")} className="bg-bg-surface-hover hover:bg-border-base p-1.5 rounded-xl text-text-muted hover:text-blue-600 transition-colors flex-shrink-0">
                                    <Copy className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs font-semibold text-text-base font-mono truncate bg-bg-surface-hover px-2 py-1 rounded-lg border border-border-base mt-0.5">
                                  {maskText(device.uuid)}
                                </p>
                              )
                            ) : (
                              <div className="mt-1 flex flex-col gap-2">
                                {currentUser.changeRequests?.some((r: any) => r.username === device.login && r.type === 'uuid' && r.status === 'aguardando') ? (
                                  <div className="flex items-center bg-amber-50 text-amber-700 px-2.5 py-2 rounded-lg border border-amber-200">
                                    <Clock className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                    <p className="text-[11px] font-medium leading-tight">Solicitação de UUID em análise pelo administrador.</p>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg border border-blue-100/50">
                                      <AlertCircle className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                      <p className="text-[11px] font-medium leading-tight">
                                        UUID não vinculado. O UUID é opcional — usado no app CloudBR DT para conexão sem usuário/senha. Solicite ao administrador se desejar usar essa forma de conexão.
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => handleRequestUuidReset(device.login)}
                                      disabled={loading}
                                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors active:scale-95 shadow-sm disabled:opacity-60"
                                    >
                                      <Key className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                                      Solicitar UUID
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Download App CTA */}
                    <div className="rounded-3xl overflow-hidden border border-border-base shadow-sm">
                      <a
                        href="https://play.google.com/store/apps/details?id=google.android.a48"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 bg-bg-surface hover:bg-bg-surface-hover p-4 transition-colors active:scale-[0.98]"
                      >
                        <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
                          <Download className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-text-base">Baixar App CloudBR DT</p>
                          <p className="text-[11px] text-text-muted mt-0.5">Use seu usuário e senha para conectar</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                      </a>
                      <div className="bg-amber-50 border-t border-amber-100 px-4 py-2.5 flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-amber-700">
                          <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
                          <p className="text-[11px] font-bold">Somente Android — não compatível com iPhone</p>
                        </div>
                        <div className="flex items-center gap-2 text-amber-700">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <p className="text-[11px] font-bold">Funciona somente com chip TIM ou VIVO</p>
                        </div>
                      </div>
                    </div>

                    {/* Expiration and Limit Card */}
                    <div className="bg-bg-surface-hover rounded-3xl p-5 border border-border-base flex flex-col gap-5 shadow-sm">
                      <div className="flex justify-between items-center bg-bg-surface p-4 rounded-2xl border border-border-base shadow-sm">
                        <div className="flex flex-col items-center flex-1">
                          <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">Vencimento</p>
                          <p className="text-xl font-bold text-primary-600">{formatDate(currentUser.expira)}</p>
                          {(() => {
                            const expiry = new Date(currentUser.expira);
                            const now = new Date();
                            const diffMs = expiry.getTime() - now.getTime();
                            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                            if (diffDays <= 0) return (
                              <span className="mt-1 text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Expirado</span>
                            );
                            if (diffDays <= 7) return (
                              <span className="mt-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Vence em {diffDays}d</span>
                            );
                            return (
                              <span className="mt-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ativo · {diffDays}d</span>
                            );
                          })()}
                        </div>
                        <div className="w-px h-10 bg-border-base"></div>
                        <div className="flex flex-col items-center flex-1">
                          <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">Conexões</p>
                          <p className="text-xl font-bold text-text-base">{groupUsersDetails.length > 0 ? groupUsersDetails.length : 1} <span className="text-sm font-medium text-text-muted">Max</span></p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <button
                          onClick={handleGeneratePix}
                          disabled={loading}
                          className="relative overflow-hidden w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-4 px-4 rounded-2xl transition-all shadow-[0_8px_16px_-6px_rgba(79,70,229,0.5)] flex items-center justify-center disabled:opacity-60 disabled:shadow-none active:scale-[0.98]"
                        >
                          <div className="absolute inset-0 bg-white/20 blur-md opacity-0 hover:opacity-100 transition-opacity"></div>
                          {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <QrCode className="w-5 h-5 mr-2" />
                               <span className="text-[15px]">Renovar Plano Agora</span>
                              {groupData && (
                                <div className="ml-2 flex flex-col items-end">
                                  {calcLoyaltyPoints(currentUser.payments || []) >= 3 && (
                                    <span className="text-[10px] text-green-300 font-bold -mb-1">Fidelidade -20%</span>
                                  )}
                                  <span className="bg-primary-800/50 px-2 py-0.5 rounded-lg text-primary-100 text-[13px] font-medium border border-primary-500/30">
                                    R$ {Math.floor(calcPlanPrice(groupData.plan.plan_months, groupData.plan.plan_devices) * (calcLoyaltyPoints(currentUser.payments || []) >= 3 ? 0.8 : 1))},00
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </button>

                        {showData && (
                          <div className="grid grid-cols-2 gap-3 mt-1">
                            <button
                              onClick={() => {
                                // If single device, check immediately. If multiple, let picker handle it.
                                if (groupData && groupData.users.length === 1 && currentUser.changeRequests?.some((r: any) => r.username === currentUser.login && r.type === 'username' && r.status === 'aguardando')) {
                                  showAlertDialog("Você já possui uma solicitação de alteração de usuário em andamento.");
                                } else if (groupData && groupData.users.length > 1) {
                                  setPendingChangeAction('username');
                                  setShowDevicePickerModal(true);
                                } else {
                                  setShowUsernameChangeModal(true);
                                }
                              }}
                              className="bg-bg-surface hover:bg-bg-surface-hover border border-border-base text-text-base font-semibold py-3 px-3 rounded-2xl transition-colors flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95"
                            >
                              <div className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                                <div className="w-10 h-10 bg-primary-100/50 text-primary-600 rounded-xl flex items-center justify-center border border-primary-200 shadow-sm backdrop-blur-sm">
                                  <User className="w-5 h-5" />
                                </div>
                                <span className="text-[11px]">Alterar Usuário</span>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                if (groupData && groupData.users.length === 1 && currentUser.changeRequests?.some((r: any) => r.username === currentUser.login && r.type === 'password' && r.status === 'aguardando')) {
                                  showAlertDialog("Você já possui uma solicitação de alteração de senha em andamento.");
                                } else if (groupData && groupData.users.length > 1) {
                                  setPendingChangeAction('password');
                                  setShowDevicePickerModal(true);
                                } else {
                                  setShowPasswordChangeModal(true);
                                }
                              }}
                              className="bg-bg-surface hover:bg-bg-surface-hover border border-border-base text-text-base font-semibold py-3 px-3 rounded-2xl transition-colors flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95"
                            >
                              <div className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                                <div className="w-10 h-10 bg-primary-100/50 text-primary-600 rounded-xl flex items-center justify-center border border-primary-200 shadow-sm backdrop-blur-sm">
                                  <Key className="w-5 h-5" />
                                </div>
                                <span className="text-[11px]">Alterar Senha</span>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                if (groupData && groupData.users.length === 1 && currentUser.changeRequests?.some((r: any) => r.username === currentUser.login && r.type === 'date' && r.status === 'aguardando')) {
                                  showAlertDialog("Você já possui uma solicitação de alteração de vencimento em andamento.");
                                } else if (groupData && groupData.users.length > 1) {
                                  setPendingChangeAction('date');
                                  setShowDevicePickerModal(true);
                                } else {
                                  setShowDateChangeModal(true);
                                }
                              }}
                              className="bg-bg-surface hover:bg-bg-surface-hover border border-border-base text-text-base font-semibold py-3 px-3 rounded-2xl transition-colors flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95"
                            >
                              <div className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                                <div className="w-10 h-10 bg-primary-100/50 text-primary-600 rounded-xl flex items-center justify-center border border-primary-200 shadow-sm backdrop-blur-sm">
                                  <CalendarDays className="w-5 h-5" />
                                </div>
                                <span className="text-[11px]">Alterar Vencimento</span>
                              </div>
                            </button>
                            <button
                              onClick={async () => {
                                if (!currentUser) return;
                                setLoading(true);
                                try {
                                  const res = await fetch("/api/user", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ username: currentUser.login, deviceId: deviceId || localStorage.getItem("vpn_device_id") }),
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    setCurrentUser(data);
                                    if (data.refundRequest?.status === 'aguardando') {
                                      showAlertDialog("Você já possui uma solicitação de reembolso em andamento.");
                                    } else {
                                      setShowRefundModal(true);
                                    }
                                  }
                                } catch (e) {
                                  console.error(e);
                                } finally {
                                  setLoading(false);
                                }
                              }}
                              className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold py-3 px-3 rounded-2xl transition-colors flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95"
                            >
                              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-red-600 shadow-sm">
                                <XCircle className="w-4 h-4" />
                              </div>
                              <span className="text-[11px]">Reembolso</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Group & Plan Section */}
                  {groupData && showData && (
                    <div className="bg-bg-surface-hover rounded-3xl p-5 border border-border-base flex flex-col gap-4 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500 opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>

                      <div className="flex justify-between items-center relative z-10 p-1">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-primary-100/50 flex items-center justify-center text-primary-600">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-text-base leading-tight">Meu Plano</h3>
                            <p className="text-[10px] uppercase font-semibold text-text-muted tracking-wider">
                              {groupData.plan.plan_months} Mês(es) / {groupData.plan.plan_devices} Celular(es)
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowPlanModal(true)}
                          className="bg-bg-surface hover:bg-border-base border border-border-base text-primary-600 px-3 py-1.5 rounded-xl font-semibold transition-colors text-xs shadow-sm active:scale-95"
                        >
                          Alterar
                        </button>
                      </div>

                      <div className="space-y-3 relative z-10 pt-2 border-t border-border-base/50">
                        <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider pl-1">Aparelhos Vinculados ({groupData.users.length}/{groupData.plan.plan_devices})</h4>

                        <div className="space-y-2">
                          {groupUsersDetails.length > 0 ? (
                            [...groupUsersDetails].sort((a, b) =>
                              a.login === currentUser.login ? -1 : b.login === currentUser.login ? 1 : 0
                            ).map((u, index) => (
                              <div key={u.login} className="bg-bg-surface p-3 rounded-2xl border border-border-base flex justify-between items-center shadow-sm">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-primary-600 font-bold uppercase tracking-wider mb-0.5">Aparelho {index + 1}</span>
                                  <span className="text-sm font-bold text-text-base">{u.login} {u.login === currentUser.login && <span className="text-text-muted font-medium text-xs ml-1">(Você)</span>}</span>
                                </div>
                                {u.login !== currentUser.login && (
                                  <button
                                    onClick={() => handleRemoveDevice(u.login)}
                                    className="text-red-500 hover:text-red-700 p-2 bg-red-50 hover:bg-red-100 rounded-xl transition-colors active:scale-95"
                                    title="Remover aparelho"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))
                          ) : (
                            [...groupData.users].sort((a, b) =>
                              a === currentUser.login ? -1 : b === currentUser.login ? 1 : 0
                            ).map((u, index) => (
                              <div key={u} className="bg-bg-surface p-3 rounded-2xl border border-border-base flex justify-between items-center shadow-sm">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-primary-600 font-bold uppercase tracking-wider mb-0.5">Aparelho {index + 1}</span>
                                  <span className="text-sm font-bold text-text-base">{u} {u === currentUser.login && <span className="text-text-muted font-medium text-xs ml-1">(Você)</span>}</span>
                                </div>
                                {u !== currentUser.login && (
                                  <button
                                    onClick={() => handleRemoveDevice(u)}
                                    className="text-red-500 hover:text-red-700 p-2 bg-red-50 hover:bg-red-100 rounded-xl transition-colors active:scale-95"
                                    title="Remover aparelho"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>

                        {groupData.users.length < (groupData.plan.plan_type === 'devices' ? groupData.plan.plan_devices : 1) && (
                          <button
                            onClick={() => {
                              setPendingPlan({ type: groupData.plan.plan_type, months: groupData.plan.plan_months, devices: groupData.plan.plan_devices, price: groupData.plan.plan_price });
                              setPlanUpgradeStep('prompt');
                              setShowPlanModal(true);
                            }}
                            className="w-full bg-primary-50 hover:bg-primary-100 text-primary-700 font-bold py-3 px-4 rounded-2xl transition-all text-sm flex items-center justify-center mt-3 border border-primary-200 border-dashed active:scale-[0.98]"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Vincular Aparelho Extra
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* My Requests Section */}
                  {showData && (currentUser.changeRequests?.length > 0 || currentUser.refundRequest) && (
                    <div className="bg-bg-surface-hover rounded-3xl p-5 border border-border-base flex flex-col gap-4 shadow-sm relative overflow-hidden">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                          <RefreshCw className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-text-base leading-tight">Minhas Solicitações</h3>
                      </div>

                      <div className="space-y-3">
                        {currentUser.changeRequests?.map((req: any) => (
                          <div key={req.id} className="bg-bg-surface p-3 rounded-2xl border border-border-base flex justify-between items-center shadow-sm">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-bold text-text-base">
                                  {req.type === 'date' ? 'Alteração de Vencimento' : req.type === 'username' ? 'Alteração de Usuário' : req.type === 'uuid' ? 'Solicitação de UUID' : 'Alteração de Senha'}
                                </p>
                                <span className="text-[10px] bg-primary-100 text-primary-700 px-2 py-0.5 rounded-md font-bold border border-primary-200">{getDeviceLabel(req.username)}</span>
                              </div>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                                {req.type === 'uuid' ? 'Aguarda ação do admin' : `Valor: ${req.requested_value}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-lg font-bold ${req.status === 'aprovado' ? 'bg-green-100/50 text-green-700 border border-green-200' :
                                req.status === 'aguardando' ? 'bg-amber-100/50 text-amber-700 border border-amber-200' :
                                  'bg-red-100/50 text-red-700 border border-red-200'
                                }`}>
                                {req.status === 'aprovado' ? 'Aprovado' : req.status === 'aguardando' ? 'Aguardando' : 'Rejeitado'}
                              </span>
                              {req.status === 'aguardando' && (
                                <button
                                  onClick={() => confirmAction("Cancelar solicitação", "Tem certeza que deseja cancelar esta solicitação?", () => cancelChangeRequest(req.id))}
                                  className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors border border-red-100"
                                  title="Cancelar solicitação"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {currentUser.refundRequest && (
                          <div className="bg-bg-surface p-3 rounded-2xl border border-border-base flex justify-between items-center shadow-sm">
                            <div className="flex flex-col gap-1">
                              <p className="text-xs font-bold text-text-base">Reembolso</p>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold overflow-hidden text-ellipsis max-w-[150px]">PIX: {currentUser.refundRequest.pix_key}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-lg font-bold ${currentUser.refundRequest.status === 'realizado' ? 'bg-green-100/50 text-green-700 border border-green-200' :
                                currentUser.refundRequest.status === 'aguardando' ? 'bg-amber-100/50 text-amber-700 border border-amber-200' :
                                  'bg-red-100/50 text-red-700 border border-red-200'
                                }`}>
                                {currentUser.refundRequest.status === 'realizado' ? 'Realizado' : currentUser.refundRequest.status === 'aguardando' ? 'Aguardando' : 'Rejeitado'}
                              </span>
                              {currentUser.refundRequest.status === 'aguardando' && (
                                <button
                                  onClick={() => confirmAction("Cancelar reembolso", "Tem certeza que deseja cancelar a solicitação de reembolso?", () => cancelRefundRequest(currentUser.refundRequest.id))}
                                  className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors border border-red-100"
                                  title="Cancelar solicitação de reembolso"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!showData && (
                    <div className="relative overflow-hidden bg-gradient-to-br from-bg-surface to-bg-surface-hover border border-border-base rounded-3xl p-6 shadow-md text-center">
                      <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary-600 shadow-inner">
                        <Lock className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-lg text-text-base mb-1">Dados Ocultos</h3>
                      <p className="text-xs text-text-muted mb-5 font-medium px-4">Digite sua senha atual para liberar a visualização dos dados confidenciais acima.</p>

                      <form onSubmit={handleVerifyPassword} className="flex flex-col gap-3">
                        <input
                          type="password"
                          value={verifyPassword}
                          onChange={(e) => setVerifyPassword(e.target.value)}
                          placeholder="Sua senha de acesso"
                          className="w-full px-4 py-3.5 rounded-2xl bg-bg-surface border border-border-base focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 outline-none text-sm font-semibold text-center tracking-widest transition-all shadow-sm"
                        />
                        <button
                          type="submit"
                          disabled={isVerifying || !verifyPassword}
                          className="w-full bg-text-base hover:bg-black text-bg-base font-bold px-4 py-3.5 rounded-2xl text-sm transition-all disabled:opacity-70 flex items-center justify-center shadow-lg active:scale-95"
                        >
                          {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                          Revelar Dados
                        </button>
                      </form>
                      {verifyError && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 text-xs mt-3 font-semibold">{verifyError}</motion.p>}
                    </div>
                  )}

                  {/* Loyalty Points Section */}
                  {showData && (
                    <div className="bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-200/30 rounded-3xl p-5 shadow-sm mt-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400 opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                      <div className="flex items-center justify-between mb-3 relative z-10">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-yellow-100 flex items-center justify-center text-yellow-600 shadow-inner">
                            <Star className="w-4 h-4" />
                          </div>
                          <h3 className="text-sm font-bold text-text-base">Programa de Fidelidade</h3>
                        </div>
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-xl border border-yellow-200 shadow-sm">
                          {calcLoyaltyPoints(currentUser.payments || []) || 0}/3 Pontos
                        </span>
                      </div>
                      <div className="flex flex-col mb-1 relative z-10 px-0.5 space-y-3">
                        <p className="text-xs text-text-muted font-medium leading-relaxed">
                          Pague em dia ou adiantado e ganhe 1 ponto. Junte 3 pontos e ganhe <strong className="text-green-600 bg-green-50 px-1 py-0.5 rounded">20% de desconto</strong> na próxima renovação!
                        </p>
                        <div className="w-full bg-bg-surface-hover rounded-full h-3 mb-1 border border-border-base/50 p-0.5 overflow-hidden">
                          <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(250,204,21,0.5)]" style={{ width: `${((calcLoyaltyPoints(currentUser.payments || []) || 0) / 3) * 100}%` }}></div>
                        </div>
                        <button
                          onClick={() => setShowHistory(!showHistory)}
                          className="w-full text-[11px] uppercase tracking-wider font-bold bg-bg-surface hover:bg-border-base text-yellow-700 border border-yellow-200/50 px-4 py-3 rounded-xl transition-colors shadow-sm active:scale-95 flex justify-center items-center mt-2"
                        >
                          <History className="w-3.5 h-3.5 mr-2 opacity-80" />
                          {showHistory ? "Ocultar Histórico" : "Ver Histórico de Transações"}
                        </button>
                      </div>

                      <AnimatePresence>
                        {showHistory && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="space-y-2 border-t border-yellow-200/30 pt-4 mt-2"
                          >
                            {(!currentUser.payments || currentUser.payments.filter((p: any) => p.status === "approved").length === 0) ? (
                              <div className="bg-bg-surface/50 border border-border-base/50 rounded-2xl p-4 text-center">
                                <p className="text-xs font-semibold text-text-muted">Nenhum pagamento registrado.</p>
                              </div>
                            ) : (
                              currentUser.payments.filter((p: any) => p.status === "approved").map((payment: any, idx: number) => {
                                let meta: any = {};
                                try { if (payment.metadata) meta = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata; } catch (e) { }
                                const amount = meta.amount || 0;
                                const earnedPoint = meta.paidOnTime === true && !meta.discountApplied;
                                const usedDiscount = meta.discountApplied === true;
                                return (
                                  <div key={payment.id || idx} className="flex flex-col bg-bg-surface p-3 rounded-2xl border border-border-base shadow-sm">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-sm font-bold text-text-base">
                                        {payment.type === 'new_device' ? 'Novo Aparelho' : 'Renovação do Plano'}
                                      </span>
                                      {earnedPoint && (
                                        <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">+1 Ponto</span>
                                      )}
                                      {usedDiscount && (
                                        <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">Desconto -20%</span>
                                      )}
                                      {!earnedPoint && !usedDiscount && (
                                        <span className="text-xs font-bold text-text-muted bg-bg-surface-hover px-2 py-0.5 rounded border border-border-base">Sem ponto</span>
                                      )}
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] text-text-muted font-medium">
                                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(payment.paid_at || payment.created_at)}</span>
                                      <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> {amount ? `R$ ${amount},00` : "—"}</span>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Referrals Section */}
                  {showData && (
                    <div className="bg-gradient-to-br from-primary-500/5 to-transparent border border-primary-200/30 rounded-3xl p-5 shadow-sm mt-4 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary-400 opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                      <div className="flex flex-col mb-3 relative z-10 space-y-4">
                        <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-5 rounded-2xl text-white shadow-md relative overflow-hidden group w-full">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:scale-110 transition-transform duration-500"></div>
                          <h3 className="text-sm font-bold text-white">Indique e Ganhe</h3>
                          <p className="text-[11px] text-white/90 mt-1 mb-3">Recomende nosso app para um amigo e ganhe 1 mês grátis quando ele assinar!</p>
                          <div className="bg-black/10 rounded-xl p-3 backdrop-blur-sm border border-white/10 text-xs">
                            <p className="font-semibold mb-1">Como funciona:</p>
                            <ol className="list-decimal pl-4 space-y-1 text-[11px] text-white/90">
                              <li>Copie seu link de indicação abaixo e envie para o amigo.</li>
                              <li>Ao abrir o link, a página já abre com seu usuário preenchido automaticamente.</li>
                              <li>Quando ele assinar, você ganha 30 dias grátis!</li>
                            </ol>
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          <p className="text-[11px] text-text-muted font-medium text-center leading-relaxed">
                            Seu código de indicação: <strong className="font-mono bg-bg-surface border border-border-base px-2 py-1 rounded-lg text-text-base">{currentUser.login}</strong>
                          </p>
                          <button
                            onClick={() => copyToClipboard(`https://vsplusnet.com.br/?ref=${currentUser.login}`)}
                            className="w-full text-[11px] font-bold bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl transition-colors shadow-sm active:scale-95 flex justify-center items-center gap-2"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copiar Link de Indicação
                          </button>
                        </div>
                        <button
                          onClick={() => setShowReferrals(!showReferrals)}
                          className="w-full text-[11px] uppercase tracking-wider font-bold bg-bg-surface hover:bg-border-base text-primary-600 border border-border-base px-4 py-3 rounded-xl transition-colors shadow-sm active:scale-95 flex justify-center items-center"
                        >
                          {showReferrals ? "Ocultar Indicações" : "Ver Indicações"}
                        </button>
                      </div>

                      <AnimatePresence>
                        {showReferrals && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="space-y-2 border-t border-border-base/50 pt-4 mt-2"
                          >
                            {(!currentUser.referrals || currentUser.referrals.length === 0) ? (
                              <div className="bg-bg-surface/50 border border-border-base/50 rounded-2xl p-4 text-center">
                                <p className="text-sm font-semibold text-text-muted">Você ainda não indicou ninguém.</p>
                              </div>
                            ) : (
                              currentUser.referrals.map((ref) => (
                                <div key={ref.id} className="flex justify-between items-center bg-bg-surface p-3 rounded-2xl border border-border-base shadow-sm">
                                  <span className="text-sm font-bold text-text-base">{ref.referred_username}</span>
                                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg ${ref.status === 'testing' ? 'bg-yellow-100/50 text-yellow-700 border border-yellow-200' :
                                    ref.status === 'paid' ? 'bg-blue-100/50 text-blue-700 border border-blue-200' :
                                      'bg-green-100/50 text-green-700 border border-green-200'
                                    }`}>
                                    {ref.status === 'testing' ? 'Testando' :
                                      ref.status === 'paid' ? 'Pagou' :
                                        'Bônus Recebido'}
                                  </span>
                                </div>
                              ))
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {error && (
                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 mt-6">
                    <button className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-bg-surface border border-border-base hover:bg-bg-surface-hover transition-colors shadow-sm w-full">
                      <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center shadow-inner">
                        <Download className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-medium text-text-muted">Baixar App CloudBR DT</span>
                    </button>
                    <button
                      onClick={() => { setView("help"); }}
                      className="w-full bg-bg-base border border-border-base hover:bg-bg-surface-hover text-text-base font-bold py-3.5 px-4 rounded-2xl transition-all flex items-center justify-center shadow-sm text-sm active:scale-95 mb-6"
                    >
                      <HelpCircle className="w-5 h-5 mr-3 text-text-muted" />
                      Central de Ajuda
                    </button>
                  </div>
                </div>

                {/* Plan Modal */}
                <AnimatePresence>
                  {showPlanModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    >
                      <motion.div
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        className="bg-bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col border border-border-base/50"
                      >
                        <div className="p-5 border-b border-border-base/50 flex justify-between items-center bg-gradient-to-r from-bg-surface to-bg-surface-hover">
                          <h2 className="text-xl font-bold text-text-base">
                            {planUpgradeStep === 'select' ? 'Alterar Plano' :
                              planUpgradeStep === 'prompt' ? 'Novo Aparelho' :
                                planUpgradeStep === 'existing' ? 'Vincular Acesso' :
                                  planUpgradeStep === 'new' ? 'Criar Acesso' : 'Pagamento'}
                          </h2>
                          <button onClick={() => {
                            if (planUpgradeStep !== 'select' && planUpgradeStep !== 'pix') {
                              setPlanUpgradeStep('select');
                            } else {
                              setShowPlanModal(false);
                              setPlanUpgradeStep('select');
                            }
                          }} className="text-text-muted hover:text-text-muted">
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1 space-y-6">
                          {planUpgradeStep === 'select' && (
                            <div className="space-y-8">
                              {/* Months selector */}
                              <div>
                                <h3 className="font-semibold text-text-base mb-1 flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-primary-600" />
                                  Meses
                                </h3>
                                <p className="text-xs text-text-muted mb-3">Plano base: 1 mês. Cada mês extra: +R$ 10.</p>
                                <div className="flex items-center justify-between bg-bg-surface-hover rounded-2xl p-4 border border-border-base">
                                  <button
                                    onClick={() => setPlanMonths(m => Math.max(1, m - 1))}
                                    className="w-10 h-10 rounded-xl bg-bg-surface border border-border-base text-xl font-bold text-primary-600 flex items-center justify-center hover:bg-primary-50 active:scale-95 transition-all"
                                  >-</button>
                                  <div className="text-center">
                                    <p className="text-3xl font-black text-text-base">{planMonths}</p>
                                    <p className="text-xs text-text-muted font-medium">{planMonths === 1 ? 'Mês' : 'Meses'}</p>
                                  </div>
                                  <button
                                    onClick={() => setPlanMonths(m => Math.min(12, m + 1))}
                                    className="w-10 h-10 rounded-xl bg-primary-600 text-white text-xl font-bold flex items-center justify-center hover:bg-primary-700 active:scale-95 transition-all shadow-md"
                                  >+</button>
                                </div>
                              </div>

                              {/* Devices selector */}
                              <div>
                                <h3 className="font-semibold text-text-base mb-1 flex items-center gap-2">
                                  <Smartphone className="w-4 h-4 text-blue-600" />
                                  Celulares
                                </h3>
                                <p className="text-xs text-text-muted mb-3">Plano base: 1 celular. Cada celular extra: +R$ 10.</p>
                                <div className="flex items-center justify-between bg-bg-surface-hover rounded-2xl p-4 border border-border-base">
                                  <button
                                    onClick={() => setPlanDevices(d => Math.max(1, d - 1))}
                                    className="w-10 h-10 rounded-xl bg-bg-surface border border-border-base text-xl font-bold text-blue-600 flex items-center justify-center hover:bg-blue-50 active:scale-95 transition-all"
                                  >-</button>
                                  <div className="text-center">
                                    <p className="text-3xl font-black text-text-base">{planDevices}</p>
                                    <p className="text-xs text-text-muted font-medium">{planDevices === 1 ? 'Celular' : 'Celulares'}</p>
                                  </div>
                                  <button
                                    onClick={() => setPlanDevices(d => Math.min(10, d + 1))}
                                    className="w-10 h-10 rounded-xl bg-blue-600 text-white text-xl font-bold flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                                  >+</button>
                                </div>
                              </div>

                              {/* Price preview */}
                              <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl p-5 text-white">
                                <p className="text-white/70 text-xs font-bold uppercase tracking-wider mb-3">Resumo do Plano</p>
                                <div className="space-y-1.5 text-sm mb-4">
                                  <div className="flex justify-between">
                                    <span className="text-white/80">Taxa base</span>
                                    <span className="font-bold">R$ 5</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-white/80">{planDevices} celular{planDevices > 1 ? "es" : ""} × {planMonths} {planMonths > 1 ? "meses" : "mês"} × R$ 10</span>
                                    <span className="font-bold">+ R$ {planDevices * planMonths * 10}</span>
                                  </div>
                                  {calcLoyaltyPoints(currentUser?.payments || []) >= 3 && (
                                    <div className="flex justify-between text-green-300">
                                      <span className="font-bold">🎉 Desconto fidelidade -20%</span>
                                      <span className="font-bold">- R$ {Math.round(calcPlanPrice(planMonths, planDevices) * 0.2)}</span>
                                    </div>
                                  )}
                                  <div className="border-t border-white/20 pt-2 mt-2 flex justify-between">
                                    <span className="font-black text-lg">Total</span>
                                    <span className="font-black text-2xl">
                                      R$ {calcLoyaltyPoints(currentUser?.payments || []) >= 3
                                        ? Math.floor(calcPlanPrice(planMonths, planDevices) * 0.8)
                                        : calcPlanPrice(planMonths, planDevices)}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleSelectPlan('custom', planMonths, planDevices, calcPlanPrice(planMonths, planDevices))}
                                  className="w-full bg-white text-primary-700 font-black py-3.5 rounded-2xl text-base hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg"
                                >
                                  Selecionar e Continuar
                                </button>
                              </div>
                            </div>
                          )}

                          {planUpgradeStep === 'prompt' && (
                            <div className="space-y-4">
                              <p className="text-text-muted text-sm">
                                Você está adicionando um novo aparelho ao seu plano. O segundo aparelho já possui um acesso criado ou você deseja criar um novo?
                              </p>
                              <div className="grid gap-3">
                                <button
                                  onClick={() => setPlanUpgradeStep('existing')}
                                  className="w-full bg-bg-surface border-2 border-border-base hover:border-primary-500 hover:bg-primary-50 text-text-base font-medium py-4 px-4 rounded-xl transition-colors text-left"
                                >
                                  <div className="font-bold text-primary-700 mb-1">Já tenho um acesso</div>
                                  <div className="text-sm text-text-muted font-normal">Vou apenas vincular uma conta existente ao meu grupo.</div>
                                </button>
                                <button
                                  onClick={() => setPlanUpgradeStep('new')}
                                  className="w-full bg-bg-surface border-2 border-border-base hover:border-blue-500 hover:bg-blue-50 text-text-base font-medium py-4 px-4 rounded-xl transition-colors text-left"
                                >
                                  <div className="font-bold text-blue-700 mb-1">Criar novo acesso</div>
                                  <div className="text-sm text-text-muted font-normal">Quero criar um usuário novo e pagar a diferença dos dias restantes.</div>
                                </button>
                              </div>
                            </div>
                          )}

                          {planUpgradeStep === 'existing' && (
                            <div className="space-y-4">
                              <p className="text-text-muted text-sm">
                                Digite o usuário e senha do acesso que você deseja vincular ao seu grupo.
                              </p>
                              <div className="space-y-3">
                                <input
                                  type="text"
                                  value={upgradeUsername}
                                  onChange={handleUpgradeUsernameChange}
                                  placeholder="Usuário do aparelho"
                                  className="w-full px-4 py-3 rounded-xl border border-border-base focus:ring-2 focus:ring-primary-500 outline-none"
                                />
                                <input
                                  type="password"
                                  value={upgradePassword}
                                  onChange={(e) => setUpgradePassword(e.target.value)}
                                  placeholder="Senha do usuário"
                                  className="w-full px-4 py-3 rounded-xl border border-border-base focus:ring-2 focus:ring-primary-500 outline-none"
                                />
                              </div>
                              {upgradeError && <p className="text-red-500 text-sm">{upgradeError}</p>}
                              <button
                                onClick={handleLinkExistingDevice}
                                disabled={loading || !upgradeUsername || !upgradePassword}
                                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-70 flex justify-center items-center"
                              >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Vincular Aparelho"}
                              </button>
                            </div>
                          )}

                          {planUpgradeStep === 'new' && (
                            <div className="space-y-4">
                              <p className="text-text-muted text-sm">
                                Escolha um nome de usuário para o novo aparelho. O valor será calculado proporcionalmente aos dias restantes do seu plano principal.
                              </p>
                              <div>
                                <input
                                  type="text"
                                  value={upgradeUsername}
                                  onChange={handleUpgradeUsernameChange}
                                  placeholder="Novo usuário"
                                  className="w-full px-4 py-3 rounded-xl border border-border-base focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                              </div>
                              {upgradeError && <p className="text-red-500 text-sm">{upgradeError}</p>}
                              <button
                                onClick={handleCreateNewDevicePix}
                                disabled={loading || !upgradeUsername}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-70 flex justify-center items-center"
                              >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Continuar para Pagamento"}
                              </button>
                            </div>
                          )}

                          {planUpgradeStep === 'pix' && upgradePix && (
                            <div className="space-y-6 text-center">
                              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <p className="text-sm text-blue-800 mb-1">Valor proporcional para <strong>{upgradePix.remainingDays} dias</strong>:</p>
                                <p className="text-3xl font-bold text-blue-900">R$ {upgradePix.amount.toFixed(2).replace('.', ',')}</p>
                              </div>

                              <div className="bg-bg-surface p-4 rounded-xl border border-border-base inline-block">
                                <img
                                  src={`data:image/png;base64,${upgradePix.qrCodeBase64}`}
                                  alt="QR Code PIX"
                                  className="w-48 h-48 mx-auto"
                                />
                              </div>

                              <div className="space-y-3">
                                <button
                                  onClick={() => copyToClipboard(upgradePix.qrCode)}
                                  className="w-full bg-bg-surface-hover hover:bg-bg-surface text-text-base font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center"
                                >
                                  <Copy className="w-5 h-5 mr-2" />
                                  Copiar Código PIX
                                </button>
                                <p className="text-sm text-text-muted flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                  Aguardando pagamento...
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Device Picker Modal for Multi-device groups */}
                <AnimatePresence>
                  {showDevicePickerModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-border-base/50"
                      >
                        <div className="p-5 border-b border-border-base/50 flex justify-between items-center bg-gradient-to-r from-bg-surface to-bg-surface-hover">
                          <h2 className="text-xl font-bold text-text-base">Selecionar Aparelho</h2>
                          <button onClick={() => setShowDevicePickerModal(false)} className="text-text-muted hover:text-text-base">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="p-6">
                          <p className="text-sm text-text-muted mb-6">
                            Em qual aparelho você deseja realizar esta alteração?
                          </p>
                          <div className="space-y-3">
                            {(groupUsersDetails.length > 0
                              ? [...groupUsersDetails].sort((a, b) =>
                                  a.login === currentUser.login ? -1 : b.login === currentUser.login ? 1 : 0
                                )
                              : [currentUser]
                            ).map((device, idx) => (
                              <button
                                key={device.login}
                                onClick={() => handleDevicePick(device.login)}
                                className="w-full flex items-center justify-between p-4 rounded-2xl border border-border-base bg-bg-base hover:bg-primary-50 hover:border-primary-200 transition-all group active:scale-[0.98]"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-bg-surface-hover flex items-center justify-center text-text-muted group-hover:bg-primary-100 group-hover:text-primary-600 transition-colors">
                                    <Smartphone className="w-5 h-5" />
                                  </div>
                                  <div className="text-left">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Aparelho {idx + 1}</p>
                                    <p className="text-sm font-bold text-text-base font-mono">{device.login}</p>
                                  </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-primary-600 transition-colors" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Date Change Modal */}
                <AnimatePresence>
                  {showDateChangeModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    >
                      <motion.div
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        className="bg-bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-border-base/50"
                      >
                        <div className="p-5 border-b border-border-base/50 flex justify-between items-center bg-gradient-to-r from-bg-surface to-bg-surface-hover">
                          <h2 className="text-xl font-bold text-text-base">Alterar Data de Vencimento</h2>
                          <button onClick={() => setShowDateChangeModal(false)} className="text-text-muted hover:text-text-base">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="p-6 space-y-4">
                          <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-100 rounded-xl mb-2">
                            <Smartphone className="w-4 h-4 text-primary-600" />
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-primary-600 leading-none">Editando: {getDeviceLabel(selectedChangeDevice || currentUser?.login || "")}</span>
                              <span className="text-xs font-mono font-bold text-text-base leading-tight">{selectedChangeDevice || currentUser?.login}</span>
                            </div>
                          </div>
                          <p className="text-sm text-text-muted mb-4">
                            Você pode alterar sua data de vencimento em até 15 dias de diferença da data atual. Limite de 1 alteração a cada 30 dias.
                          </p>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-text-base mb-1">Nova Data Desejada</label>
                              <input
                                type="date"
                                value={newDate}
                                onChange={(e) => setNewDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-border-base focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-bg-base text-text-base"
                              />
                            </div>
                            {requestStatus && (
                              <div className={`p-3 rounded-lg text-sm ${requestStatus.includes('sucesso') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {requestStatus}
                              </div>
                            )}
                            <button
                              onClick={handleDateChange}
                              disabled={loading || !newDate}
                              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-xl transition-colors disabled:opacity-70 flex items-center justify-center"
                            >
                              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Alterar Data"}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Username Change Modal */}
                <AnimatePresence>
                  {showUsernameChangeModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    >
                      <motion.div
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        className="bg-bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-border-base/50"
                      >
                        <div className="p-5 border-b border-border-base/50 flex justify-between items-center bg-gradient-to-r from-bg-surface to-bg-surface-hover">
                          <h2 className="text-xl font-bold text-text-base">Alterar Usuário</h2>
                          <button onClick={() => setShowUsernameChangeModal(false)} className="text-text-muted hover:text-text-base">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="p-6 space-y-4">
                          <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-100 rounded-xl mb-2">
                            <Smartphone className="w-4 h-4 text-primary-600" />
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-primary-600 leading-none">Editando: {getDeviceLabel(selectedChangeDevice || currentUser?.login || "")}</span>
                              <span className="text-xs font-mono font-bold text-text-base leading-tight">{selectedChangeDevice || currentUser?.login}</span>
                            </div>
                          </div>
                          <p className="text-sm text-text-muted">
                            Digite o novo nome de usuário desejado. Todo o seu histórico será migrado automaticamente.
                          </p>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-text-base mb-1">Alterar Usuário</label>
                              <input
                                type="text"
                                value={changeUsernameValue}
                                onChange={(e) => setChangeUsernameValue(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-border-base focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-bg-base text-text-base"
                                placeholder="Digite o novo usuário"
                              />
                            </div>
                            {requestStatus && (
                              <div className={`p-3 rounded-lg text-sm ${requestStatus.includes('sucesso') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {requestStatus}
                              </div>
                            )}
                            <button
                              onClick={handleUsernameChange}
                              disabled={loading || !changeUsernameValue}
                              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-xl transition-colors disabled:opacity-70 flex items-center justify-center"
                            >
                              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Alterar Usuário"}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                 <AnimatePresence>
                  {showVerifyModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4"
                    >
                      <motion.div
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        className="bg-bg-surface rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-border-base/50"
                      >
                        <div className="p-5 border-b border-border-base/50 flex justify-between items-center bg-primary-600 text-white">
                          <h2 className="text-lg font-bold">Confirmar Senha</h2>
                          <button onClick={() => setShowVerifyModal(false)} className="text-white/70 hover:text-white">
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                        <form onSubmit={handleVerifyPassword} className="p-6 space-y-4">
                          <p className="text-sm text-text-muted">
                            Para sua segurança, digite sua senha do painel para desbloquear o acesso completo neste aparelho.
                          </p>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-wider pl-1">Senha de Acesso</label>
                            <input
                              type="password"
                              value={verifyPassword}
                              onChange={(e) => setVerifyPassword(e.target.value)}
                              placeholder="Digite sua senha"
                              className="w-full px-4 py-3 rounded-xl border border-border-base bg-bg-base text-text-base focus:ring-2 focus:ring-primary-500 outline-none"
                              autoFocus
                            />
                            {verifyError && <p className="text-red-500 text-xs pl-1 font-medium">{verifyError}</p>}
                          </div>
                          <button
                            type="submit"
                            disabled={isVerifying || !verifyPassword}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                          >
                            {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar e Desbloquear"}
                          </button>
                        </form>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Password Change Modal */}
                <AnimatePresence>
                  {showPasswordChangeModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    >
                      <motion.div
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        className="bg-bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-border-base/50"
                      >
                        <div className="p-5 border-b border-border-base/50 flex justify-between items-center bg-gradient-to-r from-bg-surface to-bg-surface-hover">
                          <h2 className="text-xl font-bold text-text-base">Alterar Senha</h2>
                          <button onClick={() => setShowPasswordChangeModal(false)} className="text-text-muted hover:text-text-base">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="p-6 space-y-4">
                          <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-100 rounded-xl mb-2">
                            <Smartphone className="w-4 h-4 text-primary-600" />
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-primary-600 leading-none">Editando: {getDeviceLabel(selectedChangeDevice || currentUser?.login || "")}</span>
                              <span className="text-xs font-mono font-bold text-text-base leading-tight">{selectedChangeDevice || currentUser?.login}</span>
                            </div>
                          </div>
                          <p className="text-sm text-text-muted">
                            Digite a nova senha desejada para o seu acesso (apenas números, entre 4 e 10 dígitos).
                          </p>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-text-base mb-1">Alterar Senha</label>
                              <input
                                type="password"
                                inputMode="numeric"
                                pattern="\d{4,10}"
                                maxLength={10}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-3 py-2 rounded-lg border border-border-base focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-bg-base text-text-base"
                                placeholder="Digite a nova senha (4 a 10 números)"
                              />
                            </div>
                            {requestStatus && (
                              <div className={`p-3 rounded-lg text-sm ${requestStatus.includes('sucesso') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {requestStatus}
                              </div>
                            )}
                            <button
                              onClick={handlePasswordChange}
                              disabled={loading || !newPassword}
                              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-xl transition-colors disabled:opacity-70 flex items-center justify-center"
                            >
                              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Alterar Senha"}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Refund Modal */}
                <AnimatePresence>
                  {showRefundModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    >
                      <motion.div
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        className="bg-bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-border-base/50"
                      >
                        <div className="p-5 border-b border-border-base/50 flex justify-between items-center bg-gradient-to-r from-bg-surface to-bg-surface-hover">
                          <h2 className="text-xl font-bold text-text-base">Cancelar Plano / Reembolso</h2>
                          <button onClick={() => setShowRefundModal(false)} className="text-text-muted hover:text-text-base">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="p-6">
                          {currentUser?.refundRequest ? (
                            <div className="text-center py-4">
                              {currentUser.refundRequest.status === 'realizado' ? (
                                <div className="space-y-4">
                                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-1" />
                                  <h3 className="text-lg font-bold text-text-base">Reembolso Concluído</h3>
                                  <p className="text-text-muted text-xs">
                                    O seu reembolso foi aprovado e processado com sucesso.
                                  </p>
                                  <div className="bg-bg-surface-hover p-4 rounded-2xl border border-border-base text-left space-y-3 shadow-inner">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-text-muted font-medium">Data/Hora:</span>
                                      <span className="font-bold text-text-base">{formatDate(currentUser.refundRequest.refunded_at)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-text-muted font-medium">Chave Pix:</span>
                                      <span className="font-bold text-text-base">{currentUser.refundRequest.pix_key}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-text-muted font-medium">Tipo:</span>
                                      <span className="font-bold text-text-base uppercase">{currentUser.refundRequest.pix_type}</span>
                                    </div>
                                  </div>
                                  <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                                    <p className="text-[11px] text-amber-800 leading-tight">
                                      Os pontos de fidelidade foram revogados devido ao reembolso. Seu acesso permanecerá inativo após o vencimento atual.
                                    </p>
                                  </div>
                                </div>
                              ) : currentUser.refundRequest.status === 'rejeitado' ? (
                                <div className="text-center py-4">
                                  <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                                  <h3 className="text-lg font-medium text-text-base mb-2">Reembolso Rejeitado</h3>
                                  <p className="text-text-muted text-sm px-4">Sua solicitação de reembolso foi analisada e não pôde ser atendida no momento.</p>
                                  <p className="text-text-muted text-[11px] mt-4">Para mais informações, abra um ticket de suporte.</p>
                                </div>
                              ) : (
                                <>
                                  <Clock className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                                  <h3 className="text-lg font-medium text-text-base mb-2">Reembolso em Andamento</h3>
                                  <p className="text-text-muted text-sm px-4">Sua solicitação está aguardando revisão pelo administrador e será processada em breve.</p>
                                </>
                              )}
                            </div>
                          ) : (
                            <>
                              {(() => {
                                const isEligible = currentUser?.lastPaymentDate ?
                                  (new Date().getTime() - new Date(currentUser.lastPaymentDate).getTime()) / (1000 * 3600 * 24) <= 7 : false;

                                if (!isEligible) {
                                  return (
                                    <div className="text-center py-4">
                                      <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                                      <h3 className="text-lg font-medium text-text-base mb-2">Reembolso Indisponível</h3>
                                      <p className="text-text-muted text-sm mb-4">
                                        {currentUser?.lastPaymentDate
                                          ? "Já se passaram 7 dias desde o seu último pagamento. Você não está mais apto a solicitar reembolso."
                                          : "Você não possui pagamentos recentes registrados no sistema para solicitar reembolso."}
                                      </p>
                                      <p className="text-text-muted text-sm">
                                        Seu acesso continuará ativo até o vencimento ({formatDate(currentUser?.expira || '')}). Para cancelar, basta não renovar no próximo vencimento.
                                      </p>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex items-start">
                                      <Shield className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                                      <p className="text-sm text-blue-800">
                                        Garantia de 7 dias ativa. Você pode solicitar o reembolso do seu último pagamento.
                                      </p>
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-text-base mb-1">Tipo de Chave Pix</label>
                                      <select
                                        value={pixType}
                                        onChange={(e) => setPixType(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-border-base focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-bg-base text-text-base"
                                      >
                                        <option value="cpf">CPF</option>
                                        <option value="cnpj">CNPJ</option>
                                        <option value="telefone">Telefone</option>
                                        <option value="email">E-mail</option>
                                        <option value="aleatoria">Chave Aleatória</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-text-base mb-1">Chave Pix</label>
                                      <input
                                        type="text"
                                        value={pixKey}
                                        onChange={(e) => setPixKey(e.target.value)}
                                        placeholder="Digite sua chave Pix"
                                        className="w-full px-3 py-2 rounded-lg border border-border-base focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-bg-base text-text-base"
                                      />
                                    </div>
                                    {requestStatus && (
                                      <div className={`p-3 rounded-lg text-sm ${requestStatus.includes('sucesso') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                        {requestStatus}
                                      </div>
                                    )}
                                    <button
                                      onClick={handleRefund}
                                      disabled={loading || !pixKey}
                                      className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-xl transition-colors disabled:opacity-70 flex items-center justify-center"
                                    >
                                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Solicitar Reembolso"}
                                    </button>
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Help / Support View */}
            {view === "help" && (
              <motion.div
                key="help"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full flex-1 bg-bg-surface overflow-hidden flex flex-col"
              >
                <div className="bg-primary-600 p-4 flex justify-between items-center flex-shrink-0">
                  {/* Mobile hamburger for help view */}
                  <div className="flex items-center">
                    <button onClick={() => setView("dashboard")} className="text-primary-100 hover:text-white mr-3">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-semibold text-white">Central de Ajuda</h1>
                  </div>
                  <button onClick={() => { fetchUserTickets(); setView("tickets"); }} className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center font-medium">
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Meus Tickets
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-0 bg-bg-surface-hover pb-20 md:pb-0">
                  {/* Como Conectar */}
                  <div className="p-5 border-b border-border-base bg-bg-surface">
                    <h2 className="font-semibold text-text-base flex items-center mb-4">
                      <Smartphone className="w-5 h-5 mr-2 text-blue-600" />
                      Como Conectar (Passo a Passo)
                    </h2>
                    <ol className="space-y-3 text-sm text-text-muted pl-1">
                      <li className="flex items-start"><span className="font-bold text-blue-600 mr-2 mt-0.5">1.</span> <span>Baixe o app CloudBR DT na Play Store.</span></li>
                      <li className="flex items-start"><span className="font-bold text-blue-600 mr-2 mt-0.5">2.</span> <span>Faça login usando seu Usuário e Senha (ou UUID).</span></li>
                      <li className="flex items-start"><span className="font-bold text-blue-600 mr-2 mt-0.5">3.</span> <span>Selecione a opção compatível com sua operadora (TIM/Vivo).</span></li>
                      <li className="flex items-start"><span className="font-bold text-blue-600 mr-2 mt-0.5">4.</span> <span>Desligue o Wi-Fi e ligue os Dados Móveis (chip sem crédito).</span></li>
                      <li className="flex items-start"><span className="font-bold text-blue-600 mr-2 mt-0.5">5.</span> <span>Clique em conectar e aguarde.</span></li>
                      <li className="flex items-start"><span className="font-bold text-blue-600 mr-2 mt-0.5">6.</span> <span>Pronto! Internet ilimitada liberada.</span></li>
                    </ol>
                  </div>

                  {/* Solução de Problemas */}
                  <div className="p-5 border-b border-border-base">
                    <h2 className="font-semibold text-text-base flex items-center mb-4">
                      <Settings2 className="w-5 h-5 mr-2 text-amber-500" />
                      Problemas de Conexão? Resolva Aqui
                    </h2>
                    <div className="space-y-2">
                      {troubleshootingSteps.map((step, i) => (
                        <div key={i} className="bg-bg-surface border border-border-base rounded-xl overflow-hidden shadow-sm">
                          <button
                            onClick={() => setOpenTrouble(openTrouble === i ? null : i)}
                            className="w-full px-4 py-3 text-left flex justify-between items-center hover:bg-bg-surface-hover transition-colors"
                          >
                            <span className="font-medium text-sm text-text-base pr-4">{step.title}</span>
                            {openTrouble === i ? <ChevronUp className="w-4 h-4 text-text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />}
                          </button>
                          {openTrouble === i && (
                            <div className="px-4 pb-4 pt-1 text-sm text-text-muted border-t border-border-base bg-bg-surface-hover/50">
                              {step.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* FAQ */}
                  <div className="p-5">
                    <h2 className="font-semibold text-text-base flex items-center mb-4">
                      <HelpCircle className="w-5 h-5 mr-2 text-primary-600" />
                      Dúvidas Frequentes
                    </h2>
                    <div className="space-y-2">
                      {faqItems.map((faq, i) => (
                        <div key={i} className="bg-bg-surface border border-border-base rounded-xl overflow-hidden shadow-sm">
                          <button
                            onClick={() => setOpenFaq(openFaq === i ? null : i)}
                            className="w-full px-4 py-3 text-left flex justify-between items-center hover:bg-bg-surface-hover transition-colors"
                          >
                            <span className="font-medium text-sm text-text-base pr-4">{faq.title}</span>
                            {openFaq === i ? <ChevronUp className="w-4 h-4 text-text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />}
                          </button>
                          {openFaq === i && (
                            <div className="px-4 pb-4 pt-1 text-sm text-text-muted border-t border-border-base bg-bg-surface-hover/50">
                              {faq.content.includes("http") ? (
                                <span>
                                  {faq.content.split(/(https?:\/\/[^\s]+)/g).map((part, j) =>
                                    part.match(/https?:\/\/[^\s]+/) ? (
                                      <a key={j} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{part}</a>
                                    ) : (
                                      <span key={j}>{part}</span>
                                    )
                                  )}
                                </span>
                              ) : (
                                faq.content
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-bg-surface border-t border-border-base flex-shrink-0">
                  <p className="text-xs text-center text-text-muted mb-2 font-medium">Não conseguiu resolver seu problema?</p>
                  <button
                    onClick={() => { fetchUserTickets(); setView("tickets"); }}
                    className="w-full bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center shadow-sm text-sm"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Abrir Ticket de Suporte
                  </button>
                </div>
              </motion.div>
            )}

            {view === "create_user" && (
              <motion.div
                key="create_user"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="w-full flex-1 flex justify-center items-center p-6"
              >
                <div className="w-full max-w-sm">
                  {/* Glossy Header Effect */}
                  <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-primary-500/10 to-transparent pointer-events-none" />

                  <div className="pt-8 pb-6 text-center flex flex-col items-center relative z-10 space-y-3">
                    <button
                      onClick={() => setView("login")}
                      className="absolute left-0 top-2 p-2 text-text-muted hover:text-text-base transition-colors bg-bg-surface-hover rounded-full"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center justify-center relative bg-bg-surface-hover p-4 rounded-3xl shadow-sm border border-border-base mt-4">
                      <UserPlus className="w-8 h-8 text-primary-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-text-base tracking-tight">Criar Acesso Grátis</h2>
                      <p className="text-text-muted mt-1 text-sm font-medium">
                        Crie seu teste gratuito de 2 dias
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6 relative z-10 pt-2">
                    <form onSubmit={handleCreateFreeUser} className="space-y-5">
                      <div className="space-y-4">
                        <div className="relative group">
                          <label htmlFor="newUsername" className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider px-1">
                            Escolha seu Usuário
                          </label>
                          <input
                            id="newUsername"
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10))}
                            className="w-full px-4 py-4 rounded-2xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 focus:bg-bg-surface outline-none transition-all font-semibold text-text-base placeholder-text-muted shadow-sm"
                            placeholder="Ex: joao123"
                            disabled={loading}
                            maxLength={10}
                          />
                          <p className="text-[11px] text-text-muted mt-1.5 px-1 font-medium">
                            Apenas letras e números (máx 10 cara.).
                          </p>
                        </div>

                        <div className="relative group">
                          <label htmlFor="referrerUsername" className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider px-1">
                            Quem te indicou? <span className="text-primary-500 font-normal">(Opcional)</span>
                          </label>
                          <div className="relative">
                            <input
                              id="referrerUsername"
                              type="text"
                              value={referrerUsername}
                              onChange={(e) => setReferrerUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10))}
                              className={`w-full px-4 py-4 rounded-2xl border focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 outline-none transition-all font-semibold text-text-base placeholder-text-muted shadow-sm ${referrerUsername ? 'bg-green-50 border-green-300 text-green-800' : 'bg-bg-surface-hover border-border-base focus:bg-bg-surface'}`}
                              placeholder="Deixe em branco se não foi indicado"
                              disabled={loading}
                              maxLength={10}
                            />
                            {referrerUsername && (
                              <button
                                type="button"
                                onClick={() => setReferrerUsername("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 hover:text-red-500 transition-colors"
                                title="Limpar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {referrerUsername && (
                            <p className="text-[11px] text-green-700 font-semibold mt-1.5 px-1 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Indicado por: <strong>{referrerUsername}</strong>
                            </p>
                          )}
                        </div>
                      </div>

                      {error && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
                          <div className="flex items-start gap-3 p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <span className="text-sm font-medium">{error}</span>
                          </div>
                          {existingTestUsername && (
                            <div className="bg-primary-50 border border-primary-200 rounded-2xl p-4 flex flex-col gap-3">
                              <div className="flex items-center gap-2 text-primary-700">
                                <User className="w-4 h-4 flex-shrink-0" />
                                <p className="text-sm font-semibold">Conta encontrada: <span className="font-mono font-bold">{existingTestUsername}</span></p>
                              </div>
                              <p className="text-[11px] text-primary-600">Acesse sua conta para renovar ou continuar usando o serviço.</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setUsername(existingTestUsername);
                                  localStorage.setItem("vpn_saved_username", existingTestUsername);
                                  handleLogin(existingTestUsername);
                                }}
                                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                              >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                  <>
                                    <LogIn className="w-4 h-4" />
                                    Acessar minha conta
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}

                      <button
                        type="submit"
                        disabled={loading || !newUsername.trim()}
                        className="relative w-full overflow-hidden bg-primary-600 hover:bg-primary-700 text-white font-semibold py-4 px-4 rounded-2xl transition-all shadow-[0_8px_16px_-6px_rgba(79,70,229,0.5)] flex items-center justify-center disabled:opacity-60 disabled:shadow-none active:scale-[0.98] mt-2"
                      >
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          "Gerar Conta Teste"
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </motion.div>
            )}

            {view === "show_credentials" && credentials && (
              <motion.div
                key="show_credentials"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex-1 overflow-y-auto"
              >
                {/* Success header */}
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 px-6 pt-10 pb-8 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
                  <div className="relative z-10 flex flex-col items-center text-center gap-3">
                    <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-sm border border-white/30 shadow-lg">
                      <CheckCircle2 className="w-9 h-9 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black tracking-tight">Teste Criado!</h2>
                      <p className="text-green-100 mt-1 text-sm font-medium">Seu acesso de 2 dias está pronto. Anote suas credenciais abaixo.</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-5 max-w-md mx-auto pb-10">

                  {/* Credentials card */}
                  <div className="bg-bg-surface border border-border-base rounded-3xl shadow-sm overflow-hidden divide-y divide-border-base">
                    <div className="px-4 py-3 bg-bg-surface-hover">
                      <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Suas Credenciais de Acesso</p>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Usuário</p>
                        <p className="font-mono text-lg font-bold text-text-base">{credentials.username}</p>
                      </div>
                      <button onClick={() => copyToClipboard(credentials.username)} className="p-2.5 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors text-primary-600 border border-primary-100">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Senha</p>
                        <p className="font-mono text-lg font-bold text-text-base">{credentials.password}</p>
                      </div>
                      <button onClick={() => copyToClipboard(credentials.password)} className="p-2.5 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors text-primary-600 border border-primary-100">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700 font-semibold">Anote ou tire um print dessas informações. Você vai precisar delas para conectar no app.</p>
                    </div>
                  </div>

                  <AnimatePresence>
                    {copied && (
                      <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center text-sm text-green-600 font-semibold">
                        Copiado!
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* Download CTA */}
                  <div className="rounded-3xl overflow-hidden border border-border-base shadow-sm">
                    <div className="bg-primary-600 px-4 py-2.5">
                      <p className="text-[11px] font-bold text-primary-100 uppercase tracking-wider">Passo 1 — Baixe o app</p>
                    </div>
                    <a
                      href="https://play.google.com/store/apps/details?id=google.android.a48"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 bg-bg-surface hover:bg-bg-surface-hover p-4 transition-colors active:scale-[0.98]"
                    >
                      <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
                        <Download className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-text-base">Baixar CloudBR DT</p>
                        <p className="text-[11px] text-text-muted mt-0.5">Disponível na Google Play Store</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    </a>
                    <div className="bg-amber-50 border-t border-amber-100 px-4 py-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-amber-700">
                        <Smartphone className="w-3.5 h-3.5 shrink-0" />
                        <p className="text-[11px] font-bold">Somente Android — não funciona em iPhone</p>
                      </div>
                      <div className="flex items-center gap-2 text-amber-700">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <p className="text-[11px] font-bold">Requer chip TIM ou VIVO — outras operadoras não funcionam</p>
                      </div>
                    </div>
                  </div>

                  {/* Step-by-step guide */}
                  <div className="bg-bg-surface border border-border-base rounded-3xl overflow-hidden shadow-sm">
                    <div className="bg-primary-600 px-4 py-2.5">
                      <p className="text-[11px] font-bold text-primary-100 uppercase tracking-wider">Passo 2 — Como conectar</p>
                    </div>
                    <div className="p-4 space-y-4">
                      {[
                        { n: "1", icon: <Download className="w-4 h-4" />, title: "Instale o CloudBR DT", desc: "Baixe e instale o app pela Play Store. Abra-o com o Wi-Fi ligado na primeira vez para carregar as configurações." },
                        { n: "2", icon: <User className="w-4 h-4" />, title: "Faça login no app", desc: `Na tela inicial do app, toque no ícone de usuário e insira seu usuário (${credentials.username}) e sua senha.` },
                        { n: "3", icon: <RefreshCw className="w-4 h-4" />, title: "Escolha o servidor", desc: "Selecione qualquer servidor DT disponível na lista. Procure pelos servidores com sinal mais forte (mais barras)." },
                        { n: "4", icon: <CheckCircle2 className="w-4 h-4" />, title: "Conecte e aproveite!", desc: "Toque no botão de conectar. Aguarde até aparecer 'Conectado'. Pronto — sua internet ilimitada está funcionando!" },
                      ].map(step => (
                        <div key={step.n} className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-primary-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm text-sm font-black">
                            {step.n}
                          </div>
                          <div className="flex-1 pt-0.5">
                            <p className="text-sm font-bold text-text-base">{step.title}</p>
                            <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{step.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tips */}
                  <div className="bg-bg-surface border border-border-base rounded-3xl overflow-hidden shadow-sm">
                    <div className="bg-bg-surface-hover px-4 py-2.5 border-b border-border-base">
                      <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Informações importantes</p>
                    </div>
                    <div className="divide-y divide-border-base">
                      {[
                        { icon: <Clock className="w-4 h-4 text-primary-600" />, text: "Seu teste dura 2 dias. Após isso, acesse sua conta e renove para continuar." },
                        { icon: <Shield className="w-4 h-4 text-primary-600" />, text: "Sua internet funciona via VPN. Alguns apps de banco ou apostas podem pedir verificação — isso é normal." },
                        { icon: <Key className="w-4 h-4 text-primary-600" />, text: "Guarde bem seu usuário e senha. Você vai usá-los para acessar o app e renovar sua conta." },
                        { icon: <MessageSquare className="w-4 h-4 text-primary-600" />, text: "Teve algum problema? Acesse sua conta e abra um ticket de suporte. Respondemos rapidinho!" },
                        { icon: <CreditCard className="w-4 h-4 text-primary-600" />, text: "Gostou? Renove pelo nosso site antes do teste acabar e garanta seu acesso sem interrupção." },
                      ].map((tip, i) => (
                        <div key={i} className="flex items-start gap-3 p-3.5">
                          <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                            {tip.icon}
                          </div>
                          <p className="text-[11px] text-text-muted leading-relaxed pt-0.5">{tip.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-3 pt-2">
                    <button
                      onClick={() => {
                        setUsername(credentials.username);
                        handleLogin(credentials.username);
                      }}
                      className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 px-4 rounded-2xl transition-all shadow-lg shadow-primary-500/30 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <User className="w-5 h-5" />
                      Acessar Minha Conta
                    </button>
                    <a
                      href="https://play.google.com/store/apps/details?id=google.android.a48"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-bg-surface hover:bg-bg-surface-hover border border-border-base text-text-base font-semibold py-3.5 px-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
                    >
                      <Download className="w-4 h-4 text-primary-600" />
                      Baixar CloudBR DT na Play Store
                    </a>
                  </div>

                </div>
              </motion.div>
            )}

            {view === "pix_flow" && paymentData && (
              <motion.div
                key="pix_flow"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-md w-full bg-bg-surface rounded-2xl shadow-xl overflow-hidden"
              >
                <div className="p-4 border-b border-border-base flex items-center">
                  <button
                    onClick={() => setView("dashboard")}
                    className="text-text-muted hover:text-text-muted transition-colors mr-4"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-semibold text-text-base">Pagamento</h2>
                </div>

                <div className="p-6">
                  {paymentStatus === "approved" ? (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-center py-6"
                    >
                      <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-primary-600" />
                      </div>
                      <h2 className="text-2xl font-bold text-text-base mb-2">
                        Pagamento Aprovado!
                      </h2>
                      <p className="text-text-muted mb-6">
                        Sua assinatura foi renovada com sucesso!
                      </p>
                      <button
                        onClick={() => setView("dashboard")}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                      >
                        Voltar ao Painel
                      </button>
                    </motion.div>
                  ) : pixExpired ? (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-center py-6"
                    >
                      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <XCircle className="w-10 h-10 text-red-500" />
                      </div>
                      <h2 className="text-xl font-bold text-text-base mb-2">QR Code expirado</h2>
                      <p className="text-text-muted mb-6 text-sm">
                        O tempo limite de 15 minutos foi atingido. Gere um novo PIX para continuar.
                      </p>
                      <button
                        onClick={() => { setPaymentData(null); setPaymentStatus("pending"); setPixExpired(false); setView("dashboard"); }}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                      >
                        Voltar ao Painel
                      </button>
                    </motion.div>
                  ) : (
                    <div className="space-y-6">
                      {groupData && (
                        <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-primary-500 mb-0.5">Renovação do Plano</p>
                            <p className="text-sm font-semibold text-text-base">{groupData.plan.plan_months} {groupData.plan.plan_months === 1 ? 'mês' : 'meses'} · {groupData.plan.plan_devices} {groupData.plan.plan_devices === 1 ? 'aparelho' : 'aparelhos'}</p>
                            {paymentData?.discountApplied && (
                              <p className="text-[11px] text-green-600 font-bold mt-0.5">🎉 Desconto fidelidade -20% aplicado!</p>
                            )}
                          </div>
                          <div className="text-right">
                            {paymentData?.discountApplied && (
                              <p className="text-xs line-through text-text-muted">R$ {calcPlanPrice(groupData.plan.plan_months, groupData.plan.plan_devices)},00</p>
                            )}
                            <p className="text-2xl font-black text-primary-600">
                              R$ {paymentData?.amount != null ? Math.floor(paymentData.amount) : calcPlanPrice(groupData.plan.plan_months, groupData.plan.plan_devices)},00
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="text-center">
                        <h3 className="text-xl font-semibold text-text-base mb-2">
                          Pague com Pix
                        </h3>
                        <p className="text-sm text-text-muted">
                          Abra o app do seu banco e escaneie o QR Code ou copie o código abaixo.
                        </p>
                      </div>

                      <div className="flex justify-center">
                        <div className="p-4 bg-bg-surface border-2 border-border-base rounded-2xl shadow-sm">
                          <img
                            src={`data:image/jpeg;base64,${paymentData.qrCodeBase64}`}
                            alt="QR Code Pix"
                            className="w-48 h-48"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-text-base">
                          Pix Copia e Cola
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={paymentData.qrCode}
                            className="flex-1 px-3 py-2 bg-bg-surface-hover border border-border-base rounded-lg text-sm text-text-muted outline-none"
                          />
                          <button
                            onClick={() => copyToClipboard(paymentData.qrCode)}
                            className="px-4 py-2 bg-bg-surface-hover hover:bg-bg-surface text-text-base rounded-lg transition-colors flex items-center justify-center min-w-[100px]"
                          >
                            {copied ? (
                              <span className="text-primary-600 font-medium text-sm">
                                Copiado!
                              </span>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-2" />
                                <span className="text-sm font-medium">Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-3 text-sm text-text-muted pt-4 border-t border-border-base">
                        <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                        Aguardando confirmação do pagamento...
                      </div>

                      <button
                        onClick={() => { setPaymentData(null); setPaymentStatus("pending"); setPixExpired(false); setView("dashboard"); }}
                        className="w-full text-sm text-text-muted hover:text-red-500 py-2 transition-colors"
                      >
                        Cancelar e voltar ao painel
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── RESELLER INFO / CONTRATAR ── */}
            {view === "reseller_info" && (
              <motion.div
                key="reseller_info"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full flex-1 bg-bg-base overflow-y-auto"
              >
                {/* Header */}
                <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-5 shadow-md">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setView("login")} className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h1 className="text-xl font-bold text-white">Seja um Revendedor</h1>
                      <p className="text-emerald-100 text-sm">Ganhe dinheiro com VS+</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-6 max-w-lg mx-auto pb-12">
                  {/* Benefits */}
                  <div className="bg-bg-surface rounded-2xl p-5 shadow-sm border border-border-base space-y-3">
                    <h2 className="font-bold text-text-base text-base flex items-center gap-2"><Star className="w-5 h-5 text-emerald-500" />Vantagens da Revenda</h2>
                    {[
                      { icon: <DollarSign className="w-4 h-4 text-emerald-500" />, text: "Lucro real: você escolhe o preço de venda" },
                      { icon: <Users className="w-4 h-4 text-emerald-500" />, text: "Crie logins para seus clientes diretamente no painel" },
                      { icon: <Zap className="w-4 h-4 text-emerald-500" />, text: "Suporte técnico dedicado para revendedores" },
                      { icon: <BadgePercent className="w-4 h-4 text-emerald-500" />, text: "Desconto fidelidade de 20% a cada 3 renovações" },
                    ].map((b, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">{b.icon}</div>
                        <span className="text-sm text-text-muted">{b.text}</span>
                      </div>
                    ))}
                  </div>

                  {/* How it works */}
                  <div className="bg-bg-surface rounded-2xl p-5 shadow-sm border border-border-base">
                    <h2 className="font-bold text-text-base text-base flex items-center gap-2 mb-3"><Package className="w-5 h-5 text-emerald-500" />Como funciona</h2>
                    {[
                      "Escolha a quantidade de logins (mínimo 10) e o período.",
                      "Pague via PIX — conta ativada automaticamente.",
                      "Acesse o painel CloudBR DT e crie logins para seus clientes.",
                      "Renove mensalmente e acumule desconto fidelidade.",
                    ].map((step, i) => (
                      <div key={i} className="flex gap-3 mb-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                        <span className="text-sm text-text-muted">{step}</span>
                      </div>
                    ))}
                  </div>

                  {/* Profit estimator */}
                  <div className="bg-emerald-50 rounded-2xl p-5 shadow-sm border border-emerald-100">
                    <h2 className="font-bold text-emerald-800 text-base flex items-center gap-2 mb-4"><BarChart2 className="w-5 h-5" />Simulador de Lucro</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Logins que você vai vender</label>
                        <div className="flex items-center gap-3 mt-1">
                          <input type="range" min={10} max={200} step={5} value={profitLogins} onChange={e => setProfitLogins(Number(e.target.value))} className="flex-1 accent-emerald-600" />
                          <span className="w-12 text-right font-bold text-emerald-800">{profitLogins}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Valor de Venda por Login (R$)</label>
                        <div className="flex items-center gap-3 mt-1">
                          <input type="range" min={15} max={40} step={1} value={profitSellPrice} onChange={e => setProfitSellPrice(Number(e.target.value))} className="flex-1 accent-emerald-600" />
                          <span className="w-12 text-right font-bold text-emerald-800">R${profitSellPrice}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200">
                        <div className="text-center">
                          <p className="text-[10px] uppercase text-emerald-600 font-bold">Receita</p>
                          <p className="font-black text-emerald-800">R${(profitLogins * profitSellPrice).toLocaleString("pt-BR")}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase text-emerald-600 font-bold">Custo VS+</p>
                          <p className="font-black text-emerald-800">R${calcResellerPrice(1, profitLogins)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase text-emerald-600 font-bold">Lucro</p>
                          <p className={`font-black text-xl ${profitLogins * profitSellPrice - calcResellerPrice(1, profitLogins) > 0 ? "text-emerald-700" : "text-red-500"}`}>
                            R${(profitLogins * profitSellPrice - calcResellerPrice(1, profitLogins)).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11px] text-emerald-600 text-center">* Estimativa mensal. Custo VS+: R$30 + R$1/login/mês</p>
                    </div>
                  </div>

                  {/* Sign-up form */}
                  <div className="bg-bg-surface rounded-2xl p-5 shadow-sm border border-border-base space-y-4">
                    <h2 className="font-bold text-text-base text-base flex items-center gap-2"><Store className="w-5 h-5 text-emerald-500" />Contratar Agora</h2>

                    {/* Plan selector */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Logins (mín. 10)</label>
                        <div className="flex items-center gap-2 mt-1 border border-border-base rounded-xl overflow-hidden bg-bg-surface-hover">
                          <button onClick={() => setHireLogins(l => Math.max(10, l - 5))} className="px-3 py-2.5 text-text-muted hover:text-text-base font-bold transition-colors">−</button>
                          <span className="flex-1 text-center font-bold text-text-base">{hireLogins}</span>
                          <button onClick={() => setHireLogins(l => l + 5)} className="px-3 py-2.5 text-text-muted hover:text-text-base font-bold transition-colors">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Meses</label>
                        <div className="flex items-center gap-2 mt-1 border border-border-base rounded-xl overflow-hidden bg-bg-surface-hover">
                          <button onClick={() => setHireMonths(m => Math.max(1, m - 1))} className="px-3 py-2.5 text-text-muted hover:text-text-base font-bold transition-colors">−</button>
                          <span className="flex-1 text-center font-bold text-text-base">{hireMonths}</span>
                          <button onClick={() => setHireMonths(m => m + 1)} className="px-3 py-2.5 text-text-muted hover:text-text-base font-bold transition-colors">+</button>
                        </div>
                      </div>
                    </div>

                    {/* Price breakdown */}
                    <div className="bg-emerald-50 rounded-xl p-3 text-sm space-y-1">
                      <div className="flex justify-between text-emerald-800">
                        <span>R$30 × {hireMonths} {hireMonths === 1 ? "mês" : "meses"}</span>
                        <span className="font-semibold">R${30 * hireMonths}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800">
                        <span>{hireLogins} logins × R$1 × {hireMonths} {hireMonths === 1 ? "mês" : "meses"}</span>
                        <span className="font-semibold">R${hireLogins * hireMonths}</span>
                      </div>
                      <div className="flex justify-between font-black text-emerald-900 border-t border-emerald-200 pt-1 mt-1">
                        <span>Total</span>
                        <span>R${calcResellerPrice(hireMonths, hireLogins)}</span>
                      </div>
                    </div>

                    {/* User fields */}
                    <input
                      type="text"
                      value={hireUsername}
                      onChange={e => setHireUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                      placeholder="Usuário desejado (sem espaços)"
                      className="w-full px-4 py-3 rounded-xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none text-sm font-semibold text-text-base"
                    />
                    <input
                      type="password"
                      value={hirePassword}
                      onChange={e => setHirePassword(e.target.value)}
                      placeholder="Senha"
                      className="w-full px-4 py-3 rounded-xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none text-sm font-semibold text-text-base"
                    />

                    {resellerError && <p className="text-sm text-red-500 font-medium">{resellerError}</p>}

                    <button
                      disabled={resellerLoading || !hireUsername.trim() || !hirePassword.trim()}
                      onClick={async () => {
                        if (!hireUsername.trim() || !hirePassword.trim()) return;
                        setResellerLoading(true);
                        setResellerError("");
                        try {
                          const res = await fetch("/api/reseller/pix/hire", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ username: hireUsername, password: hirePassword, logins: hireLogins, months: hireMonths }),
                          });
                          const txt = await res.text();
                          let data: any = {}; try { data = JSON.parse(txt); } catch { /* */ }
                          if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX");
                          setResellerPixData({ ...data, mode: "hire" });
                          setResellerPixStatus("pending");
                          setResellerPixExpired(false);
                          setView("reseller_pix");
                        } catch (err: any) {
                          setResellerError(err.message);
                        } finally {
                          setResellerLoading(false);
                        }
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg"
                    >
                      {resellerLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                      Gerar PIX e Contratar
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── RESELLER DASHBOARD ── */}
            {view === "reseller_dashboard" && resellerData && (() => {
              // Logins and expiry come from Supabase payment history (VPN panel doesn't expose these)
              const rLogins: number = resellerData.logins ?? 0;
              const rPoints: number = resellerData.points ?? 0;
              const rExpiry: string | null = resellerData.expiresAt ?? null;
              const rLogin: string = resellerData.reseller?.login || "";
              // Load cached password from localStorage on first render
              if (!resellerVerifiedPass) {
                const cached = localStorage.getItem(`reseller_pass_${rLogin}`);
                if (cached) setTimeout(() => setResellerVerifiedPass(cached), 0);
              }
              const rPayments: any[] = (resellerData.payments ?? []).filter((p: any) => p.status === "approved" && p.type !== "reseller_setup");
              const now = new Date();
              const expiryDate = rExpiry ? new Date(rExpiry) : null;
              const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000) : null;
              const expired = daysLeft !== null && daysLeft <= 0;
              const expiringSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 7;
              const needsSetup = rLogins === 0 && !rExpiry;

              return (
              <motion.div
                key="reseller_dashboard"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="w-full flex-1 bg-bg-base overflow-y-auto"
              >
                {/* Header */}
                <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-5 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
                        <Store className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h1 className="text-lg font-bold text-white">Olá, {resellerData.reseller?.login}</h1>
                        <p className="text-emerald-100 text-xs">Área do Revendedor</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setResellerToken(null); setResellerData(null); setResellerUsername(""); setView("login"); }}
                      className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                  {/* Login + senha */}
                  <div className="mt-4 bg-white/10 rounded-xl px-4 py-3">
                    <p className="text-[10px] text-emerald-200 uppercase font-bold tracking-wide mb-2">Credenciais do Painel VPN</p>
                    <p className="text-white font-semibold text-sm mb-1">Login: <span className="font-black">{resellerData.reseller?.login}</span></p>
                    {resellerVerifiedPass ? (
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm">Senha: <span className="font-black">{showResellerPass ? resellerVerifiedPass : "••••••"}</span></p>
                        <button onClick={() => setShowResellerPass(v => !v)} className="text-emerald-200 hover:text-white transition-colors">
                          {showResellerPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm">Senha: <span className="font-black">{resellerData.reseller?.passwordHint ?? "••••••"}</span></p>
                        <button
                          onClick={() => { setPassVerifyInput(""); setPassVerifyError(""); setShowPassVerifyModal(true); }}
                          className="flex items-center gap-1.5 text-xs text-emerald-200 hover:text-white border border-white/20 rounded-lg px-2 py-1 transition-colors hover:bg-white/10"
                          title="Revelar senha completa"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-4 max-w-lg mx-auto pb-12">

                  {/* ─ First-access setup ─ */}
                  {needsSetup && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-amber-800 text-sm">Configure seu plano</p>
                          <p className="text-xs text-amber-700 mt-0.5">Você já tem uma conta de revenda. Informe os dados do seu plano atual para exibirmos corretamente.</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-amber-800 uppercase tracking-wide block mb-1">Quantidade de Logins Contratados</label>
                          <div className="flex items-center gap-2 border border-amber-300 rounded-xl overflow-hidden bg-white">
                            <button onClick={() => setResellerSetupLogins(n => Math.max(10, n - 10))} className="px-3 py-2 text-amber-700 hover:bg-amber-50 font-bold">−</button>
                            <input
                              type="number"
                              min={10}
                              value={resellerSetupLogins}
                              onChange={e => setResellerSetupLogins(Math.max(10, parseInt(e.target.value) || 10))}
                              className="flex-1 text-center font-bold text-text-base bg-transparent outline-none py-2"
                            />
                            <button onClick={() => setResellerSetupLogins(n => n + 10)} className="px-3 py-2 text-amber-700 hover:bg-amber-50 font-bold">+</button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-amber-800 uppercase tracking-wide block mb-1">Data de Vencimento</label>
                          <input
                            type="date"
                            value={resellerSetupExpiry}
                            onChange={e => setResellerSetupExpiry(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-amber-300 bg-white text-text-base font-semibold outline-none focus:ring-2 focus:ring-amber-400/40 text-sm"
                          />
                        </div>
                        <button
                          disabled={!resellerSetupExpiry || resellerLoading}
                          onClick={async () => {
                            if (!resellerToken || !resellerSetupExpiry) return;
                            setResellerLoading(true);
                            setResellerError("");
                            try {
                              const res = await fetch("/api/reseller/setup", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${resellerToken}` },
                                body: JSON.stringify({ logins: resellerSetupLogins, expiresAt: resellerSetupExpiry }),
                              });
                              const txt = await res.text();
                              let data: any = {}; try { data = JSON.parse(txt); } catch { /* */ }
                              if (!res.ok) throw new Error(data.error || "Erro ao salvar configuração");
                              await refreshResellerData(resellerToken);
                            } catch (err: any) {
                              setResellerError(err.message);
                            } finally {
                              setResellerLoading(false);
                            }
                          }}
                          className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          {resellerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Confirmar meu plano
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ─ Expiry alert ─ */}
                  {!needsSetup && expired && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-red-700 text-sm">Plano vencido</p>
                        <p className="text-xs text-red-600">Renove agora para continuar acessando os serviços.</p>
                      </div>
                    </div>
                  )}
                  {!needsSetup && expiringSoon && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-amber-700 text-sm">Vence em {daysLeft} dia{daysLeft !== 1 ? "s" : ""}</p>
                        <p className="text-xs text-amber-600">Renove em breve para não perder o acesso.</p>
                      </div>
                    </div>
                  )}

                  {/* ─ Stats cards ─ */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-bg-surface rounded-2xl p-4 shadow-sm border border-border-base text-center">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 mb-1">Logins</p>
                      <p className="text-3xl font-black text-text-base">{rLogins || "—"}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">contratados</p>
                    </div>
                    <div className={`bg-bg-surface rounded-2xl p-4 shadow-sm border ${expired ? "border-red-200 bg-red-50" : expiringSoon ? "border-amber-200 bg-amber-50" : "border-border-base"} text-center`}>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 mb-1">Vencimento</p>
                      <p className={`text-xs font-black leading-tight ${expired ? "text-red-600" : expiringSoon ? "text-amber-600" : "text-text-base"}`}>
                        {expiryDate ? expiryDate.toLocaleDateString("pt-BR") : "—"}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">{daysLeft !== null && daysLeft > 0 ? `${daysLeft}d` : daysLeft === 0 ? "hoje" : "—"}</p>
                    </div>
                    <div className="bg-bg-surface rounded-2xl p-4 shadow-sm border border-border-base text-center">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 mb-1">Fidelidade</p>
                      <div className="flex justify-center gap-1 my-1">
                        {[0,1,2].map(i => (
                          <div key={i} className={`w-4 h-4 rounded-full border-2 ${i < rPoints ? "bg-emerald-500 border-emerald-500" : "bg-transparent border-border-base"}`} />
                        ))}
                      </div>
                      <p className="text-[10px] text-text-muted">{rPoints}/3</p>
                    </div>
                  </div>

                  {/* ─ Loyalty info ─ */}
                  {rPoints >= 3 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                      <span className="text-2xl">🎉</span>
                      <div>
                        <p className="font-bold text-emerald-800 text-sm">Desconto de 20% disponível!</p>
                        <p className="text-xs text-emerald-700">Sua próxima renovação terá desconto automático de fidelidade.</p>
                      </div>
                    </div>
                  )}

                  {/* ─ Renew ─ */}
                  <div className="bg-bg-surface rounded-2xl p-5 shadow-sm border border-border-base space-y-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Renovar Acesso</p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-text-muted">Meses:</span>
                      <div className="flex items-center gap-2 border border-border-base rounded-xl overflow-hidden bg-bg-surface-hover">
                        <button onClick={() => setRenewMonths(m => Math.max(1, m - 1))} className="px-3 py-2 text-text-muted hover:text-text-base font-bold">−</button>
                        <span className="px-3 font-bold text-text-base">{renewMonths}</span>
                        <button onClick={() => setRenewMonths(m => m + 1)} className="px-3 py-2 text-text-muted hover:text-text-base font-bold">+</button>
                      </div>
                      <span className="ml-auto font-bold text-text-base">
                        {rPoints >= 3
                          ? <><span className="line-through text-text-muted text-xs mr-1">R${calcResellerPrice(renewMonths, Math.max(10, rLogins))}</span><span className="text-emerald-600">R${Math.round(calcResellerPrice(renewMonths, Math.max(10, rLogins)) * 0.8)}</span></>
                          : `R$${calcResellerPrice(renewMonths, Math.max(10, rLogins))}`
                        }
                      </span>
                    </div>
                    {rPoints >= 3 && <p className="text-xs text-emerald-600 font-medium">🎉 Desconto fidelidade -20% aplicado</p>}
                    <button
                      disabled={resellerLoading}
                      onClick={async () => {
                        if (!resellerToken) return;
                        setResellerLoading(true);
                        setResellerError("");
                        try {
                          const res = await fetch("/api/reseller/pix/renew", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${resellerToken}` },
                            body: JSON.stringify({ months: renewMonths }),
                          });
                          const txt = await res.text();
                          let data: any = {}; try { data = JSON.parse(txt); } catch { /* */ }
                          if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX");
                          setResellerPixData({ ...data, mode: "renew" });
                          setResellerPixStatus("pending");
                          setResellerPixExpired(false);
                          setView("reseller_pix");
                        } catch (err: any) {
                          setResellerError(err.message);
                        } finally {
                          setResellerLoading(false);
                        }
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {resellerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                      Gerar PIX de Renovação
                    </button>
                  </div>

                  {/* ─ Solicitar Alteração de Logins ─ */}
                  {!needsSetup && (() => {
                    const currentL = Math.max(10, rLogins);
                    const reqL = resellerLoginsReq ?? currentL;
                    const diff = reqL - currentL;
                    const isDecrease = diff < 0;
                    const isIncrease = diff > 0;
                    const proRatedCost = isIncrease && daysLeft !== null && daysLeft > 0
                      ? Math.max(1, Math.round(diff * daysLeft / 30))
                      : null;
                    return (
                      <div className="bg-bg-surface rounded-2xl p-5 shadow-sm border border-border-base space-y-3">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Alterar Quantidade de Logins</p>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-text-muted">Logins:</span>
                          <div className="flex items-center gap-2 border border-border-base rounded-xl overflow-hidden bg-bg-surface-hover">
                            <button onClick={() => setResellerLoginsReq(n => Math.max(10, (n ?? currentL) - 10))} className="px-3 py-2 text-text-muted hover:text-text-base font-bold">−</button>
                            <span className="px-3 font-bold text-text-base">{reqL}</span>
                            <button onClick={() => setResellerLoginsReq(n => (n ?? currentL) + 10)} className="px-3 py-2 text-text-muted hover:text-text-base font-bold">+</button>
                          </div>
                          {diff !== 0 && (
                            <span className={`text-xs font-bold ${isIncrease ? "text-emerald-600" : "text-amber-600"}`}>
                              {isIncrease ? `+${diff}` : `${diff}`} logins
                            </span>
                          )}
                        </div>
                        {isIncrease && proRatedCost !== null && (
                          <p className="text-xs text-text-muted">
                            Pro-rata ({daysLeft}d restantes): <span className="font-bold text-emerald-700">R${proRatedCost}</span>
                          </p>
                        )}
                        {isDecrease && (
                          <p className="text-xs text-text-muted">A redução precisa de aprovação do administrador (gratuita).</p>
                        )}
                        <div className="flex gap-2">
                          {diff !== 0 && (
                            <button onClick={() => setResellerLoginsReq(null)} className="px-4 py-2.5 rounded-xl border border-border-base text-text-muted text-sm font-semibold hover:bg-bg-surface-hover transition-colors">
                              Cancelar
                            </button>
                          )}
                          <button
                            disabled={diff === 0 || resellerLoginsBusy}
                            onClick={async () => {
                              if (diff === 0 || !resellerToken) return;
                              setResellerLoginsBusy(true);
                              setResellerError("");
                              try {
                                if (isDecrease) {
                                  const res = await fetch("/api/reseller/request/logins-decrease", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resellerToken}` },
                                    body: JSON.stringify({ newLogins: reqL }),
                                  });
                                  const txt = await res.text();
                                  let data: any = {}; try { data = JSON.parse(txt); } catch { /* */ }
                                  if (!res.ok) throw new Error(data.error || "Erro ao enviar solicitação");
                                  setResellerLoginsReq(null);
                                  setResellerRequestsLoaded(false);
                                  showAlertDialog("Solicitação de redução enviada! Aguarde aprovação do administrador.", "Solicitação Enviada");
                                } else {
                                  const res = await fetch("/api/reseller/pix/logins-upgrade", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resellerToken}` },
                                    body: JSON.stringify({ newLogins: reqL }),
                                  });
                                  const txt = await res.text();
                                  let data: any = {}; try { data = JSON.parse(txt); } catch { /* */ }
                                  if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX");
                                  setResellerPixData({ ...data, mode: "logins_upgrade" });
                                  setResellerPixStatus("pending");
                                  setResellerPixExpired(false);
                                  setView("reseller_pix");
                                }
                              } catch (err: any) {
                                setResellerError(err.message);
                              } finally {
                                setResellerLoginsBusy(false);
                              }
                            }}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                              isDecrease
                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                          >
                            {resellerLoginsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                            {isDecrease ? "Solicitar Redução" : proRatedCost !== null ? `Pagar R$${proRatedCost} e Solicitar` : "Solicitar Adição"}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ─ Minhas Solicitações ─ */}
                  {!needsSetup && (
                    <div className="bg-bg-surface rounded-2xl p-5 shadow-sm border border-border-base space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Minhas Solicitações</p>
                        <button
                          onClick={async () => {
                            if (!resellerToken) return;
                            try {
                              const res = await fetch("/api/reseller/requests", { headers: { Authorization: `Bearer ${resellerToken}` } });
                              if (res.ok) setResellerRequests(await res.json());
                            } catch { /* */ } finally { setResellerRequestsLoaded(true); }
                          }}
                          className="text-xs text-emerald-600 font-semibold hover:text-emerald-700"
                        >
                          {resellerRequestsLoaded ? "Atualizar" : "Carregar"}
                        </button>
                      </div>
                      {!resellerRequestsLoaded ? (
                        <p className="text-xs text-text-muted text-center py-2">Clique em "Carregar" para ver suas solicitações.</p>
                      ) : resellerRequests.length === 0 ? (
                        <p className="text-sm text-text-muted text-center py-2">Nenhuma solicitação.</p>
                      ) : (
                        <div className="space-y-2">
                          {resellerRequests.map((r: any) => {
                            const typeMap: Record<string, string> = {
                              reseller_password: "Alteração de Senha",
                              reseller_logins_decrease: "Redução de Logins",
                              reseller_logins_increase: "Adição de Logins",
                            };
                            const statusMap: Record<string, { label: string; cls: string }> = {
                              aguardando: { label: "Aguardando", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                              aguardando_confirmacao: { label: "Pago · Aguard. Confirmação", cls: "bg-blue-50 text-blue-700 border-blue-200" },
                              aprovado: { label: "Aprovado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                              confirmado: { label: "Confirmado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                              rejeitado: { label: "Recusado", cls: "bg-red-50 text-red-700 border-red-200" },
                            };
                            const s = statusMap[r.status] ?? { label: r.status, cls: "bg-bg-surface-hover text-text-muted border-border-base" };
                            return (
                              <div key={r.id} className="rounded-xl border border-border-base bg-bg-surface-hover p-3 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-text-base">{typeMap[r.type] ?? r.type}</p>
                                  {r.requested_value && (
                                    <p className="text-xs text-text-muted mt-0.5">Solicitado: {r.requested_value} logins</p>
                                  )}
                                  {r.status === "rejeitado" && r.approved_value && (
                                    <p className="text-xs text-red-600 mt-0.5 font-medium">Motivo: {r.approved_value}</p>
                                  )}
                                  <p className="text-[10px] text-text-muted mt-0.5">{new Date(r.created_at).toLocaleDateString("pt-BR")}</p>
                                </div>
                                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg border shrink-0 ${s.cls}`}>{s.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─ Support tickets ─ */}
                  <div className="bg-bg-surface rounded-2xl p-5 shadow-sm border border-border-base space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Suporte</p>
                      <button
                        onClick={async () => {
                          if (!resellerTicketsLoaded) {
                            const res = await fetch(`/api/tickets/${resellerData.reseller?.login}`);
                            if (res.ok) setResellerTickets(await res.json());
                            setResellerTicketsLoaded(true);
                          }
                          setShowResellerTicketForm(f => !f);
                        }}
                        className="text-xs text-emerald-600 font-semibold hover:text-emerald-700"
                      >
                        {showResellerTicketForm ? "Fechar" : "+ Novo chamado"}
                      </button>
                    </div>

                    {showResellerTicketForm && (
                      <div className="space-y-2">
                        <input
                          value={resellerTicketSubject}
                          onChange={e => setResellerTicketSubject(e.target.value)}
                          placeholder="Assunto"
                          className="w-full px-3 py-2.5 rounded-xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-emerald-500/30 outline-none text-sm text-text-base"
                        />
                        <textarea
                          value={resellerTicketMsg}
                          onChange={e => setResellerTicketMsg(e.target.value)}
                          placeholder="Descreva sua solicitação..."
                          rows={3}
                          className="w-full px-3 py-2.5 rounded-xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-emerald-500/30 outline-none text-sm text-text-base resize-none"
                        />
                        <button
                          disabled={!resellerTicketSubject.trim() || !resellerTicketMsg.trim() || resellerLoading}
                          onClick={async () => {
                            setResellerLoading(true);
                            try {
                              const res = await fetch("/api/tickets", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ username: resellerData.reseller?.login, category: "suporte", subject: resellerTicketSubject, message: resellerTicketMsg }),
                              });
                              if (!res.ok) throw new Error((await res.json()).error);
                              const updated = await fetch(`/api/tickets/${resellerData.reseller?.login}`);
                              if (updated.ok) setResellerTickets(await updated.json());
                              setResellerTicketSubject(""); setResellerTicketMsg(""); setShowResellerTicketForm(false);
                              showAlertDialog("Chamado aberto com sucesso! Responderemos em breve.", "Chamado Aberto");
                            } catch (err: any) {
                              setResellerError(err.message);
                            } finally {
                              setResellerLoading(false);
                            }
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          {resellerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                          Enviar Chamado
                        </button>
                      </div>
                    )}

                    {/* Ticket list */}
                    {resellerTickets.length > 0 ? (
                      <div className="space-y-2">
                        {resellerTickets.slice(0, 5).map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-bg-surface-hover border border-border-base">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-base truncate">{t.subject}</p>
                              <p className="text-[10px] text-text-muted">{new Date(t.created_at).toLocaleDateString("pt-BR")}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ml-2 ${t.status === "open" ? "bg-blue-100 text-blue-700" : t.status === "closed" ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-700"}`}>
                              {t.status === "open" ? "Aberto" : t.status === "closed" ? "Fechado" : "Resp."}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : resellerTicketsLoaded ? (
                      <p className="text-sm text-text-muted text-center py-2">Nenhum chamado aberto.</p>
                    ) : (
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/tickets/${resellerData.reseller?.login}`);
                          if (res.ok) setResellerTickets(await res.json());
                          setResellerTicketsLoaded(true);
                        }}
                        className="w-full text-sm text-emerald-600 hover:text-emerald-700 py-2 font-medium"
                      >
                        Ver meus chamados
                      </button>
                    )}
                  </div>

                  {/* ─ Change password ─ */}
                  <button
                    onClick={() => { setResellerNewPass(""); setShowResellerPassModal(true); }}
                    className="w-full flex items-center justify-between p-4 bg-bg-surface rounded-2xl shadow-sm border border-border-base hover:bg-bg-surface-hover transition-colors"
                  >
                    <span className="flex items-center gap-2 font-semibold text-text-base"><Key className="w-4 h-4 text-primary-500" />Alterar Senha</span>
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  </button>

                  {/* ─ Payment history ─ */}
                  {rPayments.length > 0 && (
                    <div className="bg-bg-surface rounded-2xl p-5 shadow-sm border border-border-base">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted mb-3">Histórico de Pagamentos</p>
                      <div className="space-y-1">
                        {rPayments.slice(0, 5).map((p: any) => {
                          const meta = p.metadata ? (typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata) : {};
                          return (
                            <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-border-base last:border-0">
                              <div>
                                <p className="text-sm font-semibold text-text-base">
                                  {p.type === "reseller_hire" ? "Contratação" : `Renovação ${meta.resellerMonths ? `(${meta.resellerMonths}m)` : ""}`}
                                </p>
                                <p className="text-xs text-text-muted">{new Date(p.paid_at || p.created_at).toLocaleDateString("pt-BR")}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-emerald-600">R${meta.amount ?? "—"}</p>
                                {meta.discountApplied && <p className="text-[10px] text-emerald-500">🎉 -20%</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {resellerError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 font-medium">{resellerError}</div>
                  )}
                </div>

                {/* Verify password modal */}
                <AnimatePresence>
                  {showPassVerifyModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
                      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <h3 className="font-bold text-text-base text-lg flex items-center gap-2"><Lock className="w-5 h-5 text-emerald-500" />Verificar Identidade</h3>
                        <p className="text-sm text-text-muted">Digite sua senha do painel VPN para revelar as credenciais. Após verificar, ficará salvo neste dispositivo.</p>
                        <input
                          type="password"
                          value={passVerifyInput}
                          onChange={e => { setPassVerifyInput(e.target.value); setPassVerifyError(""); }}
                          placeholder="Senha do painel VPN"
                          autoFocus
                          className="w-full px-4 py-3 rounded-xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-emerald-500/40 outline-none text-sm font-semibold text-text-base"
                        />
                        {passVerifyError && <p className="text-xs text-red-500 font-medium">{passVerifyError}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => { setShowPassVerifyModal(false); setPassVerifyInput(""); setPassVerifyError(""); }} className="flex-1 py-3 rounded-xl border border-border-base text-text-muted font-semibold hover:bg-bg-surface-hover transition-colors">Cancelar</button>
                          <button
                            disabled={!passVerifyInput.trim() || resellerLoading}
                            onClick={async () => {
                              if (!resellerToken || !passVerifyInput.trim()) return;
                              setResellerLoading(true);
                              try {
                                const res = await fetch("/api/reseller/verify-password", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${resellerToken}` },
                                  body: JSON.stringify({ password: passVerifyInput }),
                                });
                                const txt = await res.text();
                                let data: any = {}; try { data = JSON.parse(txt); } catch { /* */ }
                                if (!res.ok) { setPassVerifyError(data.error || "Senha incorreta"); return; }
                                localStorage.setItem(`reseller_pass_${rLogin}`, data.password);
                                setResellerVerifiedPass(data.password);
                                setShowPassVerifyModal(false);
                                setPassVerifyInput("");
                                setShowResellerPass(true);
                              } catch (err: any) {
                                setPassVerifyError(err.message);
                              } finally {
                                setResellerLoading(false);
                              }
                            }}
                            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold transition-colors"
                          >
                            {resellerLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Verificar"}
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Change password modal */}
                <AnimatePresence>
                  {showResellerPassModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
                      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <h3 className="font-bold text-text-base text-lg">Alterar Senha</h3>
                        <p className="text-sm text-text-muted">Sua solicitação será enviada ao administrador para aprovação.</p>
                        <input
                          type="password"
                          value={resellerNewPass}
                          onChange={e => setResellerNewPass(e.target.value)}
                          placeholder="Nova senha"
                          className="w-full px-4 py-3 rounded-xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 outline-none text-sm font-semibold text-text-base"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setShowResellerPassModal(false)} className="flex-1 py-3 rounded-xl border border-border-base text-text-muted font-semibold hover:bg-bg-surface-hover transition-colors">Cancelar</button>
                          <button
                            disabled={!resellerNewPass.trim() || resellerLoading}
                            onClick={async () => {
                              if (!resellerToken || !resellerNewPass.trim()) return;
                              setResellerLoading(true);
                              try {
                                const res = await fetch("/api/reseller/change-password", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${resellerToken}` },
                                  body: JSON.stringify({ newPassword: resellerNewPass }),
                                });
                                if (!res.ok) throw new Error((await res.json()).error);
                                setShowResellerPassModal(false);
                                showAlertDialog("Solicitação enviada! O administrador processará em breve.", "Senha Solicitada");
                              } catch (err: any) {
                                setResellerError(err.message);
                                setShowResellerPassModal(false);
                              } finally {
                                setResellerLoading(false);
                              }
                            }}
                            className="flex-1 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold transition-colors"
                          >
                            {resellerLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Enviar"}
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
              );
            })()}

            {/* ── RESELLER PIX ── */}
            {view === "reseller_pix" && resellerPixData && (
              <motion.div
                key="reseller_pix"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-md w-full bg-bg-surface rounded-2xl shadow-xl overflow-hidden"
              >
                <div className="p-4 border-b border-border-base flex items-center">
                  <button
                    onClick={() => setView(resellerPixData.mode === "hire" ? "reseller_info" : "reseller_dashboard")}
                    className="text-text-muted hover:text-text-base transition-colors mr-4"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-semibold text-text-base">
                    {resellerPixData.mode === "hire" ? "Contratar Revenda" : resellerPixData.mode === "logins_upgrade" ? "Adicionar Logins" : "Renovar Revenda"}
                  </h2>
                </div>

                <div className="p-6">
                  {resellerPixStatus === "approved" ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">
                      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                      </div>
                      <h2 className="text-2xl font-bold text-text-base mb-2">Pagamento Aprovado!</h2>
                      <p className="text-text-muted mb-6">
                        {resellerPixData.mode === "hire" ? "Conta criada com sucesso! Acesse a área do revendedor." : resellerPixData.mode === "logins_upgrade" ? "Solicitação enviada! O administrador irá confirmar a adição de logins." : "Sua revenda foi renovada com sucesso!"}
                      </p>
                      <button
                        onClick={() => {
                          if (resellerPixData.mode === "hire") {
                            setView("login");
                          } else {
                            resellerToken && refreshResellerData(resellerToken);
                            setView("reseller_dashboard");
                          }
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                      >
                        {resellerPixData.mode === "hire" ? "Ir para Login" : "Voltar ao Painel"}
                      </button>
                    </motion.div>
                  ) : resellerPixExpired ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">
                      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <XCircle className="w-10 h-10 text-red-500" />
                      </div>
                      <h2 className="text-xl font-bold text-text-base mb-2">QR Code expirado</h2>
                      <p className="text-text-muted mb-6 text-sm">O tempo limite de 15 minutos foi atingido. Gere um novo PIX para continuar.</p>
                      <button
                        onClick={() => { setResellerPixData(null); setResellerPixStatus("pending"); setResellerPixExpired(false); setView(resellerPixData.mode === "hire" ? "reseller_info" : "reseller_dashboard"); }}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                      >
                        Voltar
                      </button>
                    </motion.div>
                  ) : (
                    <div className="space-y-6">
                      {/* Info card */}
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 mb-0.5">
                            {resellerPixData.mode === "hire" ? "Nova Revenda" : resellerPixData.mode === "logins_upgrade" ? "Adição de Logins" : "Renovação"} VS+
                          </p>
                          <p className="text-sm font-semibold text-text-base">
                            {resellerPixData.mode === "logins_upgrade"
                              ? `+${resellerPixData.loginDiff} logins · ${resellerPixData.daysLeft}d restantes`
                              : `${resellerPixData.logins} logins · ${resellerPixData.months} ${(resellerPixData.months ?? 1) === 1 ? "mês" : "meses"}`}
                          </p>
                          {resellerPixData.discountApplied && (
                            <p className="text-[11px] text-emerald-600 font-bold mt-0.5">🎉 Desconto fidelidade -20%!</p>
                          )}
                        </div>
                        <p className="text-2xl font-black text-emerald-700">R${resellerPixData.amount}</p>
                      </div>

                      <div className="text-center">
                        <h3 className="text-xl font-semibold text-text-base mb-1">Pague com Pix</h3>
                        <p className="text-sm text-text-muted">Escaneie o QR Code ou copie o código abaixo.</p>
                      </div>

                      <div className="flex justify-center">
                        <div className="p-4 bg-bg-surface border-2 border-border-base rounded-2xl shadow-sm">
                          <img src={`data:image/jpeg;base64,${resellerPixData.qrCodeBase64}`} alt="QR Code Pix" className="w-48 h-48" />
                        </div>
                      </div>

                      <div className="flex gap-2 border border-border-base rounded-2xl overflow-hidden">
                        <input readOnly value={resellerPixData.qrCode} className="flex-1 bg-bg-surface-hover px-3 py-2 text-xs text-text-muted font-mono truncate outline-none" />
                        <button onClick={() => copyToClipboard(resellerPixData.qrCode)} className="px-4 py-2 bg-bg-surface-hover hover:bg-bg-surface text-text-base rounded-lg transition-colors flex items-center min-w-[80px]">
                          {copied ? <span className="text-primary-600 font-medium text-sm">Copiado!</span> : <><Copy className="w-4 h-4 mr-2" /><span className="text-sm font-medium">Copiar</span></>}
                        </button>
                      </div>

                      <div className="flex items-center justify-center gap-3 text-sm text-text-muted pt-4 border-t border-border-base">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        Aguardando confirmação do pagamento...
                      </div>

                      <button
                        onClick={() => { setResellerPixData(null); setResellerPixStatus("pending"); setResellerPixExpired(false); setView(resellerPixData.mode === "hire" ? "reseller_info" : "reseller_dashboard"); }}
                        className="w-full text-sm text-text-muted hover:text-red-500 py-2 transition-colors"
                      >
                        Cancelar e voltar
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === "admin" && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <AdminShell onBack={() => setView("login")} />
              </motion.div>
            )}

            {/* User Tickets List */}
            {view === "tickets" && (
              <motion.div
                key="tickets"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full flex-1 bg-bg-surface overflow-hidden flex flex-col"
              >
                <div className="bg-primary-600 p-4 flex justify-between items-center flex-shrink-0">
                  <div className="flex items-center">
                    <button onClick={() => setView("dashboard")} className="text-primary-100 hover:text-white mr-3">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-semibold text-white">Meus Tickets</h1>
                  </div>
                </div>

                <div className="p-4 flex-1 overflow-y-auto bg-bg-surface-hover pb-24 md:pb-4">
                  {tickets.length === 0 ? (
                    <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                      <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                        <MessageSquare className="w-10 h-10 text-primary-500" />
                      </div>
                      <h3 className="text-lg font-bold text-text-base mb-1">Precisa de ajuda?</h3>
                      <p className="text-text-muted px-4 text-center">Você não possui tickets abertos no momento. Se precisar, basta abrir um novo abaixo.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 pb-20"> {/* pb-20 prevents FAB from blocking last item */}
                      {tickets.map(t => (
                        <div
                          key={t.id}
                          onClick={() => { setCurrentTicket(t); fetchMessages(t.id); setView("ticket_detail"); }}
                          className="bg-bg-surface border border-border-base p-5 rounded-2xl cursor-pointer hover:border-primary-500 transition-all shadow-sm active:scale-[0.98] relative overflow-hidden group"
                        >
                          <div className="flex justify-between items-start mb-3 relative z-10">
                            <div className="flex items-center overflow-hidden pr-3 flex-1">
                              {t.status === 'answered' && (
                                <span className="flex h-3 w-3 relative mr-3 flex-shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary-500"></span>
                                </span>
                              )}
                              <h3 className="font-semibold text-text-base truncate">{t.subject}</h3>
                            </div>
                            <span className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 font-medium ${t.status === 'open' ? 'bg-amber-100 text-amber-800' :
                              t.status === 'answered' ? 'bg-primary-100 text-primary-800' :
                                'bg-bg-surface-hover text-text-muted border border-border-base'
                              }`}>
                              {t.status === 'open' ? 'Aberto' : t.status === 'answered' ? 'Respondido' : 'Fechado'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs text-text-muted relative z-10">
                            <span className="bg-bg-surface-hover px-2 py-1 rounded-md">{t.category}</span>
                            <span>{formatDate(t.created_at)}</span>
                          </div>
                          <div className="absolute inset-0 bg-primary-50 opacity-0 group-hover:opacity-100 transition-opacity z-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Floating Action Button */}
                <button
                  onClick={() => setShowNewTicketModal(true)}
                  className="absolute bottom-20 right-6 md:bottom-6 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all z-20"
                >
                  <Plus className="w-7 h-7" />
                </button>

                {/* New Ticket Modal */}
                <AnimatePresence>
                  {showNewTicketModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/50 backdrop-blur-sm z-30 flex items-center justify-center p-4"
                      onClick={() => setShowNewTicketModal(false)}
                    >
                      <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        onClick={e => e.stopPropagation()}
                        className="bg-bg-surface w-full max-w-sm rounded-[2rem] shadow-2xl border border-border-base overflow-hidden flex flex-col max-h-full"
                      >
                        <div className="p-6 border-b border-border-base flex justify-between items-center bg-bg-surface shrink-0">
                          <h2 className="text-xl font-bold text-text-base tracking-tight">Novo Ticket</h2>
                          <button onClick={() => setShowNewTicketModal(false)} className="p-2 bg-bg-surface-hover hover:bg-border-base text-text-muted rounded-full transition-colors active:scale-95">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto">
                          <form id="new-ticket-form" onSubmit={handleCreateTicket} className="space-y-4">
                            <div>
                               <label className="block text-xs font-semibold text-text-muted tracking-wider uppercase mb-2 ml-1">Categoria do Problema</label>
                              <select
                                value={ticketForm.category}
                                onChange={e => setTicketForm({ ...ticketForm, category: e.target.value })}
                                className="w-full pl-4 pr-10 py-3.5 rounded-2xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 focus:bg-bg-surface outline-none transition-all font-medium text-text-base appearance-none cursor-pointer"
                              >
                                <option>Suporte Técnico</option>
                                <option>Financeiro</option>
                                <option>Solicitar UUID</option>
                                <option>Outros</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-text-muted tracking-wider uppercase mb-2 ml-1">Assunto Curto</label>
                              <input
                                type="text"
                                placeholder="Ex: VPN não conecta, Erro no Pix..."
                                value={ticketForm.subject}
                                onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })}
                                className="w-full px-4 py-3.5 rounded-2xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 focus:bg-bg-surface outline-none transition-all font-medium text-text-base placeholder-text-muted"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-text-muted tracking-wider uppercase mb-2 ml-1">Sua Mensagem</label>
                              <textarea
                                placeholder="Detalhe sua dúvida ou problema para que possamos ajudar rapidamente..."
                                value={ticketForm.message}
                                onChange={e => setTicketForm({ ...ticketForm, message: e.target.value })}
                                className="w-full px-4 py-3.5 rounded-2xl bg-bg-surface-hover border border-border-base focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 focus:bg-bg-surface outline-none transition-all font-medium text-text-base placeholder-text-muted resize-none h-32"
                                required
                              />
                            </div>
                          </form>
                        </div>

                        <div className="p-6 border-t border-border-base bg-bg-surface-hover shrink-0">
                          <button
                            form="new-ticket-form"
                            type="submit"
                            disabled={loading || !ticketForm.subject || !ticketForm.message}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3.5 px-4 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-60 disabled:scale-100 flex items-center justify-center"
                          >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><MessageSquare className="w-5 h-5 mr-2" /> Enviar Ticket</>}
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Ticket Detail (User & Admin) */}
            {(view === "ticket_detail" || view === "admin_ticket_detail") && currentTicket && (
              <motion.div
                key="ticket_detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full flex-1 bg-bg-surface overflow-hidden flex flex-col"
              >
                <div className={`${view === "admin_ticket_detail" ? "bg-bg-surface-hover text-text-base" : "bg-primary-600 text-white"} p-4 flex justify-between items-center flex-shrink-0`}>
                  <div className="flex items-center overflow-hidden">
                    <button
                      onClick={() => {
                        if (view === "admin_ticket_detail") {
                          setView("admin");
                          setAdminTab("tickets");
                        } else {
                          setView("tickets");
                        }
                      }}
                      className={`${view === "admin_ticket_detail" ? "text-text-muted hover:text-text-base bg-bg-base" : "text-white/80 hover:text-white bg-black/10"} mr-3 flex-shrink-0 flex items-center text-sm font-medium px-2 py-1.5 rounded-lg transition-colors`}
                    >
                      <Minimize2 className="w-4 h-4 mr-1" />
                      Voltar
                    </button>
                    <div className="truncate">
                      <h1 className={`text-sm font-semibold truncate ${view === "admin_ticket_detail" ? "text-text-base" : "text-white"}`}>{currentTicket.subject}</h1>
                      <div className="flex items-center mt-0.5">
                        <p className={`text-xs ${view === "admin_ticket_detail" ? "text-text-muted" : "text-white/70"}`}>
                          {currentTicket.category}
                        </p>
                        {view === "admin_ticket_detail" && (
                          <>
                            <span className="text-text-muted text-xs mx-1.5">•</span>
                            <button 
                              onClick={() => setShowAdminUserModal(true)}
                              className="text-xs font-semibold text-primary-600 hover:text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full transition-colors flex items-center pr-1.5 active:scale-95"
                            >
                              {currentTicket.username}
                              <ChevronRight className="w-3 h-3 ml-0.5 opacity-70" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {currentTicket.status !== "closed" && (
                    <button
                      onClick={() => {
                        confirmAction("Encerrar Ticket", "Tem certeza que deseja encerrar este ticket?", () => {
                          handleCloseTicket();
                        });
                      }}
                      className="text-xs bg-red-500 hover:bg-red-600 text-white px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0 ml-2 flex items-center font-medium shadow-sm"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                      Encerrar
                    </button>
                  )}
                </div>

                <div className="flex flex-col flex-1 overflow-hidden relative">
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 bg-bg-base space-y-4">
                      {messages.map((m, i) => {
                        const isMe = (view === "admin_ticket_detail" && m.sender === "admin") || (view === "ticket_detail" && m.sender === "user");
                        const isConsecutive = i > 0 && messages[i - 1].sender === m.sender;
                        
                        return (
                          <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"} ${isConsecutive ? "mt-1" : "mt-4"}`}>
                            <div className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 shadow-sm ${isMe
                              ? (view === "admin_ticket_detail" 
                                  ? `bg-bg-surface border border-border-base text-text-base rounded-2xl ${!isConsecutive ? "rounded-tr-sm" : ""}` 
                                  : `bg-primary-600 text-white rounded-2xl ${!isConsecutive ? "rounded-tr-sm" : ""}`)
                              : `bg-bg-surface border border-border-base text-text-base rounded-2xl ${!isConsecutive ? "rounded-tl-sm" : ""}`
                              }`}>
                              
                              {!isMe && !isConsecutive && (
                                <p className="text-[10px] font-bold uppercase tracking-wider mb-1 text-primary-500">
                                  {view === "admin_ticket_detail" ? "Cliente" : "Suporte"}
                                </p>
                              )}
                              
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.message}</p>
                              <p className={`text-[10px] mt-2 text-right ${isMe ? (view === "admin_ticket_detail" ? "text-text-muted" : "text-white/70") : "text-text-muted"}`}>
                                {formatTime(m.created_at)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {currentTicket.status !== "closed" ? (
                      <div className="p-4 bg-bg-surface border-t border-border-base flex-shrink-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                        <form
                          onSubmit={(e) => handleSendMessage(e, view === "admin_ticket_detail" ? "admin" : "user")}
                          className="flex gap-3 items-end"
                        >
                          <div className="flex-1 relative">
                            <textarea
                              value={newMessage}
                              onChange={e => setNewMessage(e.target.value)}
                              placeholder="Digite sua mensagem..."
                              className="w-full pl-4 pr-12 py-3 rounded-2xl border border-border-base bg-bg-surface-hover text-sm outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 resize-none max-h-32 min-h-[44px]"
                              rows={1}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  if (newMessage.trim()) handleSendMessage(e, view === "admin_ticket_detail" ? "admin" : "user");
                                }
                              }}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={!newMessage.trim()}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:scale-100 shadow-md transform active:scale-95 flex-shrink-0 ${view === "admin_ticket_detail" ? "bg-bg-surface-hover hover:bg-bg-base border border-border-base text-text-base" : "bg-primary-600 hover:bg-primary-700 text-white"
                              }`}
                          >
                            <Send className="w-5 h-5 ml-1" />
                          </button>
                        </form>
                        <p className="text-[10px] text-text-muted text-center mt-2 hidden sm:block">Pressione Enter para enviar, Shift+Enter para quebrar linha</p>
                      </div>
                    ) : (
                      <div className="p-4 bg-bg-surface-hover border-t border-border-base flex justify-center items-center text-sm text-text-muted flex-shrink-0">
                        <XCircle className="w-4 h-4 mr-2" /> Este ticket foi encerrado
                      </div>
                    )}
                  </div>

                  {/* Admin User Details Modal */}
                  <AnimatePresence>
                    {view === "admin_ticket_detail" && showAdminUserModal && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex items-center justify-center p-4"
                        onClick={() => setShowAdminUserModal(false)}
                      >
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.95, opacity: 0 }}
                          className="w-full max-w-md bg-bg-surface rounded-2xl shadow-2xl flex flex-col max-h-full overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="p-4 border-b border-border-base flex justify-between items-center bg-bg-surface flex-shrink-0">
                            <div>
                              <h2 className="font-bold text-text-base flex items-center">
                                <User className="w-5 h-5 mr-2 text-primary-600" />
                                Resumo do Cliente
                              </h2>
                              <p className="text-xs text-text-muted mt-0.5">Clique fora para fechar</p>
                            </div>
                            <button onClick={() => setShowAdminUserModal(false)} className="bg-bg-surface-hover text-text-muted hover:text-text-base p-2 rounded-full transition-colors active:scale-95">
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          <div className="p-5 overflow-y-auto space-y-6 min-h-[50vh]">
                            {/* DEBUG INFO */}
                            <div className="hidden">Admin details status: {adminTicketUserDetails ? "Loaded" : "Null"}</div>
                            {!adminTicketUserDetails ? (
                              <div className="flex flex-col items-center justify-center h-full text-text-muted space-y-3 py-10">
                                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                                <p>Carregando dados do cliente...</p>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between items-center bg-bg-surface-hover px-3 py-2 rounded-lg">
                                      <span className="text-text-muted font-medium">Usuário:</span>
                                      <span className="font-bold text-text-base">{adminTicketUserDetails.user?.login}</span>
                                    </div>
                                    <div className="flex flex-col bg-bg-surface-hover px-3 py-2 rounded-lg gap-2">
                                      <div className="flex justify-between items-center">
                                        <span className="text-text-muted font-medium">Dados Ocultos:</span>
                                        <button onClick={() => setShowAdminSecretData(!showAdminSecretData)} className="p-1 rounded-md hover:bg-border-base transition-colors text-text-muted">
                                          {showAdminSecretData ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                      </div>
                                      {showAdminSecretData && (
                                        <div className="p-2 border border-border-base rounded-md border-dashed space-y-1">
                                          <div className="flex justify-between">
                                            <span className="text-text-muted text-xs font-medium">Senha:</span>
                                            <span className="font-mono text-xs font-bold text-text-base overflow-hidden break-all">{adminTicketUserDetails.user?.senha || adminTicketUserDetails.user?.pass || adminTicketUserDetails.user?.password || 'Não definida'}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-text-muted text-xs font-medium">UUID:</span>
                                            <span className="font-mono text-[10px] text-text-base text-right max-w-[150px] overflow-hidden text-ellipsis">{adminTicketUserDetails.devices?.[0]?.device_id || 'Nenhum celular vinculado'}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex justify-between items-center bg-bg-surface-hover px-3 py-2 rounded-lg">
                                      <span className="text-text-muted font-medium">Status:</span>
                                      <span className={`font-bold px-2 py-0.5 rounded-md ${adminTicketUserDetails.user?.status === 'Online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                        {adminTicketUserDetails.user?.status || 'Desconhecido'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-bg-surface-hover px-3 py-2 rounded-lg">
                                      <span className="text-text-muted font-medium">Vencimento:</span>
                                      <span className="font-bold text-text-base">{adminTicketUserDetails.user?.expira}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-bg-surface-hover px-3 py-2 rounded-lg">
                                      <span className="text-text-muted font-medium">Limite (Conexões):</span>
                                      <span className="font-bold text-text-base">{adminTicketUserDetails.user?.limite} devices</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Loyalty Points Section */}
                                <div className="bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-200/30 rounded-3xl p-5 shadow-sm mt-4 relative overflow-hidden">
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400 opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                                  <div className="flex items-center justify-between mb-3 relative z-10">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-xl bg-yellow-100 flex items-center justify-center text-yellow-600 shadow-inner">
                                        <Star className="w-4 h-4" />
                                      </div>
                                      <h3 className="text-sm font-bold text-text-base">Programa de Fidelidade</h3>
                                    </div>
                                    <span className="text-[10px] uppercase tracking-wider font-bold bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-xl border border-yellow-200 shadow-sm">
                                      {adminTicketUserDetails.points || 0}/3 Pontos
                                    </span>
                                  </div>
                                  <div className="flex flex-col mb-1 relative z-10 px-0.5 space-y-3">
                                    <p className="text-[11px] text-text-muted font-medium leading-relaxed">
                                      O cliente pague em dia ou adiantado e ganhe 1 ponto. Ele possui <strong className="text-yellow-600 font-bold">{adminTicketUserDetails.points || 0}</strong> pontos.
                                    </p>
                                    <div className="w-full bg-bg-surface-hover rounded-full h-3 mb-1 border border-border-base/50 p-0.5 overflow-hidden">
                                      <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(250,204,21,0.5)]" style={{ width: `${((adminTicketUserDetails.points || 0) / 3) * 100}%` }}></div>
                                    </div>
                                    <button
                                      onClick={() => setShowAdminHistory(!showAdminHistory)}
                                      className="w-full text-[11px] uppercase tracking-wider font-bold bg-bg-surface hover:bg-border-base text-yellow-700 border border-yellow-200/50 px-4 py-3 rounded-xl transition-colors shadow-sm active:scale-95 flex justify-center items-center mt-2"
                                    >
                                      <History className="w-3.5 h-3.5 mr-2 opacity-80" />
                                      {showAdminHistory ? "Ocultar Histórico" : "Ver Histórico de Transações"}
                                    </button>
                                  </div>

                                  <AnimatePresence>
                                    {showAdminHistory && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="space-y-2 border-t border-yellow-200/30 pt-4 mt-2"
                                      >
                                        {(!adminTicketUserDetails.payments || adminTicketUserDetails.payments.length === 0) ? (
                                          <div className="bg-bg-surface/50 border border-border-base/50 rounded-2xl p-4 text-center">
                                            <p className="text-xs font-semibold text-text-muted">Nenhum pagamento registrado.</p>
                                          </div>
                                        ) : (
                                          adminTicketUserDetails.payments.map((payment: any, idx: number) => {
                                            let meta: any = {};
                                            try { if (payment.metadata) meta = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata; } catch (e) { }
                                            const amount = meta.amount || 0;
                                            const earnedPoint = meta.paidOnTime === true && !meta.discountApplied;
                                            const usedDiscount = meta.discountApplied === true;
                                            return (
                                              <div key={payment.id || idx} className="flex flex-col bg-bg-surface p-3 rounded-2xl border border-border-base shadow-sm">
                                                <div className="flex justify-between items-center mb-1">
                                                  <span className="text-sm font-bold text-text-base">
                                                    {payment.type === 'new_device' ? 'Novo Aparelho' : 'Renovação do Plano'}
                                                  </span>
                                                  {earnedPoint && (
                                                    <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">+1 Ponto</span>
                                                  )}
                                                  {usedDiscount && (
                                                    <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">Desconto -20%</span>
                                                  )}
                                                  {!earnedPoint && !usedDiscount && (
                                                    <span className="text-xs font-bold text-text-muted bg-bg-surface-hover px-2 py-0.5 rounded border border-border-base">Sem ponto</span>
                                                  )}
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] text-text-muted font-medium">
                                                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(payment.paid_at || payment.created_at)}</span>
                                                  <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> {amount ? `R$ ${amount},00` : "—"}</span>
                                                </div>
                                              </div>
                                            );
                                          })
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>

                                {/* Referrals Section */}
                                <div className="bg-gradient-to-br from-primary-500/5 to-transparent border border-primary-200/30 rounded-3xl p-5 shadow-sm mt-4 relative overflow-hidden">
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary-400 opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                                  <div className="flex flex-col mb-3 relative z-10 space-y-4">
                                    <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-5 rounded-2xl text-white shadow-md relative overflow-hidden group w-full">
                                      <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:scale-110 transition-transform duration-500"></div>
                                      <h3 className="text-sm font-bold text-white flex items-center">
                                        <Users className="w-4 h-4 mr-2" />
                                        Indicações do Cliente
                                      </h3>
                                      <p className="text-[11px] text-white/90 mt-1 mb-1">Este cliente já indicou o total de <strong className="font-black text-sm">{adminTicketUserDetails.referrals?.length || 0}</strong> pessoa(s).</p>
                                    </div>
                                    <p className="text-[11px] text-text-muted font-medium text-center leading-relaxed">
                                      Código de indicação utilizado: <strong className="font-mono bg-bg-surface border border-border-base px-2 py-1 rounded-lg text-text-base">{adminTicketUserDetails.user?.login}</strong>
                                    </p>
                                    <button
                                      onClick={() => setShowAdminReferrals(!showAdminReferrals)}
                                      className="w-full text-[11px] uppercase tracking-wider font-bold bg-bg-surface hover:bg-border-base text-primary-600 border border-border-base px-4 py-3 rounded-xl transition-colors shadow-sm active:scale-95 flex justify-center items-center"
                                    >
                                      {showAdminReferrals ? "Ocultar Indicações" : "Ver Lista de Indicados"}
                                    </button>
                                  </div>

                                  <AnimatePresence>
                                    {showAdminReferrals && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="space-y-2 border-t border-border-base/50 pt-4 mt-2"
                                      >
                                        {(!adminTicketUserDetails.referrals || adminTicketUserDetails.referrals.length === 0) ? (
                                          <div className="bg-bg-surface/50 border border-border-base/50 rounded-2xl p-4 text-center">
                                            <p className="text-xs font-semibold text-text-muted">Nenhuma indicação registrada.</p>
                                          </div>
                                        ) : (
                                          adminTicketUserDetails.referrals.map((ref: any) => (
                                            <div key={ref.id} className="flex justify-between items-center bg-bg-surface p-3 rounded-2xl border border-border-base shadow-sm">
                                              <span className="text-sm font-bold text-text-base">{ref.referred_username}</span>
                                              <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg ${ref.status === 'testing' ? 'bg-yellow-100/50 text-yellow-700 border border-yellow-200' :
                                                ref.status === 'paid' ? 'bg-blue-100/50 text-blue-700 border border-blue-200' :
                                                  'bg-green-100/50 text-green-700 border border-green-200'
                                                }`}>
                                                {ref.status === 'testing' ? 'Testando' :
                                                  ref.status === 'paid' ? 'Pagou' :
                                                    'Bônus Recebido'}
                                              </span>
                                            </div>
                                          ))
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>

                            {/* Outros Tickets do mesmo Usuário */}
                            <div>
                              <h3 className="text-sm font-semibold text-text-base mb-3 flex items-center">
                                <MessageSquare className="w-4 h-4 mr-2 text-primary-600" />
                                Histórico de Tickets
                              </h3>
                              <div className="space-y-2">
                                {allTickets.filter(t => t.username === currentTicket.username).length === 0 ? (
                                  <p className="text-xs text-text-muted">Nenhum ticket encontrado.</p>
                                ) : (
                                  allTickets.filter(t => t.username === currentTicket.username).map(t => {
                                    const isCurrent = t.id === currentTicket.id;
                                    return (
                                      <div
                                        key={t.id}
                                        onClick={() => {
                                          if(!isCurrent) {
                                            setCurrentTicket(t);
                                            fetchMessages(t.id);
                                            setShowAdminUserModal(false);
                                          }
                                        }}
                                        className={`flex flex-col p-3 rounded-xl border text-left w-full transition-all ${isCurrent ? 'bg-primary-50 border-primary-200 ring-1 ring-primary-500' : 'bg-bg-surface-hover hover:border-primary-300 border-border-base cursor-pointer hover:shadow-sm'}`}
                                      >
                                        <div className="flex justify-between items-start mb-1">
                                          <span className="font-semibold text-sm text-text-base truncate pr-2">{t.subject}</span>
                                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${t.status === 'open' ? 'bg-amber-100 text-amber-800' : t.status === 'answered' ? 'bg-primary-100 text-primary-800' : 'bg-gray-200 text-gray-600'}`}>
                                            {t.status === 'open' ? 'Aberto' : t.status === 'answered' ? 'Resp.' : 'Fech'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-text-muted">
                                          <span>{t.category}</span>
                                          <span>{formatDate(t.created_at)}</span>
                                        </div>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </div>

                            {adminTicketUserDetails.plan && (
                              <div>
                                <h3 className="text-sm font-semibold text-text-base mb-3 flex items-center">
                                  <CreditCard className="w-4 h-4 mr-2 text-primary-600" />
                                  Plano Atual
                                </h3>
                                <div className="bg-bg-surface-hover p-4 rounded-xl border border-border-base text-sm">
                                  <p className="font-bold text-text-base text-lg">{adminTicketUserDetails.plan.name}</p>
                                  <p className="text-text-muted mt-1 font-medium">
                                    {adminTicketUserDetails.plan.plan_type === 'period'
                                      ? `${adminTicketUserDetails.plan.plan_months} Mês(es) - 1 Celular`
                                      : `1 Mês - ${adminTicketUserDetails.plan.plan_devices} Celulares`}
                                  </p>
                                  <p className="font-black text-primary-600 text-xl mt-2">R$ {adminTicketUserDetails.plan.plan_price},00</p>
                                </div>
                              </div>
                            )}

                            <div>
                              <h3 className="text-sm font-semibold text-text-base mb-3 flex items-center">
                                <History className="w-4 h-4 mr-2 text-primary-600" />
                                Últimos Pagamentos
                              </h3>
                              <div className="space-y-2">
                                {adminTicketUserDetails.payments?.slice(0, 3).map((p: any) => (
                                  <div key={p.id} className="bg-bg-surface-hover p-3 rounded-xl border border-border-base text-xs">
                                    <div className="flex justify-between mb-1.5 items-center">
                                      <span className="font-bold text-text-base uppercase tracking-wider">{p.type === 'new_device' ? 'Novo Aparelho' : 'Renovação'}</span>
                                      <span className={`font-bold px-2 py-0.5 rounded ${p.status === 'approved' ? 'bg-green-100 text-green-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                        {p.status === 'approved' ? 'Aprovado' : p.status === 'pending' ? 'Pendente' : p.status}
                                      </span>
                                    </div>
                                    <p className="text-text-muted flex items-center font-medium"><Clock className="w-3 h-3 mr-1" /> {formatDate(p.created_at)}</p>
                                  </div>
                                ))}
                                {(!adminTicketUserDetails.payments || adminTicketUserDetails.payments.length === 0) && (
                                  <p className="text-xs text-text-muted bg-bg-surface-hover p-3 rounded-lg text-center font-medium border border-border-base border-dashed">Nenhum pagamento registrado.</p>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* Confirm Dialog */}
            {confirmDialog.isOpen && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-bg-surface rounded-2xl shadow-xl max-w-sm w-full p-6"
                >
                  <h3 className="text-lg font-semibold text-text-base mb-2">{confirmDialog.title}</h3>
                  <p className="text-sm text-text-muted mb-6">{confirmDialog.message}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
                      className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-text-base bg-bg-surface-hover hover:bg-bg-base transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        confirmDialog.onConfirm();
                        setConfirmDialog({ ...confirmDialog, isOpen: false });
                      }}
                      className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
                    >
                      Confirmar
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Alert Dialog */}
            {alertDialog.isOpen && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-bg-surface rounded-2xl shadow-xl max-w-sm w-full p-6 flex flex-col items-center text-center"
                >
                  <div className="w-12 h-12 bg-primary-100/50 text-primary-600 rounded-full flex items-center justify-center mb-4 border border-primary-200">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-base mb-2">{alertDialog.title}</h3>
                  <p className="text-sm text-text-muted mb-6 whitespace-pre-wrap">{alertDialog.message}</p>
                  <button
                    onClick={() => setAlertDialog({ ...alertDialog, isOpen: false })}
                    className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm active:scale-95"
                  >
                    Entendi
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile bottom navigation — shown when logged in (not admin) */}
        {currentUser && !["login", "create_user", "admin", "show_credentials", "pix_flow", "reseller_info", "reseller_dashboard", "reseller_pix"].includes(view) && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-bg-surface border-t border-border-base/50 flex items-center safe-area-bottom shadow-lg">
            <button
              onClick={() => setView("dashboard")}
              className={`flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${view === "dashboard" ? "text-primary-600" : "text-text-muted"}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              Painel
            </button>
            <button
              onClick={() => { fetchUserTickets(); setView("tickets"); }}
              className={`flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors relative ${["tickets", "ticket_detail"].includes(view) ? "text-primary-600" : "text-text-muted"}`}
            >
              <MessageSquare className="w-5 h-5" />
              Suporte
              {tickets.filter(t => t.status === "answered").length > 0 && (
                <span className="absolute top-2 right-[calc(50%-10px)] bg-primary-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {tickets.filter(t => t.status === "answered").length}
                </span>
              )}
            </button>
            <button
              onClick={() => setView("help")}
              className={`flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${view === "help" ? "text-primary-600" : "text-text-muted"}`}
            >
              <HelpCircle className="w-5 h-5" />
              Ajuda
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
