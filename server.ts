import express from "express";
import http from "http";
import { MercadoPagoConfig, Payment } from "mercadopago";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import webpush from "web-push";
import cron from "node-cron";

// Note: Removed static import of vite to keep production bundle small

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = Number(process.env.PORT) || 3000;

// --- DB Setup (Supabase) ---
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

function getDb() {
  return supabase;
}

// ─── Web Push (VAPID) ───────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:suporte@vsplus.com.br",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log("[push] VAPID configured ✓");
} else {
  console.warn("[push] VAPID keys NOT set — push notifications disabled");
}

async function sendPush(username: string, title: string, body: string, url = "/") {
  try {
    console.log(`[push] sendPush → username="${username}" title="${title}"`);
    const { data: subs, error: subErr } = await getDb()
      .from("push_subscriptions")
      .select("subscription, endpoint")
      .eq("username", username);
    if (subErr) { console.error("[push] Supabase query error:", subErr); return; }
    if (!subs?.length) { console.log(`[push] No subscriptions found for "${username}"`); return; }
    console.log(`[push] Found ${subs.length} subscription(s) for "${username}"`);
    await Promise.allSettled(
      subs.map((row: any) =>
        webpush
          .sendNotification(row.subscription, JSON.stringify({ title, body, url }))
          .then(() => console.log(`[push] Delivered to endpoint: ${row.endpoint.slice(0, 60)}...`))
          .catch(async (err: any) => {
            console.error(`[push] sendNotification error (status ${err.statusCode}):`, err.message);
            if (err.statusCode === 410 || err.statusCode === 404) {
              await getDb().from("push_subscriptions").delete().eq("endpoint", row.endpoint);
              console.log("[push] Removed stale subscription.");
            }
          })
      )
    );
  } catch (e) { console.error("[push] Unexpected error:", e); }
}

// ─── Activity Log ────────────────────────────────────────────────────────────
// Registro de toda movimentação do app para a guia "Logs" do admin.
// Fire-and-forget: nunca bloqueia nem quebra a operação principal.
type LogActor = "client" | "admin" | "system" | "reseller";

function logActivity(eventType: string, opts: {
  username?: string | null;
  actor?: LogActor;
  description: string;
  metadata?: Record<string, any>;
}): void {
  try {
    getDb().from("activity_logs").insert({
      id: crypto.randomUUID(),
      event_type: eventType,
      username: opts.username || null,
      actor: opts.actor || "system",
      description: opts.description,
      metadata: opts.metadata || null,
    }).then(({ error }) => {
      if (error) console.warn(`[logs] insert failed (${eventType}):`, error.message);
    });
  } catch (e: any) {
    console.warn(`[logs] logActivity error (${eventType}):`, e?.message);
  }
}

function logPaymentTypeLabel(type?: string): string {
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

function fmtBRL(v: any): string {
  const n = Number(v);
  return Number.isFinite(n) ? `R$ ${n.toFixed(2).replace(".", ",")}` : "—";
}

// ─── Admin Auth ────────────────────────────────────────────────────────────
// HMAC-signed stateless tokens. Sessão longa: o painel só é acessível pela
// rota discreta /adm, então o token dura 30 dias para evitar redigitar a senha.
const ADMIN_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 dias

// HMAC-signed tokens survive server restarts — no in-memory Map needed
function createAdminToken(): string {
  const expires = (Date.now() + ADMIN_TOKEN_TTL).toString();
  const secret = process.env.ADMIN_PASSWORD || "fallback-secret";
  const sig = crypto.createHmac("sha256", secret).update(expires).digest("hex");
  return `${expires}.${sig}`;
}

function validateAdminToken(token: string): boolean {
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expires = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (Date.now() > parseInt(expires)) return false;
  const secret = process.env.ADMIN_PASSWORD || "fallback-secret";
  const expected = crypto.createHmac("sha256", secret).update(expires).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function requireAdminAuth(req: any, res: any, next: any) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !validateAdminToken(token)) {
    return res.status(401).json({ error: "Não autorizado. Faça login como administrador." });
  }
  next();
}

app.post("/api/admin/auth", (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: "Senha admin não configurada no servidor." });
  }
  if (password !== adminPassword) {
    return res.status(401).json({ error: "Senha incorreta." });
  }
  const token = createAdminToken();
  const expiresAt = new Date(Date.now() + ADMIN_TOKEN_TTL).toISOString();
  res.json({ token, expiresAt });
});

// Protect all /api/admin/* routes (except /api/admin/auth itself)
app.use("/api/admin", (req: any, res: any, next: any) => {
  if (req.path === "/auth" && req.method === "POST") return next();
  requireAdminAuth(req, res, next);
});

// ─── Reseller Auth ─────────────────────────────────────────────────────────
const resellerTokens = new Map<string, { username: string; expiresAt: number }>();
const RESELLER_TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Stateless HMAC reseller tokens: survive restarts and work across serverless
// instances (the old in-memory Map logged resellers out on every cold start).
// Format: rs.<b64url(username)>.<expiresMs>.<hmac(username.expires)>
function createResellerToken(username: string): string {
  const expires = (Date.now() + RESELLER_TOKEN_TTL).toString();
  const secret = process.env.ADMIN_PASSWORD || "fallback-secret";
  const user64 = Buffer.from(username, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${username}.${expires}`).digest("hex");
  return `rs.${user64}.${expires}.${sig}`;
}

function validateResellerToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "rs") return null;
  const [, user64, expires, sig] = parts;
  if (!/^\d+$/.test(expires) || Date.now() > parseInt(expires)) return null;
  let username: string;
  try { username = Buffer.from(user64, "base64url").toString("utf8"); } catch { return null; }
  const secret = process.env.ADMIN_PASSWORD || "fallback-secret";
  const expected = crypto.createHmac("sha256", secret).update(`${username}.${expires}`).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch { return null; }
  return username;
}

function requireResellerAuth(req: any, res: any, next: any) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Legacy in-memory sessions still honored until they expire naturally.
  const session = resellerTokens.get(token);
  const username = session && Date.now() <= session.expiresAt ? session.username : validateResellerToken(token);
  if (!username) {
    resellerTokens.delete(token);
    return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
  }
  (req as any).resellerUsername = username;
  next();
}

// Check the (deviceId, username) pair against trusted_devices. Used to guard
// client endpoints that expose passwords or change billing state.
async function isTrustedDevice(username: string, deviceId: string): Promise<boolean> {
  if (!username || !deviceId) return false;
  const { data } = await getDb().from("trusted_devices")
    .select("device_id").eq("device_id", deviceId).eq("username", username).maybeSingle();
  return !!data;
}

// Remove credential fields from a VPN panel user object before sending to
// unauthenticated callers.
function stripSenha(user: any): any {
  if (!user || typeof user !== "object") return user;
  const { senha, pass, password, ...safe } = user;
  return safe;
}

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Server is alive and using Supabase native",
    time: new Date().toISOString(),
    env: {
      VPN_API_URL: !!process.env.VPN_API_URL,
      SUPABASE_URL: !!process.env.SUPABASE_URL
    }
  });
});

app.get("/api/db-status", async (req, res) => {
  try {
    const { data: tables, error } = await getDb().rpc('get_tables'); // Or just return success
    res.json({
      status: "ok",
      message: "Database is online (Supabase Native)"
    });
  } catch (e: any) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

const SYSTEM_NOTICE_FALLBACK = { active: false, title: "", message: "", severity: "warning", updated_at: null as string | null };

app.get("/api/system-notice", async (_req, res) => {
  try {
    const { data } = await getDb().from("system_notice").select("active,title,message,severity,updated_at").eq("id", "global").maybeSingle();
    res.json(data || SYSTEM_NOTICE_FALLBACK);
  } catch (e: any) {
    res.json(SYSTEM_NOTICE_FALLBACK);
  }
});

app.post("/api/admin/system-notice", async (req, res) => {
  try {
    const { active, title, message, severity } = req.body || {};
    if (typeof active !== "boolean" || typeof title !== "string" || typeof message !== "string") {
      return res.status(400).json({ error: "Campos inválidos." });
    }
    const sev = ["warning", "error", "info"].includes(severity) ? severity : "warning";
    const { error } = await getDb().from("system_notice").upsert({
      id: "global",
      active,
      title,
      message,
      severity: sev,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    logActivity("admin_notice_updated", {
      actor: "admin",
      description: `Aviso global ${active ? "ativado" : "desativado"}${active && title ? `: "${title}"` : ""}`,
      metadata: { active, title, severity: sev },
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Notificações direcionadas (admin → cliente específico) ─────────────────
// Ficam na área do cliente até ele clicar em "Excluir" (delete real).

// Admin envia uma notificação para um único username
app.post("/api/admin/user-notifications", async (req, res) => {
  try {
    const { username, title, message, severity } = req.body || {};
    if (typeof username !== "string" || !username.trim() || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Informe o usuário e a mensagem." });
    }
    const sev = ["warning", "error", "info"].includes(severity) ? severity : "info";
    const notification = {
      id: crypto.randomUUID(),
      username: username.trim(),
      title: typeof title === "string" ? title.trim() : "",
      message: message.trim(),
      severity: sev,
      created_at: new Date().toISOString(),
    };
    const { error } = await getDb().from("user_notifications").insert(notification);
    if (error) throw error;

    // Push é melhor-esforço: a notificação in-app já está persistida
    sendPush(notification.username, notification.title || "Aviso do suporte", notification.message).catch(() => {});

    logActivity("admin_user_notification_sent", {
      username: notification.username,
      actor: "admin",
      description: `Notificação enviada para "${notification.username}"${notification.title ? `: "${notification.title}"` : ""}`,
      metadata: { title: notification.title, severity: sev },
    });

    res.json({ success: true, notification });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Admin lista as notificações já enviadas para um username
app.get("/api/admin/user-notifications/:username", async (req, res) => {
  try {
    const { data, error } = await getDb().from("user_notifications")
      .select("*")
      .eq("username", req.params.username)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Admin remove uma notificação enviada (ex.: enviada por engano)
app.delete("/api/admin/user-notifications/:id", async (req, res) => {
  try {
    const { error } = await getDb().from("user_notifications").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Cliente lista as próprias notificações
app.get("/api/user-notifications/:username", async (req, res) => {
  try {
    const { data, error } = await getDb().from("user_notifications")
      .select("id,username,title,message,severity,created_at")
      .eq("username", req.params.username)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Cliente exclui uma notificação (só some quando ELE clica em excluir).
// O filtro por username impede apagar notificação de outro cliente.
app.delete("/api/user-notifications/:id", async (req, res) => {
  try {
    const username = String(req.query.username || "");
    if (!username) return res.status(400).json({ error: "Usuário não informado." });
    const { error } = await getDb().from("user_notifications")
      .delete()
      .eq("id", req.params.id)
      .eq("username", username);
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const VPN_API_URL = process.env.VPN_API_URL || "https://pweb.cloudbrasil.shop/core/apiatlas.php";
const VPN_API_KEY = process.env.VPN_API_KEY || "LTm2H0TnZwKY560Vqj7gfbxeIL";

// ─── VPN API helper with retry ───────────────────────────────────────────────
async function callVpnApi(params: URLSearchParams, retries = 3, delayMs = 2000): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(VPN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const text = await res.text();
      // Detect Cloudflare/HTML error pages
      if (text.toLowerCase().includes("<html")) {
        throw new Error(`VPN API returned HTML (Cloudflare/rate-limit) on attempt ${attempt}`);
      }
      // Detect VPN API explicit errors
      try {
        const json = JSON.parse(text);
        if (json?.status === "error" || json?.error) {
          throw new Error(`VPN API error: ${json.msg || json.error}`);
        }
      } catch (parseErr) {
        // Not JSON — plain text response is usually OK (e.g. "sucesso")
        if (typeof parseErr === "object" && (parseErr as any)?.message?.startsWith("VPN API")) throw parseErr;
      }
      return text;
    } catch (e: any) {
      console.error(`[VPN] callVpnApi attempt ${attempt}/${retries} failed:`, e.message);
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs));
      else throw e;
    }
  }
  throw new Error("callVpnApi: all retries exhausted");
}

async function fetchVpnUsers() {
  const params = new URLSearchParams();
  params.append("passapi", VPN_API_KEY);
  params.append("module", "userget");

  try {
    const vpnRes = await fetch(VPN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const textResponse = await vpnRes.text();
    try {
      const users = JSON.parse(textResponse);
      if (Array.isArray(users)) {
        return users;
      }
      return [];
    } catch (e) {
      console.error("Failed to parse user list as JSON. Response:", textResponse.substring(0, 100));
      if (textResponse.toLowerCase().includes("<html")) {
        throw new Error("Erro de comunicação com o servidor VPN (Cloudflare/Rate Limit). Tente novamente em alguns instantes.");
      }
      throw new Error("Erro ao consultar usuários no painel VPN.");
    }
  } catch (e: any) {
    console.error("Failed to fetch user list:", e);
    throw new Error(e.message || "Erro de conexão com o painel VPN.");
  }
}

// Redundant migrations removed for Supabase environment

// Mercado Pago setup
let mpClient: MercadoPagoConfig | null = null;
const getMpClient = () => {
  if (!mpClient) {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
      throw new Error("MP_ACCESS_TOKEN environment variable is required");
    }
    mpClient = new MercadoPagoConfig({ accessToken: token });
  }
  return mpClient;
};

// Parse payment metadata safely (Supabase may return JSONB as string in some contexts)
function parseMetadata(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

// Normalize and validate payment metadata. This runs when we read metadata
// before acting on it — it guards against stale/forged values like
// resellerMonths: "3" (string), -1, 999, or NaN that would otherwise silently
// skew day calculations and panel applications.
function normalizeMetadata(raw: any): any {
  const m = parseMetadata(raw);
  const out: any = { ...m };

  // resellerMonths: integer 1..12
  if (m.resellerMonths !== undefined) {
    const n = parseInt(m.resellerMonths);
    out.resellerMonths = Number.isFinite(n) ? Math.max(1, Math.min(12, n)) : 1;
  }
  // resellerLogins: integer 10..1000
  if (m.resellerLogins !== undefined) {
    const n = parseInt(m.resellerLogins);
    out.resellerLogins = Number.isFinite(n) ? Math.max(10, Math.min(1000, n)) : 10;
  }
  // amount: finite positive number
  if (m.amount !== undefined) {
    const n = Number(m.amount);
    out.amount = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  // boolean-ish flags — keep as strict booleans
  for (const k of ["discountApplied", "vpnApplied", "vpnRenewFailed", "isManualSetup", "isAdminAdjustment", "vpnFullyApplied"]) {
    if (m[k] !== undefined) out[k] = !!m[k];
  }
  return out;
}

// Calculate loyalty points from payment + refund history (single source of truth)
const RESELLER_PAYMENT_TYPES = ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment", "reseller_logins_increase"];
const REGULAR_PAYMENT_TYPES = ["renewal", "new_device"];

async function calculateLoyaltyPoints(username: string): Promise<number> {
  const { data: payments } = await getDb()
    .from("payments")
    .select("metadata, paid_at")
    .eq("username", username)
    .eq("status", "approved")
    .in("type", REGULAR_PAYMENT_TYPES)
    .order("paid_at", { ascending: true, nullsFirst: false });

  let points = 0;
  for (const p of payments || []) {
    const meta = parseMetadata(p.metadata);
    if (meta.discountApplied === true) {
      points = 0; // Reset after discount was used
    } else if (meta.paidOnTime === true) {
      points++;
    }
  }

  // Deduct 1 point for each approved refund
  const { data: refunds } = await getDb()
    .from("refund_requests")
    .select("id")
    .eq("username", username)
    .eq("status", "aprovado");
  points = Math.max(0, points - (refunds?.length || 0));

  return Math.min(points, 3); // Never exceed 3
}

// Loyalty points for RESELLERS — counts reseller payments (hire/renewal).
// Before this existed, the renewal endpoint offered the 3-point discount but
// points only ever counted regular-client payments, so no reseller could
// ever reach it (dead feature). Same rules: paidOnTime earns 1, using the
// discount resets, approved refunds deduct, capped at 3.
async function calculateResellerLoyaltyPoints(username: string): Promise<number> {
  const { data: payments } = await getDb()
    .from("payments")
    .select("metadata, paid_at")
    .eq("username", username)
    .eq("status", "approved")
    .in("type", ["reseller_hire", "reseller_renewal"])
    .order("paid_at", { ascending: true, nullsFirst: false });

  let points = 0;
  for (const p of payments || []) {
    const meta = parseMetadata(p.metadata);
    if (meta.discountApplied === true) {
      points = 0;
    } else if (meta.paidOnTime === true) {
      points++;
    }
  }

  const { data: refunds } = await getDb()
    .from("refund_requests")
    .select("id")
    .eq("username", username)
    .eq("status", "aprovado");
  points = Math.max(0, points - (refunds?.length || 0));

  return Math.min(points, 3);
}

// Parse VPN expira date robustly (handles "YYYY-MM-DD HH:MM:SS" and "YYYY-MM-DD")
function parseVpnExpira(expira: any): Date | null {
  if (!expira) return null;
  const s = String(expira).trim();
  // If has time component: "2026-03-20 23:59:59" → "2026-03-20T23:59:59-03:00"
  // If date only: "2026-03-20" → "2026-03-20T23:59:59-03:00" (end of day)
  const iso = s.length > 10
    ? s.replace(' ', 'T') + '-03:00'
    : s + 'T23:59:59-03:00';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Cancel stale pending payments (>3 hours) ─────────────────────────────
// NOTE: Window is 3 hours — PIX can be confirmed by the bank up to ~2h after generation.
// The approvePayment() function also handles "cancelled" status so late webhooks still work.
async function cancelStalePendingPayments() {
  try {
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data, error } = await getDb()
      .from("payments")
      .update({ status: "cancelled" })
      .eq("status", "pending")
      .lt("created_at", cutoff);
    if (!error && data) console.log(`[payments] cancelled ${(data as any[]).length ?? "?"} stale pending payment(s)`);
  } catch (e) { console.error("[payments] cancelStalePending error:", e); }
}

// Run once on startup + every 30 minutes
cancelStalePendingPayments();
setInterval(cancelStalePendingPayments, 30 * 60 * 1000);

// ─── VPN operation applier with audit trail ─────────────────────────────────
// Every call to the VPN panel (renewuser, renewrev, createuser, createrev) goes
// through here. Records a payment_attempts row before and updates after so we
// can: (1) detect what already succeeded and skip it on retry (idempotency);
// (2) surface failures to the admin UI; (3) reprocess failed attempts without
// risking double-application in the panel.
async function applyVpnOperation(opts: {
  paymentId: string;
  module: string;
  targetUsername: string;
  extraParams?: Record<string, string>;
}): Promise<{ success: boolean; response?: string; error?: string; attemptId: string }> {
  const db = getDb();
  const attemptId = crypto.randomUUID();

  const { data: prior } = await db
    .from("payment_attempts")
    .select("id")
    .eq("payment_id", opts.paymentId)
    .eq("module", opts.module)
    .eq("target_username", opts.targetUsername);
  const attemptNumber = (prior?.length || 0) + 1;

  await db.from("payment_attempts").insert({
    id: attemptId,
    payment_id: opts.paymentId,
    target_username: opts.targetUsername,
    module: opts.module,
    status: "pending",
    attempt_number: attemptNumber,
  });

  const params = new URLSearchParams();
  params.append("passapi", VPN_API_KEY);
  params.append("module", opts.module);
  params.append("user", opts.targetUsername);
  if (opts.extraParams) {
    for (const [k, v] of Object.entries(opts.extraParams)) {
      params.append(k, v);
    }
  }

  try {
    const response = await callVpnApi(params);
    await db.from("payment_attempts")
      .update({ status: "success", response_text: response, applied_at: new Date().toISOString() })
      .eq("id", attemptId);
    return { success: true, response, attemptId };
  } catch (e: any) {
    const errMsg = e?.message || String(e);
    await db.from("payment_attempts")
      .update({ status: "failed", error_message: errMsg })
      .eq("id", attemptId);
    return { success: false, error: errMsg, attemptId };
  }
}

// Count successful VPN operations for a payment. Used for idempotency:
// skip operations that already succeeded so retries never double-apply.
async function countSuccessfulAttempts(paymentId: string, module: string, targetUsername?: string): Promise<number> {
  let query: any = getDb()
    .from("payment_attempts")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("module", module)
    .eq("status", "success");
  if (targetUsername) query = query.eq("target_username", targetUsername);
  const { data } = await query;
  return data?.length || 0;
}

// Tentativa "pending" órfã = a execução morreu DURANTE a chamada ao painel, e
// não dá para saber se ela chegou a aplicar (já vimos casos em que aplicou).
// Reaplicar às cegas pode dobrar a renovação — nesses alvos quem decide é o admin.
async function hasPendingAttempt(paymentId: string, module: string, targetUsername: string): Promise<boolean> {
  const { data } = await getDb()
    .from("payment_attempts")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("module", module)
    .eq("target_username", targetUsername)
    .eq("status", "pending");
  return (data?.length || 0) > 0;
}

// Refresh the reseller_plans cache from approved payments + successful attempts.
// Called after every approvePayment and after admin adjustments. Reading this
// cache is O(1) vs recomputing calcResellerInfo across full payment history.
async function upsertResellerPlan(username: string) {
  const db = getDb();
  const { data: payments } = await db
    .from("payments")
    .select("*")
    .eq("username", username)
    .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(200);

  const info = await calcResellerInfoWithAttempts(payments || []);
  const lastPayment = (payments || [])[((payments || []).length - 1)];
  await db.from("reseller_plans").upsert({
    username,
    current_logins: info.logins,
    current_expires_at: info.expiresAt,
    total_months_paid: info.totalMonths,
    last_renewal_at: lastPayment?.paid_at || null,
    last_payment_id: lastPayment?.id || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "username" });
}

async function approvePayment(paymentRecord: any) {
  const paymentId = paymentRecord.id;
  const db = getDb();

  // Idempotency: update only if pending OR cancelled (cancelled may happen if webhook arrived late)
  const { data: updated } = await db.from("payments")
    .update({ status: "approved", paid_at: new Date().toISOString() })
    .eq("id", paymentId)
    .in("status", ["pending", "cancelled"])
    .select("id");

  if (!updated || updated.length === 0) {
    console.log(`[approvePayment] Payment ${paymentId} already processed, skipping`);
    return;
  }

  // Parse + normalize metadata (clamps resellerMonths/logins, coerces types).
  // Defends against bad data landing in JSONB that would otherwise silently
  // over- or under-apply renewals.
  const metadata = normalizeMetadata(paymentRecord.metadata);

  logActivity("payment_approved", {
    username: paymentRecord.username,
    actor: "client",
    description: `Pagamento aprovado: ${logPaymentTypeLabel(paymentRecord.type)} — ${fmtBRL(metadata.amount)}`,
    metadata: { paymentId, type: paymentRecord.type, amount: metadata.amount ?? null, discountApplied: !!metadata.discountApplied },
  });

  // Track whether every VPN panel operation triggered by this payment succeeded.
  // A partial failure flips this false and the admin gets a retry button in the UI.
  let vpnFullyApplied = true;
  const recordFailure = (msg: string) => {
    vpnFullyApplied = false;
    sendPush("__admin__", "⚠️ Falha ao aplicar renovação", msg);
    logActivity("payment_vpn_failed", {
      username: paymentRecord.username,
      actor: "system",
      description: `Falha ao aplicar no painel VPN: ${msg}`,
      metadata: { paymentId, type: paymentRecord.type },
    });
  };

  if (paymentRecord.type === "reseller_hire") {
    // Create new reseller in VPN panel, then renew N months
    const { resellerUsername: newRev, resellerPassword: newRevPass, resellerWhatsapp, resellerLogins, resellerMonths } = metadata;
    if (newRev && newRevPass) {
      // createrev is idempotent-by-attempt-count: if we already succeeded, skip.
      const createDone = await countSuccessfulAttempts(paymentId, "createrev", newRev);
      if (createDone === 0) {
        const extra: Record<string, string> = { pass: newRevPass, userlimite: String(resellerLogins || 10) };
        if (resellerWhatsapp) extra.whatsapp = resellerWhatsapp;
        const r = await applyVpnOperation({ paymentId, module: "createrev", targetUsername: newRev, extraParams: extra });
        if (!r.success) recordFailure(`createrev ${newRev} falhou. Pagamento: ${paymentId}. Erro: ${r.error}`);
        else console.log(`[reseller] createrev for ${newRev}:`, r.response);
      }

      // renewrev N times, skipping any already-successful attempts for idempotency.
      const months = Math.max(1, Math.min(12, Number(resellerMonths) || 1));
      const alreadyRenewed = await countSuccessfulAttempts(paymentId, "renewrev", newRev);
      for (let i = alreadyRenewed; i < months; i++) {
        const r = await applyVpnOperation({ paymentId, module: "renewrev", targetUsername: newRev });
        if (!r.success) {
          recordFailure(`renewrev ${newRev} (mês ${i + 1}) falhou. Pagamento: ${paymentId}. Erro: ${r.error}`);
          break; // stop the loop on failure so retry picks up exactly here
        }
        console.log(`[reseller] renewrev ${newRev} month ${i + 1}:`, r.response);
      }
      if (vpnFullyApplied) {
        sendPush(paymentRecord.username, "Revenda ativada! 🎉", "Sua conta de revenda está ativa e pronta para uso.");
        logActivity("reseller_hired", {
          username: newRev,
          actor: "reseller",
          description: `Revenda contratada: ${newRev} — ${resellerLogins || 10} logins por ${Math.max(1, Math.min(12, Number(resellerMonths) || 1))} mês(es), ${fmtBRL(metadata.amount)}`,
          metadata: { paymentId, logins: resellerLogins || 10, months: resellerMonths || 1, amount: metadata.amount ?? null },
        });
      }
    }

  } else if (paymentRecord.type === "reseller_renewal") {
    // Renew existing reseller N months, skipping any already-successful attempts.
    // CRITICAL: this is what fixes the "paid 1 month, got 2" bug — renewrev is
    // never called more than the computed total per payment, even across
    // retries, webhook duplicates, or admin-triggered reprocessing.
    const resellerUser = metadata.resellerUsername || paymentRecord.username;
    const months = Math.max(1, Math.min(12, Number(metadata.resellerMonths) || 1));

    // Deficit compensation (same policy as client renewals): if the reseller
    // was already expired, each full 30 days of deficit is covered by an extra
    // renewrev. The remainder (<30d) is corrected in OUR expiry accounting via
    // an automatic reseller_adjustment (the panel has no set-date module, so
    // the panel keeps a <30d lag — admin is notified to align it manually).
    let extraRenewals = 0;
    let remainderDays = 0;
    let deficitDays = 0;
    try {
      const { data: priorPayments } = await db.from("payments").select("*")
        .eq("username", resellerUser)
        .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
        .eq("status", "approved")
        .neq("id", paymentId) // exclude THIS payment — its renewals haven't applied yet
        .order("created_at", { ascending: true })
        .limit(200);
      const prior = await calcResellerInfoWithAttempts(priorPayments || []);
      if (prior.expiresAt) {
        const exp = new Date(prior.expiresAt);
        if (exp.getTime() < Date.now()) {
          deficitDays = Math.ceil((Date.now() - exp.getTime()) / 86400000);
          extraRenewals = Math.min(Math.floor(deficitDays / 30), 12); // safety cap
          remainderDays = deficitDays - extraRenewals * 30;
          console.log(`[reseller] ${resellerUser} expired ${deficitDays}d ago — compensating ${extraRenewals} renewrev(s), remainder ${remainderDays}d`);
        }
      }
    } catch (e: any) {
      console.warn(`[reseller] deficit check failed for ${resellerUser}:`, e?.message);
    }

    const totalRenewals = months + extraRenewals;
    const alreadyRenewed = await countSuccessfulAttempts(paymentId, "renewrev", resellerUser);
    for (let i = alreadyRenewed; i < totalRenewals; i++) {
      const r = await applyVpnOperation({ paymentId, module: "renewrev", targetUsername: resellerUser });
      if (!r.success) {
        recordFailure(`renewrev ${resellerUser} (${i + 1}/${totalRenewals}) falhou. Pagamento: ${paymentId}. Erro: ${r.error}`);
        break;
      }
      console.log(`[reseller] renewrev ${resellerUser} ${i + 1}/${totalRenewals}:`, r.response);
    }

    // Remainder correction: pin OUR expiry to exactly now + 30*months via an
    // automatic adjustment, and remind the admin to align the panel date.
    if (vpnFullyApplied && deficitDays > 0) {
      if (remainderDays > 0) {
        const correctDate = new Date();
        correctDate.setDate(correctDate.getDate() + 30 * months);
        try {
          await db.from("payments").insert({
            id: `adj_${resellerUser}_${Date.now()}`,
            username: resellerUser,
            status: "approved",
            type: "reseller_adjustment",
            paid_at: new Date().toISOString(),
            metadata: { resellerExpiresAt: correctDate.toISOString(), isAutoCorrection: true, sourcePaymentId: paymentId },
          });
        } catch (e: any) {
          console.warn(`[reseller] auto-adjustment insert failed for ${resellerUser}:`, e?.message);
        }
        sendPush("__admin__", "📅 Revenda: painel precisa de ajuste",
          `${resellerUser} renovou vencido há ${deficitDays} dia(s). ${extraRenewals * 30} dias compensados automaticamente; a data no app já está correta, mas o painel VPN ficou ${remainderDays} dia(s) atrás — ajuste manualmente se necessário.`);
      } else {
        sendPush("__admin__", "✅ Revenda: vencimento compensado",
          `${resellerUser} renovou vencido há ${deficitDays} dia(s) — ${extraRenewals * 30} dias compensados automaticamente no painel, sem ação manual.`);
      }
      logActivity("renewal_deficit_compensated", {
        username: resellerUser,
        actor: "system",
        description: `Renovação de revenda com ${deficitDays} dia(s) de atraso: ${extraRenewals * 30} dias compensados${remainderDays > 0 ? `, data do app corrigida (painel ${remainderDays} dia(s) atrás)` : ""}`,
        metadata: { paymentId, deficitDays, extraRenewals, remainderDays },
      });
    }
    if (vpnFullyApplied) {
      sendPush(paymentRecord.username, "Revenda renovada! 🎉", "Sua revenda foi renovada com sucesso.");
      logActivity("reseller_renewed", {
        username: resellerUser,
        actor: "reseller",
        description: `Revenda renovada: ${resellerUser} — ${months} mês(es), ${fmtBRL(metadata.amount)}`,
        metadata: { paymentId, months, amount: metadata.amount ?? null },
      });
    }

  } else if (paymentRecord.type === "reseller_logins_increase") {
    // After paid login upgrade: create change_request for admin to confirm manually
    const { newLogins } = metadata;
    if (newLogins) {
      await db.from("change_requests").insert({
        id: crypto.randomUUID(),
        username: paymentRecord.username,
        type: "reseller_logins_increase",
        requested_value: String(newLogins),
        status: "aguardando_confirmacao",
      });
      console.log(`[reseller_logins_increase] change_request created for ${paymentRecord.username}: ${newLogins} logins`);
      logActivity("change_request_created", {
        username: paymentRecord.username,
        actor: "system",
        description: `Aumento de logins pago (${newLogins} logins) — aguardando confirmação do admin`,
        metadata: { type: "reseller_logins_increase", newLogins, paymentId },
      });
    }
    sendPush(paymentRecord.username, "Pagamento recebido!", "Aguardando confirmação do administrador para adicionar os logins.");
    sendPush("__admin__", "Aumento de logins pago", `${paymentRecord.username} pagou pelo aumento de logins. Confirme no painel.`);

  } else if (paymentRecord.type === "new_device") {
    const { newUsername, remainingDays, groupId } = metadata;

    if (newUsername && remainingDays && groupId) {
      // Panel module is "criaruser" (user/pass/validadeusuario/userlimite) — see restapi-painel-vpn.json.
      const createDone = await countSuccessfulAttempts(paymentId, "criaruser", newUsername);
      if (createDone === 0) {
        const password = Math.floor(100000 + Math.random() * 900000).toString();
        const r = await applyVpnOperation({
          paymentId,
          module: "criaruser",
          targetUsername: newUsername,
          extraParams: { pass: password, validadeusuario: String(remainingDays), userlimite: "1", whatsapp: "" },
        });
        if (!r.success) recordFailure(`criaruser ${newUsername} falhou. Pagamento: ${paymentId}. Erro: ${r.error}`);
        else {
          console.log(`VPN Create Response for ${newUsername}:`, r.response);
          logActivity("device_created", {
            username: paymentRecord.username,
            actor: "client",
            description: `Aparelho novo criado no painel: ${newUsername} (${remainingDays} dias, ${fmtBRL(metadata.amount)})`,
            metadata: { paymentId, newUsername, remainingDays, amount: metadata.amount ?? null },
          });
        }
      }

      // Add to group (ignore duplicate key — safe on retry)
      try {
        await db.from("user_groups").insert({ group_id: groupId, username: newUsername });
      } catch (e: any) {
        console.warn(`[approvePayment] user_groups insert for ${newUsername} (may be duplicate):`, e?.message);
      }

      // Update group plan to reflect the new device count
      try {
        const { data: currentPlan } = await db.from("group_plans").select("*").eq("group_id", groupId).maybeSingle();
        if (currentPlan) {
          const newDevices = (currentPlan.plan_devices || 1) + 1;
          const newPrice = calculatePlanPrice(currentPlan.plan_months || 1, newDevices);
          await db.from("group_plans").update({
            plan_devices: newDevices,
            plan_price: newPrice,
          }).eq("group_id", groupId);
          console.log(`[approvePayment] Group ${groupId} plan updated: ${currentPlan.plan_devices} → ${newDevices} devices, price R$${newPrice}`);
        }
      } catch (e: any) {
        console.warn(`[approvePayment] Failed to update group_plans for ${groupId}:`, e?.message);
      }
    }
  } else {
    // Renewal logic
    const groupId = paymentRecord.group_id;
    let usersToRenew = [paymentRecord.username];
    let monthsToRenew = 1;

    if (groupId) {
      const { data: plan } = await db.from("group_plans").select("*").eq("group_id", groupId).maybeSingle();
      if (plan) {
        monthsToRenew = (plan as any).plan_months;
      }
      const { data: groupUsers } = await db.from("user_groups").select("username").eq("group_id", groupId);
      if (groupUsers && groupUsers.length > 0) {
        // Pagante primeiro: se a execução for derrubada no meio do loop (timeout
        // serverless), pelo menos quem pagou já foi renovado.
        usersToRenew = groupUsers
          .map(u => u.username)
          .sort((a, b) => (a === paymentRecord.username ? -1 : b === paymentRecord.username ? 1 : 0));
      }
    }

    // renewuser adds 30 days to the CURRENT expiry. If the user is expired,
    // those days start from the past date → fewer days than paid.
    // Compensation: every full 30 days of deficit is covered automatically by
    // an extra renewuser call. Only the remainder (<30d) needs a manual
    // date_correction in the panel (the API has no "set date" module).
    const allVpnUsers = await fetchVpnUsers();
    let needsDateCorrection = false;
    let correctExpiryDate = "";
    let extraRenewals = 0;
    let remainderDays = 0;

    const mainVpnUser = allVpnUsers.find((u: any) => u.login === usersToRenew[0]);
    if (mainVpnUser?.expira) {
      const expiry = parseVpnExpira(mainVpnUser.expira);
      const now = new Date();
      if (expiry && expiry < now) {
        const deficitDays = Math.ceil((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
        extraRenewals = Math.min(Math.floor(deficitDays / 30), 12); // safety cap
        remainderDays = deficitDays - extraRenewals * 30;
        if (remainderDays > 0) {
          needsDateCorrection = true;
          const correctDate = new Date(now);
          correctDate.setDate(correctDate.getDate() + (30 * monthsToRenew));
          correctExpiryDate = correctDate.toISOString().split("T")[0];
        }
        console.log(`[renew] ${usersToRenew[0]} expired ${deficitDays}d ago — auto-compensating ${extraRenewals} renewal(s), remainder ${remainderDays}d${needsDateCorrection ? ` → date_correction to ${correctExpiryDate}` : ""}`);
        if (extraRenewals > 0) {
          logActivity("renewal_deficit_compensated", {
            username: paymentRecord.username,
            actor: "system",
            description: `Renovação com acesso vencido há ${deficitDays} dia(s): ${extraRenewals * 30} dias compensados automaticamente${remainderDays > 0 ? `, restam ${remainderDays} dia(s) para correção manual` : ""}`,
            metadata: { paymentId, deficitDays, extraRenewals, remainderDays },
          });
        }
      }
    }

    // Apply renewuser N times per user (plan months + expiry-deficit compensation),
    // with idempotency: already-successful attempts are counted and skipped so
    // retries never double-renew.
    const totalRenewals = monthsToRenew + extraRenewals;
    for (const user of usersToRenew) {
      const alreadyRenewed = await countSuccessfulAttempts(paymentId, "renewuser", user);
      for (let i = alreadyRenewed; i < totalRenewals; i++) {
        const r = await applyVpnOperation({ paymentId, module: "renewuser", targetUsername: user });
        if (!r.success) {
          recordFailure(`renewuser ${user} (${i + 1}/${totalRenewals}) falhou. Pagamento: ${paymentId}. Erro: ${r.error}`);
          break;
        }
        console.log(`VPN Renew Response for ${user} (${i + 1}/${totalRenewals}):`, r.response);
      }
    }

    // Create automatic date correction request for the remainder (<30d) if users were expired
    if (needsDateCorrection && correctExpiryDate && vpnFullyApplied) {
      for (const user of usersToRenew) {
        try {
          await db.from("change_requests").insert({
            id: crypto.randomUUID(),
            username: user,
            type: "date_correction",
            requested_value: correctExpiryDate,
            status: "aguardando",
          });
          console.log(`[date_correction] Created for ${user} → ${correctExpiryDate}`);
          logActivity("change_request_created", {
            username: user,
            actor: "system",
            description: `Correção de vencimento criada automaticamente → ${correctExpiryDate.split("-").reverse().join("/")}`,
            metadata: { type: "date_correction", requestedValue: correctExpiryDate, paymentId },
          });
        } catch (e: any) {
          console.warn(`[date_correction] Failed to create for ${user}:`, e.message);
        }
      }
      sendPush("__admin__", "📅 Correção de vencimento pendente",
        `${paymentRecord.username} renovou com acesso vencido. ${extraRenewals > 0 ? `${extraRenewals * 30} dias já compensados automaticamente. ` : ""}Faltam ${remainderDays} dia(s): ajuste a data no painel para ${correctExpiryDate.split("-").reverse().join("/")}. Veja em Solicitações.`);
    } else if (extraRenewals > 0 && vpnFullyApplied) {
      sendPush("__admin__", "✅ Vencimento compensado automaticamente",
        `${paymentRecord.username} renovou com acesso vencido — ${extraRenewals * 30} dia(s) de déficit compensados no painel, sem ação manual.`);
    }
  }

  // Persist VPN application status on the payment so the admin UI can show
  // which payments were confirmed financially but failed to apply on the panel.
  await db.from("payments")
    .update({ metadata: { ...metadata, vpnApplied: vpnFullyApplied } })
    .eq("id", paymentId);

  // Refresh the reseller plan cache after any reseller-affecting payment.
  if (paymentRecord.type === "reseller_hire" || paymentRecord.type === "reseller_renewal") {
    const target = metadata.resellerUsername || paymentRecord.username;
    try { await upsertResellerPlan(target); }
    catch (e: any) { console.error(`[reseller_plans] upsert failed for ${target}:`, e?.message); }
  }

  // Reseller payments don't earn loyalty/referral bonuses
  if (RESELLER_PAYMENT_TYPES.includes(paymentRecord.type)) {
    return;
  }

  // Notify regular user that payment was approved
  sendPush(paymentRecord.username, "Pagamento aprovado! ✅", "Seu acesso foi renovado com sucesso.");

  // Handle Loyalty Points
  const username = paymentRecord.username;
  try {
    if (metadata.discountApplied === true) {
      // Reset points after discount used
      const { error } = await db.from("loyalty_points")
        .upsert({ username, points: 0, updated_at: new Date().toISOString() }, { onConflict: 'username' });
      if (error) throw error;
      console.log(`[loyalty] Reset points for ${username} (discount used)`);
    } else if (metadata.paidOnTime === true) {
      // Increment by 1 using UPSERT to avoid INSERT/UPDATE split issues
      const { data: lp } = await db.from("loyalty_points")
        .select("points")
        .eq("username", username)
        .maybeSingle();
      const currentPoints = lp ? Number(lp.points) : 0;
      const newPoints = currentPoints + 1;
      const { error } = await db.from("loyalty_points")
        .upsert({ username, points: newPoints, updated_at: new Date().toISOString() }, { onConflict: 'username' });
      if (error) throw error;
      console.log(`[loyalty] Points for ${username}: ${currentPoints} → ${newPoints}`);
    } else {
      console.log(`[loyalty] No change for ${username}: discountApplied=${metadata.discountApplied}, paidOnTime=${metadata.paidOnTime}`);
    }
  } catch (loyaltyErr) {
    console.error(`[loyalty] Error for ${username}:`, loyaltyErr);
  }

  // Handle Referral Bonus
  const { data: referral } = await db.from("referrals").select("*").eq("referred_username", paymentRecord.username).eq("status", "testing").maybeSingle();

  if (referral) {
    // Give 1 month free to referrer. Goes through applyVpnOperation so failures
    // show up in the audit trail and can be retried.
    const already = await countSuccessfulAttempts(paymentId, "renewuser", referral.referrer_username);
    if (already === 0) {
      const r = await applyVpnOperation({
        paymentId,
        module: "renewuser",
        targetUsername: referral.referrer_username,
      });
      if (r.success) {
        await db.from("referrals").update({ status: 'bonus_received' }).eq("id", referral.id);
        logActivity("referral_bonus", {
          username: referral.referrer_username,
          actor: "system",
          description: `Bônus de indicação: ${referral.referrer_username} ganhou +30 dias por indicar ${paymentRecord.username}`,
          metadata: { referredUsername: paymentRecord.username, paymentId },
        });
      } else {
        console.error(`Failed to award referral bonus to ${referral.referrer_username}:`, r.error);
      }
    }
  }
}

// ─── Auto-check payment against MP after 1 min and 5 min ─────────────────────
// Persists the schedule to `scheduled_checks` so pending checks survive a restart.
// The worker (runScheduledChecksTick) runs every 30s and executes anything due.
async function schedulePaymentCheck(paymentId: string) {
  const delaysMs = [60_000, 300_000]; // 1 minute, 5 minutes
  try {
    const rows = delaysMs.map(d => ({
      id: crypto.randomUUID(),
      payment_id: paymentId,
      run_at: new Date(Date.now() + d).toISOString(),
      status: "pending",
    }));
    await getDb().from("scheduled_checks").insert(rows);
  } catch (e) {
    // If the insert fails (e.g. table missing in dev), fall back to in-memory setTimeout
    // so the current process at least behaves like before.
    console.warn(`[auto-check] Failed to persist scheduled check for ${paymentId}, using setTimeout fallback:`, e);
    for (const delay of delaysMs) {
      setTimeout(() => runPaymentCheck(paymentId, delay / 1000), delay);
    }
  }
}

// Actually check one payment against MP and approve if due.
async function runPaymentCheck(paymentId: string, ctxTag: string | number): Promise<void> {
  try {
    const { data: p } = await getDb().from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (!p || p.status === "approved") return; // already handled
    const mpPayment = new Payment(getMpClient());
    const mpRes = await mpPayment.get({ id: paymentId });
    if (mpRes.status === "approved") {
      await approvePayment(p);
      console.log(`[auto-check] Payment ${paymentId} approved (ctx=${ctxTag})`);
    }
  } catch (e) {
    console.warn(`[auto-check] Error checking payment ${paymentId} (ctx=${ctxTag}):`, e);
  }
}

// Worker tick: find due scheduled_checks, run them, mark done.
// Called on an interval below so missed checks from restart are picked up.
async function runScheduledChecksTick(): Promise<void> {
  try {
    const { data: due } = await getDb()
      .from("scheduled_checks")
      .select("*")
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString())
      .limit(50);

    for (const row of due || []) {
      try {
        // Claim the row first to avoid duplicate execution across workers/restarts.
        const { data: claimed } = await getDb()
          .from("scheduled_checks")
          .update({ status: "running" })
          .eq("id", row.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (!claimed) continue; // someone else took it

        await runPaymentCheck(row.payment_id, `scheduled:${row.id}`);
        await getDb().from("scheduled_checks").update({ status: "done" }).eq("id", row.id);
      } catch (e) {
        console.warn(`[scheduled_checks] row ${row.id} failed:`, e);
        await getDb().from("scheduled_checks").update({ status: "failed" }).eq("id", row.id);
      }
    }
  } catch (e) {
    console.warn("[scheduled_checks] tick error:", e);
  }
}

// Start the scheduled-checks worker. 30s cadence is fine: MP delay between
// payment and webhook is usually >10s, and missing a check by 30s max is ok.
setInterval(() => { runScheduledChecksTick().catch(() => {}); }, 30_000);
// Also kick off once at boot to pick up anything missed while the process was down.
setTimeout(() => { runScheduledChecksTick().catch(() => {}); }, 5_000);

// Official pricing formula (confirmed by owner):
// 1st device: R$15 base + R$10 per extra month
// Each extra device: R$10 per month of the plan
// Must match calcPlanPrice in src/App.tsx.
function calculatePlanPrice(months: number, devices: number): number {
  const m = Math.max(1, months);
  const d = Math.max(1, devices);
  return 15 + (m - 1) * 10 + (d - 1) * 10 * m;
}

// API Routes

// 0.0.1 Group Management
app.get("/api/group/:username", async (req, res) => {
  try {
    const { username } = req.params;

    // Find if user is in a group
    const { data: groupRecord } = await getDb().from("user_groups").select("group_id").eq("username", username).maybeSingle();

    let groupId;
    if (!groupRecord) {
      // Create new group for user
      groupId = crypto.randomUUID();
      await getDb().from("user_groups").insert({ group_id: groupId, username });
      // Default plan: 1 month, 1 device, R$ 15
      await getDb().from("group_plans").insert({ group_id: groupId, plan_type: 'custom', plan_months: 1, plan_devices: 1, plan_price: 15 });
    } else {
      groupId = groupRecord.group_id;
    }

    // Get all users in group
    const { data: users } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
    const { data: plan } = await getDb().from("group_plans").select("*").eq("group_id", groupId).maybeSingle();

    res.json({
      groupId,
      users: (users || []).map(u => u.username),
      plan
    });
  } catch (error: any) {
    console.error("Error getting group:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/group/details/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const { data: groupUsers } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
    const usernames = (groupUsers || []).map(u => u.username);

    const allUsers = await fetchVpnUsers();
    const details = allUsers.filter((u: any) => usernames.includes(u.login));

    // Passwords only go out when the caller proves a trusted device belonging
    // to a member of this group (?username=&deviceId=). Otherwise strip them.
    const username = String(req.query.username || "");
    const deviceId = String(req.query.deviceId || "");
    const isMember = usernames.includes(username);
    const trusted = isMember && await isTrustedDevice(username, deviceId);

    res.json(trusted ? details : details.map(stripSenha));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/group/add", async (req, res) => {
  try {
    const { groupId, newUsername, password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "É necessário fornecer a senha do usuário existente para vinculá-lo." });
    }

    // Check if newUsername exists in VPN panel
    const users = await fetchVpnUsers();
    const userExists = users.find((u: any) => u.login === newUsername);

    if (!userExists) {
      return res.status(404).json({ error: "Usuário não encontrado no sistema" });
    }

    if (userExists.senha !== password) {
      return res.status(401).json({ error: "Senha incorreta para o aparelho existente." });
    }

    // Check if user is already in a group
    const { data: existingGroup } = await getDb().from("user_groups").select("group_id").eq("username", newUsername).maybeSingle();
    if (existingGroup && existingGroup.group_id !== groupId) {
      // Remove from old group
      await getDb().from("user_groups").delete().eq("username", newUsername);
      // If old group is empty, delete its plan
      const { data: oldGroupUsers } = await getDb().from("user_groups").select("username").eq("group_id", existingGroup.group_id);
      if (!oldGroupUsers || oldGroupUsers.length === 0) {
        await getDb().from("group_plans").delete().eq("group_id", existingGroup.group_id);
      }
    }

    // Add to new group
    await getDb().from("user_groups").upsert({ group_id: groupId, username: newUsername });

    // Automatically update plan price based on new device count
    const { data: groupUsers2 } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
    const numDevices = (groupUsers2 || []).length;
    if (numDevices >= 1) {
      const { data: currentPlan } = await getDb().from("group_plans").select("*").eq("group_id", groupId).maybeSingle();
      const months = currentPlan ? currentPlan.plan_months : 1;
      const newPrice = calculatePlanPrice(months, numDevices);
      await getDb().from("group_plans").update({ plan_type: 'custom', plan_devices: numDevices, plan_price: newPrice }).eq("group_id", groupId);
    }

    logActivity("device_linked", {
      username: newUsername,
      actor: "client",
      description: `Aparelho existente vinculado ao plano: ${newUsername} (grupo com ${numDevices} aparelho${numDevices === 1 ? "" : "s"})`,
      metadata: { groupId, newUsername, numDevices },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error adding to group:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/group/remove", async (req, res) => {
  try {
    const { groupId, usernameToRemove, username, deviceId } = req.body;

    // Only a trusted device of a group member may remove devices.
    const { data: requesterMembership } = await getDb().from("user_groups")
      .select("username").eq("group_id", groupId).eq("username", username || "").maybeSingle();
    if (!requesterMembership || !(await isTrustedDevice(username, deviceId))) {
      return res.status(403).json({ error: "Não autorizado. Verifique sua senha no aparelho antes de remover aparelhos." });
    }

    // Remove from group
    await getDb().from("user_groups").delete().eq("group_id", groupId).eq("username", usernameToRemove);

    // Automatically update plan for remaining group members
    const { data: groupUsers } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
    const { data: plan2 } = await getDb().from("group_plans").select("*").eq("group_id", groupId).maybeSingle();
    const remainingMonths = plan2 ? plan2.plan_months : 1;
    const newNumDevices = (groupUsers || []).length;
    const newGroupPrice = calculatePlanPrice(remainingMonths, newNumDevices);
    await getDb().from("group_plans").update({ plan_type: 'custom', plan_devices: newNumDevices, plan_price: newGroupPrice }).eq("group_id", groupId);

    // Create a new group for the removed user with default plan
    const newGroupId = crypto.randomUUID();
    await getDb().from("user_groups").insert({ group_id: newGroupId, username: usernameToRemove });
    await getDb().from("group_plans").insert({ group_id: newGroupId, plan_type: 'custom', plan_months: 1, plan_devices: 1, plan_price: 15 });

    logActivity("device_removed", {
      username: usernameToRemove,
      actor: "client",
      description: `Aparelho removido do plano: ${usernameToRemove} (removido por ${username})`,
      metadata: { groupId, removedBy: username },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error removing from group:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/group/plan", async (req, res) => {
  try {
    const { groupId, plan_type, plan_months, plan_devices, username, deviceId } = req.body;

    // Only a trusted device of a group member may change the plan.
    const { data: membership } = await getDb().from("user_groups")
      .select("username").eq("group_id", groupId).eq("username", username || "").maybeSingle();
    if (!membership || !(await isTrustedDevice(username, deviceId))) {
      return res.status(403).json({ error: "Não autorizado. Verifique sua senha no aparelho antes de alterar o plano." });
    }

    const months = parseInt(plan_months);
    const devices = parseInt(plan_devices);
    if (!Number.isInteger(months) || months < 1 || months > 12 || !Number.isInteger(devices) || devices < 1 || devices > 10) {
      return res.status(400).json({ error: "Plano inválido." });
    }

    // Price is ALWAYS computed server-side — never trust the browser.
    const price = calculatePlanPrice(months, devices);
    await getDb().from("group_plans").update({ plan_type, plan_months: months, plan_devices: devices, plan_price: price }).eq("group_id", groupId);

    logActivity("plan_changed", {
      username,
      actor: "client",
      description: `Plano alterado: ${months} mês(es) / ${devices} aparelho(s) — ${fmtBRL(price)}`,
      metadata: { groupId, months, devices, price },
    });

    res.json({ success: true, plan_price: price });
  } catch (error: any) {
    console.error("Error updating plan:", error);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/auth/verify", async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    if (!username || !password || !deviceId) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    const users = await fetchVpnUsers();
    const user = users.find((u: any) => u.login === username);

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    if (user.senha !== password) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    // Add to trusted devices
    await getDb().from("trusted_devices").upsert({ device_id: deviceId, username });

    logActivity("device_trusted", {
      username,
      actor: "client",
      description: `Senha confirmada — aparelho liberado para ${username}`,
      metadata: { deviceId },
    });

    res.json({ success: true, isTrusted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 0. Login / Get User Info
app.post("/api/user", async (req, res) => {
  try {
    const { username, deviceId } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Usuário é obrigatório" });
    }

    const users = await fetchVpnUsers();
    const user = users.find((u: any) => u.login === username);

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Check if device is trusted
    let isTrusted = false;
    if (deviceId) {
      const { data: trusted } = await getDb().from("trusted_devices").select("*").eq("device_id", deviceId).eq("username", username).maybeSingle();
      if (trusted) isTrusted = true;
    }

    // Get loyalty points (calculated from payment history — always in sync with history display)
    const points = await calculateLoyaltyPoints(username);

    // Get referrals
    const { data: referrals } = await getDb().from("referrals").select("*").eq("referrer_username", username).order("created_at", { ascending: false });

    // Get group ID to fetch group-wide requests
    const { data: groupRecord } = await getDb().from("user_groups").select("group_id").eq("username", username).maybeSingle();
    const groupId = groupRecord ? groupRecord.group_id : null;
    
    let groupUsernames = [username];
    if (groupId) {
      const { data: gUsers } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
      if (gUsers) groupUsernames = gUsers.map(u => u.username);
    }

    // Get group-wide active or recent refund request
    const { data: refundRequest } = await getDb().from("refund_requests").select("*").in("username", groupUsernames).order("created_at", { ascending: false }).limit(1).maybeSingle();

    // Get group-wide active change requests (only regular user types + date_correction)
    const { data: changeRequests } = await getDb().from("change_requests").select("*").in("username", groupUsernames).in("type", ["date", "username", "uuid", "uuid_correction", "password", "date_correction"]);

    // Get recent date change request (last 30 days) for the group
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDateChangeRequest } = await getDb().from("change_requests")
      .select("*")
      .in("username", groupUsernames)
      .eq("type", "date")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get last payment date to calculate 7 days (only regular user payments)
    const { data: lastPayment } = await getDb().from("payments")
      .select("created_at, paid_at")
      .eq("username", username)
      .eq("status", "approved")
      .in("type", REGULAR_PAYMENT_TYPES)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    let lastPaymentDate = null;
    if (lastPayment) {
      lastPaymentDate = lastPayment.paid_at || lastPayment.created_at;
    }

    // Get payment history (only regular user payments, exclude reseller)
    const { data: payments } = await getDb().from("payments").select("*").eq("username", username).eq("status", "approved").in("type", REGULAR_PAYMENT_TYPES).order("paid_at", { ascending: false, nullsFirst: false });

    // Whether anyone in the group already paid at least once (used to gate paid-only features)
    const { count: groupPaidCount } = await getDb().from("payments")
      .select("id", { count: "exact", head: true })
      .in("username", groupUsernames)
      .eq("status", "approved")
      .in("type", REGULAR_PAYMENT_TYPES);
    const hasGroupPaidOnce = (groupPaidCount || 0) > 0;

    // Only trusted devices (password verified at least once) receive the senha.
    const userPayload = isTrusted ? user : stripSenha(user);
    res.json({ ...userPayload, isTrusted, points, referrals, refundRequest, changeRequests, recentDateChangeRequest, lastPaymentDate, payments, hasGroupPaidOnce });
  } catch (error: any) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

// 0.0 Verify Password and Trust Device
app.post("/api/verify-password", async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    if (!username || !password || !deviceId) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    const users = await fetchVpnUsers();
    const user = users.find((u: any) => u.login === username);

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Check password
    const userPass = user.senha || user.pass || user.password;

    if (userPass !== password) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    // Trust device
    await getDb().from("trusted_devices").upsert({ device_id: deviceId, username });

    logActivity("device_trusted", {
      username,
      actor: "client",
      description: `Senha confirmada — aparelho liberado para ${username}`,
      metadata: { deviceId },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error verifying password:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

// ─── Anti-abuso do teste grátis ──────────────────────────────────────────────
// O deviceId é gerado pelo navegador e é trivialmente resetável (limpar dados
// do app). Defesas adicionais: limite por IP + CAPTCHA (Cloudflare Turnstile).

function getClientIp(req: any): string {
  const xf = String(req.headers["x-forwarded-for"] || "");
  const first = xf.split(",")[0].trim();
  return first || String(req.headers["x-real-ip"] || "") || String(req.socket?.remoteAddress || "");
}

// Verifica o token do Cloudflare Turnstile. Se TURNSTILE_SECRET_KEY não estiver
// configurada, a verificação é pulada (feature desligada até configurar).
async function verifyTurnstile(token: string | undefined, ip: string): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, reason: "not-configured" };
  if (!token) return { ok: false, reason: "missing-token" };
  try {
    const body = new URLSearchParams();
    body.append("secret", secret);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data: any = await res.json();
    return data.success ? { ok: true } : { ok: false, reason: (data["error-codes"] || []).join(",") };
  } catch (e: any) {
    // Falha de rede na Cloudflare não deve bloquear clientes legítimos.
    console.warn("[turnstile] verify error:", e?.message);
    return { ok: true, reason: "verify-unavailable" };
  }
}

// Site key pública para o frontend renderizar o widget (vazio = desligado).
app.get("/api/turnstile-config", (_req, res) => {
  res.json({ siteKey: process.env.TURNSTILE_SITE_KEY || "" });
});

// Limites de teste grátis por IP (CGNAT compartilha IP entre clientes móveis,
// então o limite não pode ser 1). Requer a coluna devices.ip — se ela ainda
// não existir, o limite é pulado sem quebrar o fluxo.
const TRIAL_IP_LIMIT_DAY = 2;
const TRIAL_IP_LIMIT_WEEK = 4;

async function checkTrialIpLimit(ip: string): Promise<{ blocked: boolean }> {
  if (!ip) return { blocked: false };
  try {
    const daySince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const weekSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: dayCount, error: e1 } = await getDb().from("devices")
      .select("device_id", { count: "exact", head: true })
      .eq("ip", ip).gte("created_at", daySince);
    if (e1) throw e1;
    if ((dayCount || 0) >= TRIAL_IP_LIMIT_DAY) return { blocked: true };
    const { count: weekCount, error: e2 } = await getDb().from("devices")
      .select("device_id", { count: "exact", head: true })
      .eq("ip", ip).gte("created_at", weekSince);
    if (e2) throw e2;
    if ((weekCount || 0) >= TRIAL_IP_LIMIT_WEEK) return { blocked: true };
    return { blocked: false };
  } catch (e: any) {
    console.warn("[trial] IP limit check skipped (coluna devices.ip existe?):", e?.message);
    return { blocked: false };
  }
}

// 0.1 Create Free User
app.post("/api/create-free", async (req, res) => {
  try {
    const { username, deviceId, referrer, turnstileToken } = req.body;

    if (!username || !deviceId) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    // Validate username: only letters and numbers, max 10 chars
    if (!/^[a-zA-Z0-9]{1,10}$/.test(username)) {
      return res.status(400).json({ error: "Usuário inválido. Use apenas letras e números, até 10 caracteres." });
    }

    const clientIp = getClientIp(req);

    // CAPTCHA (Turnstile) — bloqueia scripts automatizados
    const captcha = await verifyTurnstile(turnstileToken, clientIp);
    if (!captcha.ok) {
      console.warn(`[trial] Turnstile rejected (${captcha.reason}) ip=${clientIp} username=${username}`);
      return res.status(403).json({ error: "Verificação de segurança falhou. Recarregue a página e tente novamente." });
    }

    // Check if device already created a user
    const { data: existingDevice } = await getDb().from("devices").select("*").eq("device_id", deviceId).maybeSingle();
    if (existingDevice) {
      return res.status(403).json({ error: "Este aparelho já gerou um teste gratuito.", existing_username: existingDevice.username });
    }

    // Limite por IP — corta a burla de limpar os dados do app e gerar de novo
    const ipLimit = await checkTrialIpLimit(clientIp);
    if (ipLimit.blocked) {
      console.warn(`[trial] IP limit reached ip=${clientIp} username=${username}`);
      logActivity("trial_blocked", {
        username,
        actor: "system",
        description: `Teste grátis BLOQUEADO por limite de IP: ${username} — IP ${clientIp}`,
        metadata: { ip: clientIp, deviceId },
      });
      return res.status(429).json({ error: "Limite de testes gratuitos atingido para sua rede. Tente novamente amanhã ou fale com o suporte." });
    }

    // Check if user exists (both regular users AND resellers)
    const users = await fetchVpnUsers();

    if (Array.isArray(users)) {
      const userExists = users.find((u: any) => u.login === username);
      if (userExists) {
        return res.status(409).json({ error: "Este usuário já existe. Por favor, escolha outro." });
      }

      if (referrer) {
        const referrerExists = users.find((u: any) => u.login === referrer);
        if (!referrerExists) {
          return res.status(404).json({ error: "Usuário indicador não encontrado. Verifique e tente novamente." });
        }
      }
    }

    // Also check resellers — prevent collision with reseller usernames
    const resellers = await fetchVpnResellers();
    if (Array.isArray(resellers)) {
      const resellerExists = resellers.find((r: any) => r.login?.toLowerCase() === username.toLowerCase());
      if (resellerExists) {
        return res.status(409).json({ error: "Este usuário já existe. Por favor, escolha outro." });
      }
    }

    // Generate password
    const password = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits

    // Create user in VPN panel
    const paramsCreate = new URLSearchParams();
    paramsCreate.append("passapi", VPN_API_KEY);
    paramsCreate.append("module", "criaruser");
    paramsCreate.append("user", username);
    paramsCreate.append("pass", password);
    paramsCreate.append("validadeusuario", "2");
    paramsCreate.append("userlimite", "1");
    paramsCreate.append("whatsapp", "");

    const vpnResCreate = await fetch(VPN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: paramsCreate.toString(),
    });

    const createText = await vpnResCreate.text();
    console.log("Create user response:", createText);

    if (createText.toLowerCase().includes("<html")) {
      throw new Error("Erro de comunicação com o servidor VPN (Cloudflare/Rate Limit). Tente novamente em alguns instantes.");
    }

    // Save device (with IP for the rate limit). Fallback without ip while the
    // devices.ip column hasn't been created yet.
    {
      const { error: devErr } = await getDb().from("devices").upsert({ device_id: deviceId, username, ip: clientIp || null });
      if (devErr) {
        console.warn("[trial] devices upsert with ip failed, retrying without ip:", devErr.message);
        await getDb().from("devices").upsert({ device_id: deviceId, username });
      }
    }

    // Trust device automatically
    await getDb().from("trusted_devices").upsert({ device_id: deviceId, username });

    // Save referral if exists
    if (referrer) {
      const referralId = crypto.randomUUID();
      await getDb().from("referrals").insert({ id: referralId, referrer_username: referrer, referred_username: username });
      logActivity("referral_created", {
        username: referrer,
        actor: "client",
        description: `Indicação registrada: ${referrer} indicou ${username}`,
        metadata: { referredUsername: username },
      });
    }

    logActivity("trial_created", {
      username,
      actor: "client",
      description: `Teste grátis criado: ${username} (2 dias)${referrer ? ` — indicado por ${referrer}` : ""}${clientIp ? ` — IP ${clientIp}` : ""}`,
      metadata: { deviceId, referrer: referrer || null, ip: clientIp || null },
    });

    res.json({
      username,
      password,
      uuid: null
    });

  } catch (error: any) {
    console.error("Error creating free user:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

// 1. Check user and generate Pix
app.post("/api/pix/new-device", async (req, res) => {
  try {
    const { groupId, mainUsername, newUsername } = req.body;

    // 1. Check new username not taken by a reseller
    const resellers = await fetchVpnResellers();
    if (resellers.find((r: any) => r.login?.toLowerCase() === newUsername?.toLowerCase())) {
      return res.status(409).json({ error: "Este nome de usuário já está em uso. Escolha outro." });
    }

    // 2. Get main user expiration
    const users = await fetchVpnUsers();
    const mainUser = users.find((u: any) => u.login === mainUsername);

    if (!mainUser) {
      return res.status(404).json({ error: "Usuário principal não encontrado" });
    }

    // Calculate remaining days
    const expirationDate = parseVpnExpira(mainUser.expira);
    if (!expirationDate) {
      return res.status(400).json({ error: "Data de expiração inválida no painel VPN" });
    }
    const now = new Date();
    const diffTime = Math.max(0, expirationDate.getTime() - now.getTime());
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Check if paid on time or in advance
    const paidOnTime = now <= expirationDate;

    // Calculate price difference using the official formula (calculatePlanPrice).
    // The +R$10 of an extra device covers the WHOLE plan cycle (plan_months),
    // so proration divides by the cycle length in days, not a fixed 30.
    const { data: groupUsers } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
    const currentDevices = Math.max(1, (groupUsers || []).length);
    const { data: groupPlan } = await getDb().from("group_plans").select("plan_months").eq("group_id", groupId).maybeSingle();
    const planMonths = Math.max(1, parseInt(groupPlan?.plan_months) || 1);

    const currentPrice = calculatePlanPrice(planMonths, currentDevices);
    const newPrice = calculatePlanPrice(planMonths, currentDevices + 1);
    const priceDiff = newPrice - currentPrice; // = R$10 × meses do plano (aparelho extra), pela fórmula oficial

    const cycleDays = 30 * planMonths;
    let proratedPrice = Number(((priceDiff / cycleDays) * Math.min(remainingDays, cycleDays)).toFixed(2));

    if (proratedPrice < 0.01) {
      return res.json({ free: true, remainingDays });
    }

    // Generate PIX
    const client = getMpClient();
    const payment = new Payment(client);

    const paymentData = {
      transaction_amount: proratedPrice,
      description: `Novo Aparelho - ${newUsername} (${remainingDays} dias)`,
      payment_method_id: "pix",
      payer: {
        email: `${mainUsername}@cloudbrasil.shop`,
        first_name: mainUsername,
        last_name: "VS+",
      },
      notification_url: `${process.env.APP_URL}/api/webhook`,
    };

    const mpRes = await payment.create({ body: paymentData });

    if (!mpRes.id || !mpRes.point_of_interaction?.transaction_data?.qr_code) {
      throw new Error("Erro ao gerar Pix no Mercado Pago");
    }

    await getDb().from("payments").insert({
      id: mpRes.id.toString(),
      username: mainUsername,
      status: "pending",
      group_id: groupId,
      type: "new_device",
      metadata: { newUsername, remainingDays, groupId, amount: proratedPrice, paidOnTime }
    });
    schedulePaymentCheck(mpRes.id.toString());

    logActivity("pix_generated", {
      username: mainUsername,
      actor: "client",
      description: `PIX gerado: Novo Aparelho "${newUsername}" — ${fmtBRL(proratedPrice)} (${remainingDays} dias restantes)`,
      metadata: { paymentId: mpRes.id.toString(), type: "new_device", amount: proratedPrice, newUsername, remainingDays },
    });

    res.json({
      transactionId: mpRes.id.toString(),
      qrCodeBase64: mpRes.point_of_interaction.transaction_data.qr_code_base64,
      qrCode: mpRes.point_of_interaction.transaction_data.qr_code,
      amount: proratedPrice,
      remainingDays
    });

  } catch (error: any) {
    console.error("Error generating PIX for new device:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/group/add-free-device", async (req, res) => {
  try {
    const { groupId, mainUsername, newUsername, deviceId } = req.body;
    if (!groupId || !mainUsername || !newUsername) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    if (!/^[a-zA-Z0-9]{1,10}$/.test(newUsername)) {
      return res.status(400).json({ error: "Usuário inválido. Use apenas letras e números, até 10 caracteres." });
    }

    // The main user must actually belong to this group AND the request must
    // come from a trusted device — this endpoint creates real VPN access.
    const { data: membership } = await getDb().from("user_groups")
      .select("username").eq("group_id", groupId).eq("username", mainUsername).maybeSingle();
    if (!membership || !(await isTrustedDevice(mainUsername, deviceId))) {
      return res.status(403).json({ error: "Não autorizado. Verifique sua senha no aparelho antes de adicionar aparelhos." });
    }

    // Recompute remaining days server-side from the main user's expiry.
    // Never trust the value sent by the browser.
    const users = await fetchVpnUsers();
    const mainUser = users.find((u: any) => u.login === mainUsername);
    if (!mainUser) return res.status(404).json({ error: "Usuário principal não encontrado" });
    if (users.find((u: any) => u.login === newUsername)) {
      return res.status(409).json({ error: "Este usuário já existe. Escolha outro nome." });
    }
    const expirationDate = parseVpnExpira(mainUser.expira);
    if (!expirationDate) return res.status(400).json({ error: "Data de expiração inválida no painel VPN" });
    const remainingDays = Math.max(1, Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    // Generate random password (digits only, same pattern as paid devices)
    const password = Math.floor(100000 + Math.random() * 900000).toString();

    // Create user in VPN — module "criaruser" (user/pass/validadeusuario/userlimite)
    const createParams = new URLSearchParams();
    createParams.append("passapi", VPN_API_KEY);
    createParams.append("module", "criaruser");
    createParams.append("user", newUsername);
    createParams.append("pass", password);
    createParams.append("validadeusuario", String(remainingDays));
    createParams.append("userlimite", "1");
    createParams.append("whatsapp", "");

    // callVpnApi validates the response (HTML/Cloudflare and explicit API errors throw)
    const createResponse = await callVpnApi(createParams);
    console.log(`[add-free-device] criaruser ${newUsername} (${remainingDays}d):`, createResponse);

    // Add to group
    await getDb().from("user_groups").upsert({ group_id: groupId, username: newUsername });

    // Update plan with the official price formula (keeps the plan's months)
    const { data: groupUsers } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
    const numDevices = Math.max(1, (groupUsers || []).length);
    const { data: planRow } = await getDb().from("group_plans").select("plan_months").eq("group_id", groupId).maybeSingle();
    const months = Math.max(1, parseInt(planRow?.plan_months) || 1);
    const newPrice = calculatePlanPrice(months, numDevices);

    await getDb().from("group_plans").update({ plan_type: 'custom', plan_devices: numDevices, plan_price: newPrice }).eq("group_id", groupId);

    logActivity("free_device_added", {
      username: mainUsername,
      actor: "client",
      description: `Aparelho grátis adicionado: ${newUsername} (${remainingDays} dias, sem custo)`,
      metadata: { newUsername, remainingDays, groupId },
    });

    res.json({ success: true, password });
  } catch (error: any) {
    console.error("Error creating free device:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/pix", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Usuário é obrigatório" });
    }

    // Check if user exists in VPN Panel
    const users = await fetchVpnUsers();
    const userExists = users.find((u: any) => u.login === username);

    if (!userExists) {
      return res.status(404).json({ error: "Usuário não encontrado no painel" });
    }

    // Get group and plan
    const { data: groupRecord } = await getDb().from("user_groups").select("group_id").eq("username", username).maybeSingle();
    if (!groupRecord) {
      return res.status(404).json({ error: "Grupo não encontrado" });
    }
    const { data: plan } = await getDb().from("group_plans").select("*").eq("group_id", groupRecord.group_id).maybeSingle();
    if (!plan) {
      return res.status(404).json({ error: "Plano não encontrado" });
    }

    // Check loyalty points (calculated from payment history)
    const points = await calculateLoyaltyPoints(username);

    let transactionAmount = plan.plan_price;
    let discountApplied = false;

    if (points >= 3) {
      transactionAmount = Number((transactionAmount * 0.8).toFixed(2)); // 20% discount
      discountApplied = true;
    }

    // Check if paying on time or in advance
    let paidOnTime = false;
    const expirationDate = parseVpnExpira(userExists.expira);
    if (expirationDate) {
      paidOnTime = new Date() <= expirationDate;
    } else if (userExists.expira) {
      console.warn(`[pix] Invalid expira format for ${username}:`, userExists.expira);
    }

    // Generate Pix via Mercado Pago
    const client = getMpClient();
    const payment = new Payment(client);

    const paymentData = {
      transaction_amount: transactionAmount,
      description: `Renovação VPN - Grupo ${groupRecord.group_id.substring(0, 8)}${discountApplied ? ' (Desconto Fidelidade)' : ''}`,
      payment_method_id: "pix",
      payer: {
        email: `${username}@cloudbrasil.shop`,
        first_name: username,
        last_name: "VS+",
      },
      notification_url: `${process.env.APP_URL}/api/webhook`,
    };

    const mpRes = await payment.create({ body: paymentData });

    if (!mpRes.id || !mpRes.point_of_interaction?.transaction_data?.qr_code) {
      throw new Error("Erro ao gerar Pix no Mercado Pago");
    }

    const mdata = { discountApplied, paidOnTime, amount: transactionAmount };
    await getDb().from("payments").insert({
      id: mpRes.id.toString(),
      username,
      status: "pending",
      group_id: groupRecord.group_id,
      type: "renewal",
      metadata: mdata
    });
    schedulePaymentCheck(mpRes.id.toString());

    logActivity("pix_generated", {
      username,
      actor: "client",
      description: `PIX gerado: Renovação — ${fmtBRL(transactionAmount)}${discountApplied ? " (desconto fidelidade)" : ""}`,
      metadata: { paymentId: mpRes.id.toString(), type: "renewal", amount: transactionAmount, discountApplied },
    });

    res.json({
      paymentId: mpRes.id.toString(),
      qrCodeBase64: mpRes.point_of_interaction.transaction_data.qr_code_base64,
      qrCode: mpRes.point_of_interaction.transaction_data.qr_code,
      amount: transactionAmount,
      discountApplied
    });
  } catch (error: any) {
    console.error("Error generating Pix:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

// 2. Check payment status
app.get("/api/status/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    const { data: paymentRecord } = await getDb().from("payments").select("*").eq("id", paymentId).maybeSingle();

    if (!paymentRecord) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    // If already approved in our DB, just return
    if (paymentRecord.status === "approved") {
      return res.json({ status: "approved" });
    }

    // Check Mercado Pago
    const client = getMpClient();
    const payment = new Payment(client);
    const mpRes = await payment.get({ id: paymentId });

    if (mpRes.status === "approved") {
      await approvePayment(paymentRecord);
      return res.json({ status: "approved" });
    }

    res.json({ status: mpRes.status });
  } catch (error: any) {
    console.error("Error checking status:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

// Verify Mercado Pago webhook HMAC signature.
// MP signs the template `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` with
// HMAC-SHA256(MP_WEBHOOK_SECRET). The signature arrives in the x-signature
// header as `ts=<ts>,v1=<hex>`. If no secret is configured (dev mode), we log
// a warning and accept — production must set MP_WEBHOOK_SECRET.
function verifyMpSignature(req: any, dataId: string): { ok: boolean; reason?: string } {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[webhook] MP_WEBHOOK_SECRET not set — skipping HMAC validation (development mode only)");
    return { ok: true, reason: "no-secret-configured" };
  }
  const sigHeader = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  if (!sigHeader || !requestId) return { ok: false, reason: "missing-headers" };

  const parts: Record<string, string> = {};
  for (const piece of sigHeader.split(",")) {
    const [k, v] = piece.trim().split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { ok: false, reason: "malformed-signature" };

  // Reject signatures older than 5 minutes to prevent replay attacks.
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    return { ok: false, reason: "stale-timestamp" };
  }

  const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(template).digest("hex");
  try {
    const match = crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
    return match ? { ok: true } : { ok: false, reason: "signature-mismatch" };
  } catch {
    return { ok: false, reason: "signature-length-mismatch" };
  }
}

// 3. Webhook for Mercado Pago
app.post("/api/webhook", async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === "payment" && data?.id) {
      const paymentId = data.id.toString();

      // HMAC validation — reject unsigned/forged requests before touching anything.
      const sig = verifyMpSignature(req, paymentId);
      if (!sig.ok) {
        console.warn(`[webhook] rejected: ${sig.reason} (paymentId=${paymentId})`);
        return res.status(401).send("Invalid signature");
      }

      const { data: paymentRecord } = await getDb().from("payments").select("*").eq("id", paymentId).maybeSingle();

      if (paymentRecord && paymentRecord.status !== "approved") {
        const client = getMpClient();
        const payment = new Payment(client);
        const mpRes = await payment.get({ id: paymentId });

        if (mpRes.status === "approved") {
          await approvePayment(paymentRecord);
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Error");
  }
});

// ─── Reprocess pending/cancelled payments that were actually paid in MP ───────
// Checks both "pending" and "cancelled" payments against Mercado Pago
app.post("/api/admin/payments/reprocess-cancelled", requireAdminAuth, async (_req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await getDb()
      .from("payments")
      .select("*")
      .in("status", ["pending", "cancelled"])
      .gte("created_at", since);

    if (!stale || stale.length === 0) {
      return res.json({ recovered: 0, message: "Nenhum pagamento pendente ou cancelado nos últimos 7 dias." });
    }

    const client = getMpClient();
    const paymentApi = new Payment(client);
    let recovered = 0;

    for (const p of stale) {
      try {
        const mpRes = await paymentApi.get({ id: p.id });
        if (mpRes.status === "approved") {
          await approvePayment(p);
          recovered++;
          console.log(`[reprocess] Recovered payment ${p.id} for ${p.username} (was: ${p.status})`);
          logActivity("payment_recovered", {
            username: p.username,
            actor: "admin",
            description: `Pagamento recuperado manualmente pelo admin: ${logPaymentTypeLabel(p.type)} (estava "${p.status}")`,
            metadata: { paymentId: p.id, previousStatus: p.status },
          });
        }
      } catch (e) {
        console.warn(`[reprocess] Failed to check payment ${p.id}:`, e);
      }
    }

    res.json({ recovered, checked: stale.length, message: `${recovered} pagamento(s) recuperado(s) de ${stale.length} verificados.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Retry failed VPN applications ───────────────────────────────────────────
// For every approved payment with at least one failed/missing attempt, re-run
// approvePayment. applyVpnOperation + countSuccessfulAttempts make this safe:
// operations that already succeeded are skipped.
// Tipos criados pelo fluxo PIX e aprovados via approvePayment — os únicos que
// recebem o carimbo vpnApplied no fim do processamento. Inserções manuais
// (reseller_setup/adjustment) nunca passam por lá e ficam fora da varredura.
const VPN_SWEEP_TYPES = ["renewal", "new_device", "reseller_hire", "reseller_renewal"];

// Pagamentos meio-aplicados que o admin já corrigiu MANUALMENTE no painel antes
// desta varredura existir — nunca reaplicar (dobraria a renovação).
const MANUALLY_FIXED_PAYMENT_IDS = new Set([
  "175345024484", // Rodrigo27/28 — Rodrigo28 renovado manualmente em 25/08/2026
]);

async function retryFailedApplications(opts: { sincePaymentId?: string } = {}): Promise<{ retried: number; succeeded: number; stillFailed: number }> {
  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Approved payments where the last known state flagged VPN as not applied.
  let q = db.from("payments").select("*").eq("status", "approved").gte("paid_at", since);
  if (opts.sincePaymentId) q = q.eq("id", opts.sincePaymentId);
  const { data: candidates } = await q;

  let retried = 0, succeeded = 0, stillFailed = 0;
  for (const p of candidates || []) {
    const meta = parseMetadata(p.metadata);
    // Retry those explicitly flagged as not-applied, OR where we can see from
    // payment_attempts that something failed, OR where the processing died
    // mid-flight: a execução serverless é derrubada entre as operações no
    // painel e vpnApplied nunca é escrito (fica undefined) — foi o caso do
    // pagamento 175345024484 (grupo de 2, só o 1º renovado, sem nenhum erro
    // registrado). Grace de 15 min para não competir com um processamento vivo.
    const { data: fails } = await db.from("payment_attempts")
      .select("id").eq("payment_id", p.id).eq("status", "failed");
    const hasFails = (fails?.length || 0) > 0;
    const flaggedNotApplied = meta.vpnApplied === false || meta.vpnRenewFailed === true;
    const paidAtMs = Date.parse(p.paid_at || p.created_at || "");
    const diedMidFlight = meta.vpnApplied === undefined
      && VPN_SWEEP_TYPES.includes(p.type)
      && !MANUALLY_FIXED_PAYMENT_IDS.has(p.id)
      && Number.isFinite(paidAtMs)
      && Date.now() - paidAtMs > 15 * 60 * 1000;
    if (!hasFails && !flaggedNotApplied && !diedMidFlight) continue;

    retried++;
    try {
      // Dedicated re-application path (skips the payment status update).
      // skipPendingTargets: alvos com tentativa "pending" órfã podem já ter
      // sido aplicados no painel — não reaplicar às cegas, avisar o admin.
      const { uncertainTargets } = await reapplyPaymentVpnOperations(p, { skipPendingTargets: true });
      // Check if it's now fully applied.
      const { data: stillFails } = await db.from("payment_attempts")
        .select("id").eq("payment_id", p.id).eq("status", "failed");
      if ((stillFails?.length || 0) === 0 && uncertainTargets.length === 0) {
        succeeded++;
        await db.from("payments")
          .update({ metadata: { ...meta, vpnApplied: true, vpnRenewFailed: false } })
          .eq("id", p.id);
      } else {
        stillFailed++;
        if (uncertainTargets.length > 0 && meta.vpnNeedsManualCheck !== true) {
          await db.from("payments")
            .update({ metadata: { ...meta, vpnNeedsManualCheck: true } })
            .eq("id", p.id);
          sendPush("__admin__", "⚠️ Renovação precisa de conferência manual",
            `Pagamento de ${p.username}: não dá para confirmar se a renovação de ${uncertainTargets.join(", ")} chegou ao painel (chamada interrompida no meio). Confira o vencimento no painel; se faltar, use o reprocessar do pagamento ${p.id}.`);
          logActivity("payment_vpn_manual_check", {
            username: p.username,
            actor: "system",
            description: `Renovação de ${uncertainTargets.join(", ")} interrompida no meio da chamada ao painel — conferir vencimento manualmente (pagamento ${p.id})`,
            metadata: { paymentId: p.id, uncertainTargets },
          });
        }
      }
    } catch (e: any) {
      stillFailed++;
      console.error(`[retry] ${p.id}:`, e?.message);
    }
  }
  return { retried, succeeded, stillFailed };
}

// Re-runs just the VPN application phase for an already-approved payment.
// Safe to call repeatedly — applyVpnOperation + countSuccessfulAttempts skip
// operations that already succeeded for this payment.
// skipPendingTargets (varredura automática): alvos com tentativa "pending"
// órfã são pulados e devolvidos em uncertainTargets — a chamada original pode
// ter aplicado no painel antes de a execução morrer, e reaplicar dobraria.
// O retry manual do admin NÃO passa a opção: ele vê o painel e decide.
async function reapplyPaymentVpnOperations(
  paymentRecord: any,
  opts: { skipPendingTargets?: boolean } = {}
): Promise<{ uncertainTargets: string[] }> {
  const paymentId = paymentRecord.id;
  const db = getDb();
  const metadata = parseMetadata(paymentRecord.metadata);
  const uncertainTargets: string[] = [];

  if (paymentRecord.type === "reseller_hire") {
    const { resellerUsername: newRev, resellerPassword: newRevPass, resellerWhatsapp, resellerLogins, resellerMonths } = metadata;
    if (!newRev) return { uncertainTargets };
    const createDone = await countSuccessfulAttempts(paymentId, "createrev", newRev);
    if (createDone === 0 && newRevPass) {
      const extra: Record<string, string> = { pass: newRevPass, userlimite: String(resellerLogins || 10) };
      if (resellerWhatsapp) extra.whatsapp = resellerWhatsapp;
      await applyVpnOperation({ paymentId, module: "createrev", targetUsername: newRev, extraParams: extra });
    }
    const months = Math.max(1, Math.min(12, Number(resellerMonths) || 1));
    const already = await countSuccessfulAttempts(paymentId, "renewrev", newRev);
    for (let i = already; i < months; i++) {
      const r = await applyVpnOperation({ paymentId, module: "renewrev", targetUsername: newRev });
      if (!r.success) break;
    }
    await upsertResellerPlan(newRev);

  } else if (paymentRecord.type === "reseller_renewal") {
    const resellerUser = metadata.resellerUsername || paymentRecord.username;
    const months = Math.max(1, Math.min(12, Number(metadata.resellerMonths) || 1));
    const already = await countSuccessfulAttempts(paymentId, "renewrev", resellerUser);
    if (already < months && opts.skipPendingTargets && await hasPendingAttempt(paymentId, "renewrev", resellerUser)) {
      uncertainTargets.push(resellerUser);
    } else {
      for (let i = already; i < months; i++) {
        const r = await applyVpnOperation({ paymentId, module: "renewrev", targetUsername: resellerUser });
        if (!r.success) break;
      }
    }
    await upsertResellerPlan(resellerUser);

  } else if (paymentRecord.type === "new_device") {
    const { newUsername, remainingDays } = metadata;
    if (newUsername && remainingDays) {
      const done = await countSuccessfulAttempts(paymentId, "criaruser", newUsername);
      if (done === 0) {
        if (opts.skipPendingTargets && await hasPendingAttempt(paymentId, "criaruser", newUsername)) {
          uncertainTargets.push(newUsername);
        } else {
          const password = Math.floor(100000 + Math.random() * 900000).toString();
          await applyVpnOperation({
            paymentId, module: "criaruser", targetUsername: newUsername,
            extraParams: { pass: password, validadeusuario: String(remainingDays), userlimite: "1", whatsapp: "" },
          });
        }
      }
    }

  } else if (paymentRecord.type === "renewal") {
    const groupId = paymentRecord.group_id;
    let usersToRenew = [paymentRecord.username];
    let monthsToRenew = 1;
    if (groupId) {
      const { data: plan } = await db.from("group_plans").select("*").eq("group_id", groupId).maybeSingle();
      if (plan) monthsToRenew = (plan as any).plan_months;
      const { data: groupUsers } = await db.from("user_groups").select("username").eq("group_id", groupId);
      if (groupUsers && groupUsers.length > 0) {
        // Pagante primeiro — mesmo critério do approvePayment
        usersToRenew = groupUsers
          .map((u: any) => u.username)
          .sort((a: string, b: string) => (a === paymentRecord.username ? -1 : b === paymentRecord.username ? 1 : 0));
      }
    }
    for (const user of usersToRenew) {
      const already = await countSuccessfulAttempts(paymentId, "renewuser", user);
      if (already >= monthsToRenew) continue;
      if (opts.skipPendingTargets && await hasPendingAttempt(paymentId, "renewuser", user)) {
        uncertainTargets.push(user);
        continue;
      }
      for (let i = already; i < monthsToRenew; i++) {
        const r = await applyVpnOperation({ paymentId, module: "renewuser", targetUsername: user });
        if (!r.success) break;
      }
    }
  }

  return { uncertainTargets };
}

app.post("/api/admin/payments/retry-failed", requireAdminAuth, async (_req, res) => {
  try {
    const result = await retryFailedApplications();
    res.json({ ...result, message: `${result.succeeded}/${result.retried} reaplicado(s) com sucesso.` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/payments/:paymentId/retry", requireAdminAuth, async (req, res) => {
  try {
    const { data: p } = await getDb().from("payments").select("*").eq("id", req.params.paymentId).maybeSingle();
    if (!p) return res.status(404).json({ error: "Pagamento não encontrado" });
    if (p.status !== "approved") return res.status(400).json({ error: "Pagamento não está aprovado" });
    await reapplyPaymentVpnOperations(p);
    const { data: stillFails } = await getDb().from("payment_attempts")
      .select("id").eq("payment_id", p.id).eq("status", "failed");
    const ok = (stillFails?.length || 0) === 0;
    const meta = parseMetadata(p.metadata);
    if (ok) {
      await getDb().from("payments")
        .update({ metadata: { ...meta, vpnApplied: true, vpnRenewFailed: false } })
        .eq("id", p.id);
    }
    res.json({ success: ok, message: ok ? "Reaplicação concluída." : "Ainda há falhas — tente novamente em alguns minutos." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/payments/:paymentId/attempts", requireAdminAuth, async (req, res) => {
  try {
    const { data } = await getDb()
      .from("payment_attempts")
      .select("*")
      .eq("payment_id", req.params.paymentId)
      .order("created_at", { ascending: true });
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Periodic retry worker: every 15 min sweep for unapplied payments from the
// last 24h. Admin notifications still fire on initial failure.
setInterval(() => {
  retryFailedApplications().then(r => {
    if (r.retried > 0) console.log(`[retry-worker] retried=${r.retried} succeeded=${r.succeeded} stillFailed=${r.stillFailed}`);
  }).catch(e => console.error("[retry-worker] error:", e));
}, 15 * 60 * 1000);

// 3.5 Tickets API
app.get("/api/tickets/:username", async (req, res) => {
  try {
    const { data: tickets } = await getDb().from("tickets").select("*").eq("username", req.params.username).order("created_at", { ascending: false });
    res.json(tickets || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/tickets", async (req, res) => {
  try {
    const { data: allTickets } = await getDb().from("tickets").select("*").order("created_at", { ascending: false });
    res.json(allTickets || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Refund and Date Change Requests
app.post("/api/refund", async (req, res) => {
  try {
    const { username, pixType, pixKey } = req.body;
    const id = crypto.randomUUID();

    // Check if already requested
    const { data: existing } = await getDb().from("refund_requests").select("*").eq("username", username).eq("status", "aguardando").maybeSingle();
    if (existing) {
      return res.status(400).json({ error: "Já existe uma solicitação de reembolso em andamento." });
    }

    await getDb().from("refund_requests").insert({ id, username, pix_type: pixType, pix_key: pixKey });

    logActivity("refund_requested", {
      username,
      actor: "client",
      description: `Reembolso solicitado (PIX ${pixType})`,
      metadata: { refundId: id, pixType },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/user/update-access", async (req, res) => {
  try {
    const { username, action, newValue } = req.body;

    if (!['username', 'password', 'date', 'uuid', 'uuid_correction'].includes(action)) {
      return res.status(400).json({ error: "Ação inválida" });
    }
    if (!newValue && action !== 'uuid' && action !== 'uuid_correction') {
      return res.status(400).json({ error: "Novo valor inválido" });
    }

    const users = await fetchVpnUsers();
    const userExists = users.find((u: any) => u.login === username);
    if (!userExists) {
      return res.status(404).json({ error: "Usuário não encontrado no painel" });
    }

    // Block all change requests for expired users
    if (userExists.expira) {
      const expiryDate = new Date(userExists.expira.replace(' ', 'T'));
      if (expiryDate < new Date()) {
        return res.status(400).json({ error: "Seu acesso está expirado. Renove seu plano para fazer solicitações." });
      }
    }

    // Check if there is already a pending request of this type
    const { data: existingRequest } = await getDb().from("change_requests").select("*").eq("username", username).eq("type", action).eq("status", "aguardando").maybeSingle();
    if (existingRequest) {
      return res.status(400).json({ error: "Você já tem uma solicitação pendente para esta alteração." });
    }

    if (action === 'date') {
      // Block clients still on free trial (never paid) from changing the expiration date.
      const { data: groupRecord } = await getDb().from("user_groups").select("group_id").eq("username", username).maybeSingle();
      let groupUsernames = [username];
      if (groupRecord?.group_id) {
        const { data: gUsers } = await getDb().from("user_groups").select("username").eq("group_id", groupRecord.group_id);
        if (gUsers) groupUsernames = gUsers.map((u: any) => u.username);
      }
      const { count: paidCount } = await getDb().from("payments")
        .select("id", { count: "exact", head: true })
        .in("username", groupUsernames)
        .eq("status", "approved")
        .in("type", REGULAR_PAYMENT_TYPES);
      if (!paidCount || paidCount === 0) {
        return res.status(400).json({ error: "Alteração de vencimento disponível apenas para clientes que já realizaram pelo menos um pagamento." });
      }

      const expirationDate = new Date(userExists.expira.replace(' ', 'T'));
      const now = new Date();
      const newDateObj = new Date(newValue + "T23:59:59");

      const diffFromCurrent = Math.abs(newDateObj.getTime() - expirationDate.getTime());
      const diffDaysFromCurrent = Math.ceil(diffFromCurrent / (1000 * 60 * 60 * 24));

      if (diffDaysFromCurrent > 7) {
        return res.status(400).json({ error: "A nova data não pode ter mais de 7 dias de diferença da data atual." });
      }

      const { data: lastChange } = await getDb().from("change_requests").select("created_at").eq("username", username).eq("type", "date").eq("status", "aprovado").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lastChange) {
        const lastChangeDate = new Date(lastChange.created_at);
        const daysSinceLastChange = Math.ceil((now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceLastChange < 30) {
          return res.status(400).json({ error: "Você só pode alterar a data uma vez a cada 30 dias." });
        }
      }
    }

    const id = crypto.randomUUID();
    await getDb().from("change_requests").insert({ id, username, type: action, requested_value: newValue, status: 'aguardando' });

    const actionLabels: Record<string, string> = { username: "alteração de usuário", password: "alteração de senha", date: "alteração de vencimento", uuid: "solicitação de UUID", uuid_correction: "correção de UUID" };
    logActivity("change_request_created", {
      username,
      actor: "client",
      description: `Solicitação criada: ${actionLabels[action] || action}${newValue ? ` → ${newValue}` : ""}`,
      metadata: { type: action, requestedValue: newValue || null, requestId: id },
    });

    if (action === 'uuid_correction') {
      sendPush("__admin__", "🔧 Correção de UUID solicitada", `${username} reportou que o UUID atual não está funcionando. Gere um novo UUID no painel da VPN.`);
    }

    res.json({ success: true, message: "Solicitação enviada com sucesso. Aguarde a aprovação do administrador." });
  } catch (error: any) {
    console.error("Error requesting access update:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel change request
app.delete("/api/user/change-requests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await getDb().from("change_requests").delete().eq("id", id).eq("status", "aguardando");
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel refund request
app.delete("/api/user/refunds/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await getDb().from("refund_requests").delete().eq("id", id).eq("status", "aguardando");
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoints for requests
app.get("/api/admin/payments", async (req, res) => {
  try {
    const { data: payments } = await getDb().from("payments").select("*").order("created_at", { ascending: false });
    const list = payments || [];

    // Bulk-annotate each payment with VPN application status derived from payment_attempts.
    // "applied" = at least one success, no failures.
    // "failed"  = at least one failure (even if some succeeded — admin should see mixed state).
    // "pending" = attempt exists but neither success nor failure yet.
    // "none"    = no attempts at all (legacy payments, adjustments, setups, etc.).
    const ids = list.map((p: any) => p.id);
    const { data: allAttempts } = ids.length
      ? await getDb().from("payment_attempts").select("payment_id, status, module").in("payment_id", ids)
      : { data: [] as any[] };

    const byPayment: Record<string, { success: number; failed: number; pending: number }> = {};
    for (const a of allAttempts || []) {
      const b = byPayment[a.payment_id] || (byPayment[a.payment_id] = { success: 0, failed: 0, pending: 0 });
      if (a.status === "success") b.success++;
      else if (a.status === "failed") b.failed++;
      else b.pending++;
    }

    const annotated = list.map((p: any) => {
      const b = byPayment[p.id];
      let vpnApplicationStatus: "applied" | "failed" | "pending" | "none" = "none";
      if (b) {
        if (b.failed > 0) vpnApplicationStatus = "failed";
        else if (b.success > 0) vpnApplicationStatus = "applied";
        else vpnApplicationStatus = "pending";
      }
      return {
        ...p,
        vpnApplicationStatus,
        vpnAttemptCounts: b || { success: 0, failed: 0, pending: 0 },
      };
    });

    res.json(annotated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/refunds", async (req, res) => {
  try {
    const { data: refunds } = await getDb().from("refund_requests").select("*").order("created_at", { ascending: false });
    res.json(refunds || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/refunds/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { refundedAt } = req.body;

    // Get username to deduct 1 loyalty point on refund
    const { data: refund } = await getDb().from("refund_requests").select("username").eq("id", id).maybeSingle();
    if (refund) {
      const { data: lp } = await getDb().from("loyalty_points").select("points").eq("username", refund.username).maybeSingle();
      if (lp) {
        const newPoints = Math.max(0, lp.points - 1);
        await getDb().from("loyalty_points").update({ points: newPoints, updated_at: new Date().toISOString() }).eq("username", refund.username);
      }
    }

    await getDb().from("refund_requests").update({
      status: 'realizado',
      refunded_at: refundedAt || new Date().toISOString()
    }).eq("id", id);

    if (refund) {
      sendPush(refund.username, "Reembolso aprovado! ✅", "Seu reembolso foi processado com sucesso.");
      logActivity("refund_approved", {
        username: refund.username,
        actor: "admin",
        description: `Reembolso realizado para ${refund.username}`,
        metadata: { refundId: id },
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/refunds/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: refund } = await getDb().from("refund_requests").select("username").eq("id", id).maybeSingle();
    await getDb().from("refund_requests").update({ status: 'rejeitado' }).eq("id", id);
    if (refund) {
      sendPush(refund.username, "Reembolso recusado", "Sua solicitação de reembolso foi negada.");
      logActivity("refund_rejected", {
        username: refund.username,
        actor: "admin",
        description: `Reembolso rejeitado para ${refund.username}`,
        metadata: { refundId: id },
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/change-requests", async (req, res) => {
  try {
    const { data: requests } = await getDb().from("change_requests").select("*").order("created_at", { ascending: false });
    res.json(requests || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/change-requests/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedValue } = req.body;

    const { data: request } = await getDb().from("change_requests").select("*").eq("id", id).maybeSingle();
    if (!request) {
      return res.status(404).json({ error: "Solicitação não encontrada" });
    }

    const finalValue = approvedValue || request.requested_value;

    if (request.type === 'username') {
      const oldUsername = request.username;
      const newUsername = finalValue;

      // In Supabase/Postgres we should ideally use a stored procedure for bulk updates if needed,
      // but for simplicity we'll do consecutive calls here.
      const tables = [
        "payments", "devices", "tickets", "ticket_messages", 
        "loyalty_points", "referrals", "trusted_devices", 
        "user_groups", "refund_requests", "change_requests"
      ];
      
      for (const table of tables) {
        const col = table === "referrals" ? "referrer_username" : (table === "ticket_messages" ? "sender" : "username");
        await getDb().from(table).update({ [col]: newUsername }).eq(col, oldUsername);
        
        if (table === "referrals") {
           await getDb().from(table).update({ referred_username: newUsername }).eq("referred_username", oldUsername);
        }
      }
    }

    await getDb().from("change_requests").update({ status: 'aprovado', approved_value: finalValue }).eq("id", id);
    sendPush(request.username, "Solicitação aprovada! ✅", "Sua solicitação foi aprovada com sucesso.");
    logActivity("change_request_approved", {
      username: request.type === 'username' ? finalValue : request.username,
      actor: "admin",
      description: `Solicitação aprovada (${request.type}): ${request.username}${finalValue ? ` → ${finalValue}` : ""}`,
      metadata: { type: request.type, requestId: id, approvedValue: finalValue || null },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/change-requests/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { data: request } = await getDb().from("change_requests").select("username, type").eq("id", id).maybeSingle();
    await getDb().from("change_requests").update({ status: 'rejeitado', approved_value: reason || null }).eq("id", id);
    if (request) {
      sendPush(request.username, "Solicitação recusada", reason ? `Motivo: ${reason}` : "Sua solicitação foi recusada.");
      logActivity("change_request_rejected", {
        username: request.username,
        actor: "admin",
        description: `Solicitação rejeitada (${request.type})${reason ? ` — motivo: ${reason}` : ""}`,
        metadata: { type: request.type, requestId: id, reason: reason || null },
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all VPN panel users (light projection) — powers the browsable client
// list in the admin. senha is included: this route is admin-token protected.
app.get("/api/admin/users", async (_req, res) => {
  try {
    const users = await fetchVpnUsers();
    res.json(users.map((u: any) => ({
      login: u.login,
      senha: u.senha ?? null,
      expira: u.expira ?? null,
      status: u.status ?? null,
      limite: u.limite ?? null,
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Activity Logs (guia "Logs" do admin) ────────────────────────────────────
// Filtros: types (lista separada por vírgula), username (busca parcial),
// actor, from/to (YYYY-MM-DD, horário de Brasília), limit/offset (paginação).
app.get("/api/admin/logs", async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit)) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset)) || 0);

    let q = getDb()
      .from("activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const types = String(req.query.types || "").split(",").map(s => s.trim()).filter(Boolean);
    if (types.length) q = q.in("event_type", types);

    const username = String(req.query.username || "").trim();
    if (username) q = q.ilike("username", `%${username}%`);

    const actor = String(req.query.actor || "").trim();
    if (actor) q = q.eq("actor", actor);

    const from = String(req.query.from || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("created_at", `${from}T00:00:00-03:00`);

    const to = String(req.query.to || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte("created_at", `${to}T23:59:59-03:00`);

    const { data, count, error } = await q;
    if (error) {
      // Tabela ainda não criada → resposta amigável em vez de 500
      if (String(error.message || "").includes("activity_logs")) {
        return res.json({ items: [], total: 0, tableMissing: true });
      }
      throw error;
    }
    res.json({ items: data || [], total: count ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Retenção: apaga logs com mais de 12 meses (roda no cron diário).
async function cleanupOldLogs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    await getDb().from("activity_logs").delete().lt("created_at", cutoff);
  } catch (e: any) {
    console.warn("[logs] cleanup error:", e?.message);
  }
}

app.get("/api/admin/users/:username/details", async (req, res) => {
  try {
    const { username } = req.params;

    // Get user from VPN panel
    const users = await fetchVpnUsers();
    const user = users.find((u: any) => u.login === username);

    // Get devices
    const { data: devices } = await getDb().from("devices").select("*").eq("username", username);

    // Get payments (separate regular from reseller to avoid confusion)
    // Check if username is a reseller
    const allResellers = await fetchVpnResellers();
    const isReseller = allResellers.some((r: any) => r.login?.toLowerCase() === username.toLowerCase());
    const paymentTypeFilter = isReseller ? RESELLER_PAYMENT_TYPES : REGULAR_PAYMENT_TYPES;
    const { data: payments } = await getDb().from("payments").select("*").eq("username", username).in("type", paymentTypeFilter).order("created_at", { ascending: false });

    // Get refunds
    const { data: refunds } = await getDb().from("refund_requests").select("*").eq("username", username).order("created_at", { ascending: false });

    // Get change requests (separate by user type)
    const changeRequestTypes = isReseller
      ? ["reseller_password", "reseller_logins_decrease", "reseller_logins_increase"]
      : ["date", "username", "uuid", "password", "date_correction"];
    const { data: changeRequests } = await getDb().from("change_requests").select("*").eq("username", username).in("type", changeRequestTypes).order("created_at", { ascending: false });

    // Get plan info + all group members (with full panel data: senha/expira/status)
    const { data: group } = await getDb().from("user_groups").select("*").eq("username", username).maybeSingle();
    let plan = null;
    let groupMembers: any[] = [];
    if (group) {
      const { data: p } = await getDb().from("group_plans").select("*").eq("group_id", group.group_id).maybeSingle();
      plan = p;
      const { data: gm } = await getDb().from("user_groups").select("username").eq("group_id", group.group_id);
      if (gm && gm.length > 1) {
        // Reuse the userget response fetched above — no second panel call.
        groupMembers = (gm || [])
          .filter(m => m.username !== username)
          .map(m => ({ username: m.username, ...users.find((u: any) => u.login === m.username) }));
      }
    }

    // Get loyalty points (calculated from payment history — always in sync with history display)
    const points = await calculateLoyaltyPoints(username);

    // Get referrals
    const { data: referrals } = await getDb().from("referrals").select("*").eq("referrer_username", username).order("created_at", { ascending: false });

    // Tickets do cliente — a ficha de suporte mostra o histórico completo
    const { data: tickets } = await getDb().from("tickets").select("*").eq("username", username).order("created_at", { ascending: false }).limit(20);

    res.json({
      user,
      groupId: group?.group_id || null,
      devices: devices || [],
      payments: payments || [],
      refunds: refunds || [],
      changeRequests: changeRequests || [],
      plan,
      points,
      referrals: referrals || [],
      groupMembers,
      tickets: tickets || [],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/reports", async (req, res) => {
  try {
    const period = parseInt(req.query.period as string) || 30;
    const sinceDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

    const dates: string[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    // Get payments and devices
    const { data: payments } = await getDb().from("payments").select("*").eq("status", "approved").gte("created_at", sinceDate);
    const { data: devices } = await getDb().from("devices").select("*").gte("created_at", sinceDate);

    let totalRevenue = 0;
    let totalSales = 0;
    const totalTests = (devices || []).length;

    const salesByDate: Record<string, { count: number, revenue: number }> = {};
    const testsByDate: Record<string, number> = {};

    dates.forEach(d => {
      salesByDate[d] = { count: 0, revenue: 0 };
      testsByDate[d] = 0;
    });

    (payments || []).forEach(p => {
      const metadata = p.metadata
        ? (typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata)
        : {};
      const amount = Number(metadata.amount) || Number(p.amount) || 0;

      // Exclude zero-value adjustments from sales metrics
      if (amount === 0) return;

      totalRevenue += amount;
      totalSales++;

      const dateStr = (p.paid_at || p.created_at).split('T')[0];
      if (salesByDate[dateStr]) {
        salesByDate[dateStr].count++;
        salesByDate[dateStr].revenue += amount;
      }
    });

    (devices || []).forEach(u => {
      const dateStr = u.created_at.split('T')[0];
      if (testsByDate[dateStr] !== undefined) {
        testsByDate[dateStr]++;
      }
    });

    // A conversion = test user (in devices table) who made at least one approved payment
    const testUsernames = new Set((devices || []).map((d: any) => d.username));
    const convertedUsers = new Set((payments || [])
      .filter(p => testUsernames.has(p.username))
      .map(p => p.username)
    );
    const totalConverted = convertedUsers.size;

    const conversionRate = totalTests > 0 ? ((totalConverted / totalTests) * 100).toFixed(1) : "0.0";

    // Helper: extract amount from a payment row
    const getAmount = (p: any): number => {
      const meta = p.metadata
        ? (typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata)
        : {};
      return Number(meta?.amount) || Number(p.amount) || 0;
    };

    // Only count payments with real value for top users / by type
    const paidPayments = (payments || []).filter((p: any) => getAmount(p) > 0);

    // Top users by revenue
    const userRevenue: Record<string, { revenue: number; sales: number }> = {};
    paidPayments.forEach((p: any) => {
      if (!userRevenue[p.username]) userRevenue[p.username] = { revenue: 0, sales: 0 };
      const amount = getAmount(p);
      userRevenue[p.username].revenue += amount;
      userRevenue[p.username].sales++;
    });
    const topUsers = Object.entries(userRevenue)
      .map(([username, data]) => ({ username, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // By type breakdown (only paid)
    const byTypeMap: Record<string, { count: number; revenue: number }> = {};
    paidPayments.forEach((p: any) => {
      const type = p.type || 'unknown';
      if (!byTypeMap[type]) byTypeMap[type] = { count: 0, revenue: 0 };
      byTypeMap[type].count++;
      byTypeMap[type].revenue += getAmount(p);
    });

    // Previous period for comparison (same length before current period)
    const prevSinceDate = new Date(Date.now() - 2 * period * 24 * 60 * 60 * 1000).toISOString();
    const { data: prevPayments } = await getDb().from("payments").select("*").eq("status", "approved")
      .gte("created_at", prevSinceDate).lt("created_at", sinceDate);
    const { data: prevDevices } = await getDb().from("devices").select("*")
      .gte("created_at", prevSinceDate).lt("created_at", sinceDate);
    const previousRevenue = (prevPayments || []).reduce((sum: number, p: any) => sum + getAmount(p), 0);
    const previousSales = (prevPayments || []).filter((p: any) => getAmount(p) > 0).length;
    const previousTests = (prevDevices || []).length;

    const prevDates: string[] = [];
    for (let i = 2 * period - 1; i >= period; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      prevDates.push(d.toISOString().split('T')[0]);
    }
    const prevSalesByDate: Record<string, { count: number; revenue: number }> = {};
    const prevTestsByDate: Record<string, number> = {};
    prevDates.forEach(d => {
      prevSalesByDate[d] = { count: 0, revenue: 0 };
      prevTestsByDate[d] = 0;
    });
    (prevPayments || []).forEach((p: any) => {
      const amount = getAmount(p);
      if (amount === 0) return;
      const dateStr = (p.paid_at || p.created_at).split('T')[0];
      if (prevSalesByDate[dateStr]) {
        prevSalesByDate[dateStr].count++;
        prevSalesByDate[dateStr].revenue += amount;
      }
    });
    (prevDevices || []).forEach((u: any) => {
      const dateStr = u.created_at.split('T')[0];
      if (prevTestsByDate[dateStr] !== undefined) {
        prevTestsByDate[dateStr]++;
      }
    });

    const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

    // Top plans — snapshot atual dos planos ativos (group_plans + user_groups)
    const { data: allGroupPlans } = await getDb().from("group_plans").select("plan_months, plan_devices, plan_price, group_id");
    const { data: allGroupUsers } = await getDb().from("user_groups").select("group_id");
    const groupUserCount: Record<string, number> = {};
    (allGroupUsers || []).forEach((u: any) => {
      groupUserCount[u.group_id] = (groupUserCount[u.group_id] || 0) + 1;
    });
    const planMap: Record<string, { plan_months: number; plan_devices: number; plan_price: number; groups: number; users: number }> = {};
    (allGroupPlans || []).forEach((p: any) => {
      const key = `${p.plan_months}m_${p.plan_devices}d`;
      const users = groupUserCount[p.group_id] || 1;
      if (!planMap[key]) planMap[key] = { plan_months: p.plan_months, plan_devices: p.plan_devices, plan_price: p.plan_price, groups: 0, users: 0 };
      planMap[key].groups++;
      planMap[key].users += users;
    });
    const topPlans = Object.values(planMap).sort((a, b) => b.users - a.users).slice(0, 6);

    // Top referrers — all time
    const { data: allReferrals } = await getDb().from("referrals").select("referrer_username, status");
    const referrerMap: Record<string, { total: number; converted: number }> = {};
    (allReferrals || []).forEach((r: any) => {
      if (!referrerMap[r.referrer_username]) referrerMap[r.referrer_username] = { total: 0, converted: 0 };
      referrerMap[r.referrer_username].total++;
      if (r.status === 'bonus_received') referrerMap[r.referrer_username].converted++;
    });
    const topReferrers = Object.entries(referrerMap)
      .map(([username, data]) => ({ username, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    res.json({
      totalRevenue,
      totalSales,
      totalTests,
      conversionRate,
      avgTicket,
      previousRevenue,
      previousSales,
      previousTests,
      previousSalesHistory: prevDates.map(date => ({
        date,
        count: prevSalesByDate[date].count,
        revenue: prevSalesByDate[date].revenue,
      })),
      previousTestsHistory: prevDates.map(date => ({
        date,
        count: prevTestsByDate[date],
      })),
      topUsers,
      topPlans,
      topReferrers,
      byType: Object.entries(byTypeMap).map(([type, data]) => ({ type, ...data })),
      salesHistory: Object.keys(salesByDate).sort().map(date => ({
        date,
        count: salesByDate[date].count,
        revenue: salesByDate[date].revenue
      })),
      testsHistory: Object.keys(testsByDate).sort().map(date => ({
        date,
        count: testsByDate[date]
      }))
    });
  } catch (error: any) {
    console.error("Report error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tickets", async (req, res) => {
  try {
    const { username, category, subject, message } = req.body;

    // Block ticket creation when the user already has any pending request to the admin.
    // Why: customers were requesting (e.g.) a UUID via the dedicated flow and then opening
    // a ticket asking the same thing, duplicating admin work.
    const { data: pendingChange } = await getDb()
      .from("change_requests")
      .select("id")
      .eq("username", username)
      .eq("status", "aguardando")
      .limit(1)
      .maybeSingle();
    if (pendingChange) {
      return res.status(400).json({ error: "Você possui uma solicitação pendente aguardando o administrador. Aguarde o atendimento dela antes de abrir um novo ticket." });
    }

    const { data: pendingRefund } = await getDb()
      .from("refund_requests")
      .select("id")
      .eq("username", username)
      .eq("status", "aguardando")
      .limit(1)
      .maybeSingle();
    if (pendingRefund) {
      return res.status(400).json({ error: "Você possui uma solicitação de reembolso pendente. Aguarde o atendimento dela antes de abrir um novo ticket." });
    }

    // Only one active ticket per customer at a time — anything not "closed" counts.
    const { data: openTicket } = await getDb()
      .from("tickets")
      .select("id")
      .eq("username", username)
      .neq("status", "closed")
      .limit(1)
      .maybeSingle();
    if (openTicket) {
      return res.status(400).json({ error: "Você já possui um ticket em andamento. Encerre o ticket atual antes de abrir um novo." });
    }

    const ticketId = crypto.randomUUID();
    const messageId = crypto.randomUUID();

    await getDb().from("tickets").insert({ id: ticketId, username, category, subject });
    await getDb().from("ticket_messages").insert({ id: messageId, ticket_id: ticketId, sender: "user", message });

    // Notify admin of new ticket
    sendPush("__admin__", "Novo chamado aberto", `${username}: ${subject}`, "/");

    logActivity("ticket_created", {
      username,
      actor: "client",
      description: `Ticket aberto: "${subject}" (${category})`,
      metadata: { ticketId, category, subject },
    });

    res.json({ success: true, ticketId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tickets/:username", async (req, res) => {
  try {
    const { data: tickets } = await getDb().from("tickets").select("*").eq("username", req.params.username).order("created_at", { ascending: false });
    res.json(tickets || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tickets/:id/messages", async (req, res) => {
  try {
    const { data: messages } = await getDb().from("ticket_messages").select("*").eq("ticket_id", req.params.id).order("created_at", { ascending: true });
    res.json(messages || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: does this request carry a valid admin token?
function hasAdminToken(req: any): boolean {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return !!token && validateAdminToken(token);
}

app.post("/api/tickets/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const { sender, message } = req.body;
    // Only the real admin can speak as "admin".
    if (sender === "admin" && !hasAdminToken(req)) {
      return res.status(401).json({ error: "Não autorizado." });
    }
    const messageId = crypto.randomUUID();

    await getDb().from("ticket_messages").insert({ id: messageId, ticket_id: id, sender, message });

    const status = sender === "admin" ? "answered" : "open";
    await getDb().from("tickets").update({ status }).eq("id", id);

    // Notify user when admin replies, notify admin when user replies
    if (sender === "admin") {
      const { data: ticket } = await getDb().from("tickets").select("username, subject").eq("id", id).single();
      if (ticket) {
        sendPush(ticket.username, "Nova resposta no suporte", `Seu chamado "${ticket.subject}" foi respondido.`, "/");
        logActivity("ticket_answered", {
          username: ticket.username,
          actor: "admin",
          description: `Ticket respondido pelo admin: "${ticket.subject}"`,
          metadata: { ticketId: id },
        });
      }
    } else {
      const { data: ticket } = await getDb().from("tickets").select("username, subject").eq("id", id).single();
      if (ticket) sendPush("__admin__", "Resposta em chamado", `${ticket.username}: ${ticket.subject}`, "/");
    }

    res.json({ success: true, messageId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Edit a ticket message (update text only). Admin messages require the admin token.
app.patch("/api/tickets/messages/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Mensagem inválida" });
    const { data: existing } = await getDb().from("ticket_messages").select("sender").eq("id", messageId).maybeSingle();
    if (!existing) return res.status(404).json({ error: "Mensagem não encontrada" });
    if (existing.sender === "admin" && !hasAdminToken(req)) {
      return res.status(401).json({ error: "Não autorizado." });
    }
    const { error } = await getDb().from("ticket_messages").update({ message: message.trim() }).eq("id", messageId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Hard-delete a ticket message (no trace). Admin messages require the admin token.
app.delete("/api/tickets/messages/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { data: existing } = await getDb().from("ticket_messages").select("sender").eq("id", messageId).maybeSingle();
    if (!existing) return res.status(404).json({ error: "Mensagem não encontrada" });
    if (existing.sender === "admin" && !hasAdminToken(req)) {
      return res.status(401).json({ error: "Não autorizado." });
    }
    const { error } = await getDb().from("ticket_messages").delete().eq("id", messageId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/tickets/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    // Clients may only close their own ticket; any other status change is admin-only.
    if (status !== "closed" && !hasAdminToken(req)) {
      return res.status(401).json({ error: "Não autorizado." });
    }
    await getDb().from("tickets").update({ status }).eq("id", id);

    if (status === "closed") {
      const { data: ticket } = await getDb().from("tickets").select("username, subject").eq("id", id).maybeSingle();
      if (ticket) {
        const byAdmin = hasAdminToken(req);
        logActivity("ticket_closed", {
          username: ticket.username,
          actor: byAdmin ? "admin" : "client",
          description: `Ticket fechado${byAdmin ? " pelo admin" : " pelo cliente"}: "${ticket.subject}"`,
          metadata: { ticketId: id },
        });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


app.get("/api/admin/users/:username/details/legacy", async (req, res) => {
  try {
    const { username } = req.params;
    const allUsers = await fetchVpnUsers();
    const user = allUsers.find((u: any) => u.login === username);
    const { data: groupRecord } = await getDb().from("user_groups").select("group_id").eq("username", username).maybeSingle();
    let plan = null;
    let devices = [];
    if (groupRecord) {
      const { data: p } = await getDb().from("group_plans").select("*").eq("group_id", groupRecord.group_id).maybeSingle();
      plan = p;
      const { data: dev } = await getDb().from("user_groups").select("*").eq("group_id", groupRecord.group_id).neq("username", username);
      devices = dev || [];
    }
    const { data: payments } = await getDb().from("payments").select("*").eq("username", username).order("created_at", { ascending: false }).limit(10);
    const { data: refunds } = await getDb().from("refund_requests").select("*").eq("username", username).order("created_at", { ascending: false });
    res.json({ user, plan, devices, payments, refunds });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/devices", async (req, res) => {
  try {
    const { data: devices } = await getDb().from("devices").select("*").order("created_at", { ascending: false });
    res.json(devices || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/admin/devices", async (req, res) => {
  try {
    // Column is device_id (there is no "id" column — the old filter silently failed)
    await getDb().from("devices").delete().neq("device_id", "");
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/admin/devices/:id", async (req, res) => {
  try {
    await getDb().from("devices").delete().eq("device_id", req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Delete client from our system ──────────────────────────────────────────
app.delete("/api/admin/users/:username", requireAdminAuth, async (req, res) => {
  const { username } = req.params;
  if (!username) return res.status(400).json({ error: "Username obrigatório" });
  try {
    const db = getDb();
    // Get group_id(s) for this user to delete group_plans
    const { data: userGroups } = await db.from("user_groups").select("group_id").eq("username", username);
    const groupIds = (userGroups || []).map((g: any) => g.group_id);
    // Check if user is the only member of each group; if so, delete the group_plan too
    for (const gid of groupIds) {
      const { data: members } = await db.from("user_groups").select("username").eq("group_id", gid);
      if ((members || []).length <= 1) {
        await db.from("group_plans").delete().eq("group_id", gid);
      }
    }
    await db.from("user_groups").delete().eq("username", username);
    await db.from("payments").delete().eq("username", username);
    await db.from("devices").delete().eq("username", username);
    await db.from("trusted_devices").delete().eq("username", username);
    await db.from("push_subscriptions").delete().eq("username", username);
    await db.from("referrals").delete().eq("referrer_username", username);
    await db.from("referrals").delete().eq("referred_username", username);
    await db.from("change_requests").delete().eq("username", username);
    // refunds table if exists
    try { await db.from("refunds").delete().eq("username", username); } catch { /* ignore if table doesn't exist */ }

    logActivity("admin_delete_user", {
      username,
      actor: "admin",
      description: `Admin excluiu o cliente ${username} do sistema (dados removidos; painel VPN é manual)`,
      metadata: { groupIds },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: renew user VPN access directly (bypasses the change-request flow)
app.post("/api/admin/users/:username/renew", requireAdminAuth, async (req, res) => {
  const { username } = req.params;
  if (!username) return res.status(400).json({ error: "Username obrigatório" });
  try {
    const params = new URLSearchParams();
    params.append("passapi", VPN_API_KEY);
    params.append("module", "renewuser");
    params.append("user", username);
    const text = await callVpnApi(params);
    console.log(`[admin] renewuser ${username}:`, text);
    logActivity("admin_renew_user", {
      username,
      actor: "admin",
      description: `Admin renovou +30 dias manualmente: ${username}`,
      metadata: { vpnResponse: String(text).slice(0, 200) },
    });
    res.json({ success: true, message: `Acesso de ${username} renovado com sucesso.`, vpnResponse: text });
  } catch (e: any) {
    console.error(`[admin] renewuser ${username} failed:`, e.message);
    res.status(500).json({ error: `Falha ao renovar no painel VPN: ${e.message}` });
  }
});

// ─── Reseller API ───────────────────────────────────────────────────────────

// Helper: fetch resellers from VPN panel
async function fetchVpnResellers(): Promise<any[]> {
  const params = new URLSearchParams();
  params.append("passapi", VPN_API_KEY);
  params.append("module", "revendaget");
  const res = await fetch(VPN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Reseller price: R$30/month + R$1/login/month, min 10 logins
function calcResellerPrice(months: number, logins: number): number {
  return (30 + logins) * months;
}

// Calculate reseller plan state from approved payments. The VPN panel API
// doesn't expose `expira` for resellers (`revendaget` returns no date field),
// so Supabase is the only source of truth for the expiration.
//
// IMPORTANT: a payment only contributes days to the expiry if its VPN panel
// operations actually succeeded — tracked via payment_attempts. This prevents
// the reseller UI from showing a date that the panel never actually received.
//
// Renewals use 30-day periods (not calendar months) to match `renewrev` behavior.
async function calcResellerInfoWithAttempts(payments: any[]): Promise<{ expiresAt: string | null; logins: number; totalMonths: number }> {
  const approved = (payments || [])
    .filter(p => p.status === "approved")
    .sort((a: any, b: any) => new Date(a.paid_at || a.created_at).getTime() - new Date(b.paid_at || b.created_at).getTime());

  if (approved.length === 0) return { expiresAt: null, logins: 0, totalMonths: 0 };

  // Batch-fetch successful renewrev counts for all payments in this batch.
  const ids = approved.map((p: any) => p.id);
  const { data: successAttempts } = await getDb()
    .from("payment_attempts")
    .select("payment_id, module")
    .in("payment_id", ids)
    .eq("status", "success");
  const successByPayment = new Map<string, Map<string, number>>();
  for (const a of successAttempts || []) {
    const per = successByPayment.get(a.payment_id) || new Map<string, number>();
    per.set(a.module, (per.get(a.module) || 0) + 1);
    successByPayment.set(a.payment_id, per);
  }

  let expiry: Date | null = null;
  let logins = 0;
  let totalMonths = 0;

  for (const p of approved) {
    const meta = parseMetadata(p.metadata);

    if (p.type === "reseller_setup") {
      if (meta.resellerLogins) logins = parseInt(meta.resellerLogins) || logins;
      if (meta.resellerExpiresAt) expiry = new Date(meta.resellerExpiresAt);
      continue;
    }

    if (p.type === "reseller_adjustment") {
      if (meta.resellerLogins !== undefined) logins = parseInt(meta.resellerLogins) || logins;
      if (meta.resellerExpiresAt) expiry = new Date(meta.resellerExpiresAt);
      continue;
    }

    if ((p.type === "reseller_hire" || p.type === "reseller_renewal") && meta.resellerLogins) {
      logins = parseInt(meta.resellerLogins) || logins;
    }

    // Months claimed by the payment metadata.
    const claimedMonths = Math.max(1, Math.min(12, parseInt(meta.resellerMonths) || 1));

    // Count the successful renewrev attempts actually applied for this payment.
    // Pre-migration payments (no attempts rows at all) fall back to claimedMonths
    // so legacy data keeps working until the retry worker backfills the history.
    const perModule = successByPayment.get(p.id);
    const appliedRenews = perModule?.get("renewrev") ?? 0;
    const hasAnyAttempts = perModule && perModule.size > 0;
    const effectiveMonths = hasAnyAttempts ? appliedRenews : claimedMonths;

    if (effectiveMonths <= 0) continue;

    const daysToAdd = effectiveMonths * 30;
    totalMonths += effectiveMonths;
    if (!expiry) {
      const base = new Date(p.paid_at || p.created_at);
      base.setDate(base.getDate() + daysToAdd);
      expiry = base;
    } else {
      const renewal = new Date(expiry);
      renewal.setDate(renewal.getDate() + daysToAdd);
      expiry = renewal;
    }
  }

  return { expiresAt: expiry ? expiry.toISOString() : null, logins, totalMonths };
}

// Synchronous fallback: used only in places that haven't been migrated yet to
// the async version. Counts metadata months without verifying VPN application.
// New code should prefer calcResellerInfoWithAttempts or read from reseller_plans.
function calcResellerInfo(payments: any[]): { expiresAt: string | null; logins: number } {
  const approved = (payments || [])
    .filter(p => p.status === "approved")
    .sort((a: any, b: any) => new Date(a.paid_at || a.created_at).getTime() - new Date(b.paid_at || b.created_at).getTime());

  if (approved.length === 0) return { expiresAt: null, logins: 0 };

  let expiry: Date | null = null;
  let logins = 0;

  for (const p of approved) {
    const meta = parseMetadata(p.metadata);

    if (p.type === "reseller_setup") {
      if (meta.resellerLogins) logins = parseInt(meta.resellerLogins) || logins;
      if (meta.resellerExpiresAt) expiry = new Date(meta.resellerExpiresAt);
      continue;
    }

    if (p.type === "reseller_adjustment") {
      if (meta.resellerLogins !== undefined) logins = parseInt(meta.resellerLogins) || logins;
      if (meta.resellerExpiresAt) expiry = new Date(meta.resellerExpiresAt);
      continue;
    }

    if ((p.type === "reseller_hire" || p.type === "reseller_renewal") && meta.resellerLogins) {
      logins = parseInt(meta.resellerLogins) || logins;
    }

    const months = Math.max(1, parseInt(meta.resellerMonths) || 1);
    const daysToAdd = months * 30;
    if (!expiry) {
      const base = new Date(p.paid_at || p.created_at);
      base.setDate(base.getDate() + daysToAdd);
      expiry = base;
    } else {
      const renewal = new Date(expiry);
      renewal.setDate(renewal.getDate() + daysToAdd);
      expiry = renewal;
    }
  }

  return { expiresAt: expiry ? expiry.toISOString() : null, logins };
}

function calcResellerExpiry(payments: any[]): string | null {
  return calcResellerInfo(payments).expiresAt;
}

// POST /api/reseller/login — authenticate by username (like regular users)
app.post("/api/reseller/login", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Usuário é obrigatório" });

    const resellers = await fetchVpnResellers();
    const reseller = resellers.find((r: any) => r.login?.toLowerCase() === username.toLowerCase());
    if (!reseller) return res.status(404).json({ error: "Revendedor não encontrado. Verifique o nome de usuário ou contrate uma revenda." });

    // Issue stateless session token (survives restarts/serverless cold starts)
    const token = createResellerToken(reseller.login);

    // Also fetch reseller's payments from Supabase.
    // Includes reseller_adjustment — admin manual adjustments must affect the
    // expiry shown here, otherwise this screen diverges from /me/details.
    const { data: payments } = await getDb()
      .from("payments")
      .select("*")
      .eq("username", reseller.login)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
      .order("created_at", { ascending: true })
      .limit(100);

    // Source of truth: successful payment_attempts. Payments that didn't
    // actually apply to the VPN panel don't contribute days to the expiry.
    const info = await calcResellerInfoWithAttempts(payments || []);
    const points = await calculateResellerLoyaltyPoints(reseller.login);
    // Never expose senha in login response — client must call /verify-password
    // Only expose a hint: first 2 chars + dots
    const passwordHint = reseller.senha
      ? reseller.senha.slice(0, 2) + "•".repeat(Math.max(2, reseller.senha.length - 2))
      : null;
    const { senha: _s, ...safeReseller } = reseller;
    res.json({ token, reseller: { ...safeReseller, passwordHint }, payments: (payments || []).reverse(), expiresAt: info.expiresAt, logins: info.logins, points });
  } catch (e: any) {
    console.error("[reseller/login] error:", e);
    res.status(500).json({ error: e.message || "Erro ao buscar revendedor." });
  }
});

// GET /api/reseller/me — get current reseller info (requires token)
app.get("/api/reseller/me", requireResellerAuth, async (req: any, res) => {
  try {
    const username = req.resellerUsername;
    const resellers = await fetchVpnResellers();
    const reseller = resellers.find((r: any) => r.login === username);
    if (!reseller) return res.status(404).json({ error: "Revendedor não encontrado" });

    const { data: payments } = await getDb()
      .from("payments")
      .select("*")
      .eq("username", username)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
      .order("created_at", { ascending: true })
      .limit(100);

    const info = await calcResellerInfoWithAttempts(payments || []);
    const points = await calculateResellerLoyaltyPoints(username);
    const passwordHint2 = reseller.senha
      ? reseller.senha.slice(0, 2) + "•".repeat(Math.max(2, reseller.senha.length - 2))
      : null;
    const { senha: _s2, ...safeReseller2 } = reseller;
    res.json({ reseller: { ...safeReseller2, passwordHint: passwordHint2 }, payments: (payments || []).reverse(), expiresAt: info.expiresAt, logins: info.logins, points });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reseller/me/details — full plan state + per-payment audit info.
// Used by the reseller dashboard to show a transparent history of what was
// paid, what was applied on the panel, and how many days each renewal added.
app.get("/api/reseller/me/details", requireResellerAuth, async (req: any, res) => {
  try {
    const username = req.resellerUsername;
    const db = getDb();

    const { data: payments } = await db
      .from("payments")
      .select("*")
      .eq("username", username)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
      .order("created_at", { ascending: true })
      .limit(100);

    const info = await calcResellerInfoWithAttempts(payments || []);

    const ids = (payments || []).map((p: any) => p.id);
    const { data: allAttempts } = ids.length
      ? await db.from("payment_attempts").select("*").in("payment_id", ids)
      : { data: [] as any[] };

    // Build per-payment history with days-added + applied flag.
    const history: any[] = [];
    let runningExpiry: Date | null = null;
    for (const p of (payments || []).sort((a: any, b: any) =>
      new Date(a.paid_at || a.created_at).getTime() - new Date(b.paid_at || b.created_at).getTime())
    ) {
      if (p.status !== "approved") continue;
      const meta = parseMetadata(p.metadata);
      const attempts = (allAttempts || []).filter((a: any) => a.payment_id === p.id);
      const successRenewrev = attempts.filter((a: any) => a.status === "success" && a.module === "renewrev").length;
      const anyFailed = attempts.some((a: any) => a.status === "failed");

      let daysAdded = 0;
      if (p.type === "reseller_setup" || p.type === "reseller_adjustment") {
        if (meta.resellerExpiresAt) runningExpiry = new Date(meta.resellerExpiresAt);
      } else {
        const claimedMonths = Math.max(1, Math.min(12, parseInt(meta.resellerMonths) || 1));
        const hasAttempts = attempts.length > 0;
        const effectiveMonths = hasAttempts ? successRenewrev : claimedMonths;
        daysAdded = effectiveMonths * 30;
        if (daysAdded > 0) {
          const base = runningExpiry ? new Date(runningExpiry) : new Date(p.paid_at || p.created_at);
          base.setDate(base.getDate() + daysAdded);
          runningExpiry = base;
        }
      }

      history.push({
        paymentId: p.id,
        type: p.type,
        paidAt: p.paid_at,
        createdAt: p.created_at,
        amount: meta.amount ?? null,
        monthsPaid: parseInt(meta.resellerMonths) || null,
        logins: parseInt(meta.resellerLogins) || null,
        daysAdded,
        expiresAfter: runningExpiry ? runningExpiry.toISOString() : null,
        discountApplied: !!meta.discountApplied,
        vpnApplied: !anyFailed && (p.type === "reseller_setup" || p.type === "reseller_adjustment" || successRenewrev > 0 || attempts.length === 0 ? meta.vpnApplied !== false : false),
        hasFailedAttempts: anyFailed,
      });
    }

    const daysLeft = info.expiresAt
      ? Math.ceil((new Date(info.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    const suggestedLogins = Math.max(10, info.logins || 10);
    const suggestedAmount = calcResellerPrice(1, suggestedLogins);

    res.json({
      plan: {
        logins: info.logins,
        expiresAt: info.expiresAt,
        daysLeft,
        totalMonthsPaid: info.totalMonths,
      },
      history: history.reverse(),
      nextRenewal: {
        suggestedAmount,
        suggestedMonths: 1,
        suggestedLogins,
      },
    });
  } catch (e: any) {
    console.error("[reseller/me/details] error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reseller/setup — first-access setup for existing resellers with no payment history
app.post("/api/reseller/setup", requireResellerAuth, async (req: any, res) => {
  try {
    const username = req.resellerUsername;
    const { logins, expiresAt } = req.body;
    if (!logins || !expiresAt) return res.status(400).json({ error: "Logins e data de vencimento são obrigatórios" });

    const loginsNum = Math.max(10, parseInt(logins));
    // Treat date-only input (YYYY-MM-DD) as end of day in Brasília (UTC-3) to avoid off-by-one
    const dateStr = String(expiresAt).trim();
    const isoStr = dateStr.length === 10 ? `${dateStr}T23:59:59-03:00` : dateStr;
    const expiryDate = new Date(isoStr);
    if (isNaN(expiryDate.getTime())) return res.status(400).json({ error: "Data de vencimento inválida" });

    // Only allow setup if no prior approved payments exist
    const { data: existing } = await getDb()
      .from("payments")
      .select("id")
      .eq("username", username)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup"])
      .eq("status", "approved")
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "Dados já configurados. Não é possível refazer o setup." });
    }

    const id = `setup_${username}_${Date.now()}`;
    await getDb().from("payments").insert({
      id,
      username,
      status: "approved",
      type: "reseller_setup",
      paid_at: new Date().toISOString(),
      metadata: { resellerLogins: loginsNum, resellerExpiresAt: expiryDate.toISOString(), isManualSetup: true },
    });

    logActivity("reseller_setup", {
      username,
      actor: "reseller",
      description: `Setup de revenda existente: ${username} — ${loginsNum} logins, vence ${expiryDate.toLocaleDateString("pt-BR")}`,
      metadata: { logins: loginsNum, expiresAt: expiryDate.toISOString() },
    });

    res.json({ success: true, logins: loginsNum, expiresAt: expiryDate.toISOString() });
  } catch (e: any) {
    console.error("[reseller/setup] error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reseller/verify-password — verify VPN panel password once; client caches result
app.post("/api/reseller/verify-password", requireResellerAuth, async (req: any, res) => {
  try {
    const username = req.resellerUsername;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Senha obrigatória" });

    const resellers = await fetchVpnResellers();
    const reseller = resellers.find((r: any) => r.login === username);
    if (!reseller) return res.status(404).json({ error: "Revendedor não encontrado" });

    if (String(reseller.senha) !== String(password)) {
      return res.status(401).json({ error: "Senha incorreta. Verifique a senha do seu painel VPN." });
    }

    res.json({ verified: true, password: reseller.senha });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reseller/pix/hire — generate PIX for new reseller sign-up
app.post("/api/reseller/pix/hire", async (req, res) => {
  try {
    const { username, password, whatsapp, logins, months } = req.body;
    if (!username || !password || !logins || !months) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    const loginsNum = parseInt(logins);
    const monthsNum = parseInt(months);
    if (!Number.isInteger(monthsNum) || monthsNum < 1 || monthsNum > 12) {
      return res.status(400).json({ error: "Período inválido. Escolha entre 1 e 12 meses." });
    }
    if (!Number.isInteger(loginsNum) || loginsNum < 10 || loginsNum > 1000) {
      return res.status(400).json({ error: "Quantidade de logins inválida. Mínimo 10, máximo 1000." });
    }

    // Make sure username isn't already taken (check both resellers AND regular users)
    const resellers = await fetchVpnResellers();
    const existing = resellers.find((r: any) => r.login?.toLowerCase() === username.toLowerCase());
    if (existing) return res.status(409).json({ error: "Usuário já existe. Escolha outro nome de usuário." });

    const regularUsers = await fetchVpnUsers();
    const existingRegular = regularUsers.find((u: any) => u.login?.toLowerCase() === username.toLowerCase());
    if (existingRegular) return res.status(409).json({ error: "Este nome de usuário já está em uso por um cliente. Escolha outro." });

    const amount = calcResellerPrice(monthsNum, loginsNum);
    const client = getMpClient();
    const payment = new Payment(client);
    const mpRes = await payment.create({
      body: {
        transaction_amount: amount,
        description: `Nova Revenda VS+ — ${loginsNum} logins por ${monthsNum} ${monthsNum === 1 ? "mês" : "meses"}`,
        payment_method_id: "pix",
        payer: { email: `${username}@cloudbrasil.shop`, first_name: username, last_name: "VS+" },
        notification_url: `${process.env.APP_URL}/api/webhook`,
      }
    });

    if (!mpRes.id || !mpRes.point_of_interaction?.transaction_data?.qr_code) {
      throw new Error("Erro ao gerar Pix no Mercado Pago");
    }

    await getDb().from("payments").insert({
      id: mpRes.id.toString(),
      username,
      status: "pending",
      type: "reseller_hire",
      metadata: { resellerUsername: username, resellerPassword: password, resellerWhatsapp: whatsapp || "", resellerLogins: loginsNum, resellerMonths: monthsNum, amount, paidOnTime: true },
    });
    schedulePaymentCheck(mpRes.id.toString());

    logActivity("pix_generated", {
      username,
      actor: "reseller",
      description: `PIX gerado: Contratação Revenda — ${loginsNum} logins por ${monthsNum} mês(es), ${fmtBRL(amount)}`,
      metadata: { paymentId: mpRes.id.toString(), type: "reseller_hire", amount, logins: loginsNum, months: monthsNum },
    });

    res.json({
      paymentId: mpRes.id.toString(),
      qrCodeBase64: mpRes.point_of_interaction.transaction_data.qr_code_base64,
      qrCode: mpRes.point_of_interaction.transaction_data.qr_code,
      amount,
    });
  } catch (e: any) {
    console.error("[reseller/pix/hire] error:", e);
    res.status(500).json({ error: e.message || "Erro ao gerar PIX" });
  }
});

// POST /api/reseller/pix/renew — generate PIX for reseller renewal (requires token)
app.post("/api/reseller/pix/renew", requireResellerAuth, async (req: any, res) => {
  try {
    const username = req.resellerUsername;
    const { months, logins: loginsParam } = req.body;
    const monthsNum = parseInt(months);
    if (!Number.isInteger(monthsNum) || monthsNum < 1 || monthsNum > 12) {
      return res.status(400).json({ error: "Período inválido. Escolha entre 1 e 12 meses." });
    }

    // Get current login limit from Supabase (VPN panel doesn't expose it reliably)
    const resellers = await fetchVpnResellers();
    const reseller = resellers.find((r: any) => r.login === username);
    if (!reseller) return res.status(404).json({ error: "Revendedor não encontrado" });

    // Fetch current logins from payment history
    const { data: resellerPayments } = await getDb()
      .from("payments")
      .select("*")
      .eq("username", username)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
      .order("created_at", { ascending: true })
      .limit(50);
    const currentInfo = calcResellerInfo(resellerPayments || []);
    const logins = loginsParam !== undefined && loginsParam !== null && loginsParam !== ""
      ? parseInt(loginsParam)
      : (currentInfo.logins || 10);
    if (!Number.isInteger(logins) || logins < 10 || logins > 1000) {
      return res.status(400).json({ error: "Quantidade de logins inválida. Mínimo 10, máximo 1000." });
    }

    const points = await calculateResellerLoyaltyPoints(username);
    let amount = calcResellerPrice(monthsNum, logins);
    let discountApplied = false;
    if (points >= 3) {
      amount = Math.round(amount * 0.8);
      discountApplied = true;
    }

    // paidOnTime real: só ganha ponto se renovar antes do vencimento
    const paidOnTime = currentInfo.expiresAt
      ? new Date(currentInfo.expiresAt).getTime() >= Date.now()
      : true;

    const client = getMpClient();
    const payment = new Payment(client);
    const mpRes = await payment.create({
      body: {
        transaction_amount: amount,
        description: `Renovação Revenda VS+ — ${logins} logins por ${monthsNum} ${monthsNum === 1 ? "mês" : "meses"}${discountApplied ? " (Desconto Fidelidade)" : ""}`,
        payment_method_id: "pix",
        payer: { email: `${username}@cloudbrasil.shop`, first_name: username, last_name: "VS+" },
        notification_url: `${process.env.APP_URL}/api/webhook`,
      }
    });

    if (!mpRes.id || !mpRes.point_of_interaction?.transaction_data?.qr_code) {
      throw new Error("Erro ao gerar Pix no Mercado Pago");
    }

    await getDb().from("payments").insert({
      id: mpRes.id.toString(),
      username,
      status: "pending",
      type: "reseller_renewal",
      metadata: { resellerUsername: username, resellerLogins: logins, resellerMonths: monthsNum, amount, discountApplied, paidOnTime },
    });
    schedulePaymentCheck(mpRes.id.toString());

    logActivity("pix_generated", {
      username,
      actor: "reseller",
      description: `PIX gerado: Renovação Revenda — ${logins} logins por ${monthsNum} mês(es), ${fmtBRL(amount)}${discountApplied ? " (desconto fidelidade)" : ""}`,
      metadata: { paymentId: mpRes.id.toString(), type: "reseller_renewal", amount, logins, months: monthsNum, discountApplied },
    });

    res.json({
      paymentId: mpRes.id.toString(),
      qrCodeBase64: mpRes.point_of_interaction.transaction_data.qr_code_base64,
      qrCode: mpRes.point_of_interaction.transaction_data.qr_code,
      amount,
      discountApplied,
      logins,
      months: monthsNum,
    });
  } catch (e: any) {
    console.error("[reseller/pix/renew] error:", e);
    res.status(500).json({ error: e.message || "Erro ao gerar PIX" });
  }
});

// GET /api/reseller/status/:paymentId — check reseller PIX payment status
app.get("/api/reseller/status/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { data: record } = await getDb().from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (!record) return res.status(404).json({ error: "Pagamento não encontrado" });
    if (record.status === "approved") return res.json({ status: "approved" });

    const client = getMpClient();
    const payment = new Payment(client);
    const mpRes = await payment.get({ id: paymentId });
    if (mpRes.status === "approved") {
      await approvePayment(record);
      return res.json({ status: "approved" });
    }
    res.json({ status: mpRes.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reseller/change-password — request password change (admin action)
app.post("/api/reseller/change-password", requireResellerAuth, async (req: any, res) => {
  try {
    const username = req.resellerUsername;
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: "Nova senha obrigatória" });

    await getDb().from("change_requests").insert({
      id: crypto.randomUUID(),
      username,
      type: "reseller_password",
      requested_value: newPassword,
      status: "aguardando",
    });

    logActivity("change_request_created", {
      username,
      actor: "reseller",
      description: `Solicitação de alteração de senha da revenda: ${username}`,
      metadata: { type: "reseller_password" },
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Web Push Endpoints ──────────────────────────────────────────────────────

// GET /api/push/vapid-public-key — public key for frontend subscription (no auth required)
app.get("/api/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
});

// POST /api/push/subscribe — save or update a push subscription
app.post("/api/push/subscribe", async (req, res) => {
  try {
    const { username, subscription } = req.body;
    if (!username || !subscription?.endpoint) return res.status(400).json({ error: "Dados inválidos" });
    await getDb().from("push_subscriptions").upsert(
      { username, endpoint: subscription.endpoint, subscription },
      { onConflict: "endpoint" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/push/subscribe — remove a push subscription
app.delete("/api/push/subscribe", async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Endpoint obrigatório" });
    await getDb().from("push_subscriptions").delete().eq("endpoint", endpoint);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reseller Change Requests ────────────────────────────────────────────────

const RESELLER_REQUEST_TYPES = ["reseller_password", "reseller_logins_decrease", "reseller_logins_increase"];

// GET /api/reseller/requests — list all change requests for the authenticated reseller
app.get("/api/reseller/requests", requireResellerAuth, async (req: any, res) => {
  try {
    const { data } = await getDb().from("change_requests")
      .select("*")
      .eq("username", req.resellerUsername)
      .in("type", RESELLER_REQUEST_TYPES)
      .order("created_at", { ascending: false })
      .limit(20);
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reseller/request/logins-decrease — request to reduce login count (free, needs admin approval)
app.post("/api/reseller/request/logins-decrease", requireResellerAuth, async (req: any, res) => {
  try {
    const username = req.resellerUsername;
    const { newLogins } = req.body;
    const loginsNum = Math.max(10, parseInt(newLogins));

    const { data: payments } = await getDb().from("payments").select("*")
      .eq("username", username)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
      .order("created_at", { ascending: true }).limit(50);
    const info = calcResellerInfo(payments || []);

    if (loginsNum >= info.logins) {
      return res.status(400).json({ error: "Para adicionar logins use o formulário de adição." });
    }

    const { data: existing } = await getDb().from("change_requests")
      .select("id").eq("username", username).eq("type", "reseller_logins_decrease").eq("status", "aguardando").limit(1);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "Você já tem uma solicitação de redução pendente." });
    }

    await getDb().from("change_requests").insert({
      id: crypto.randomUUID(),
      username,
      type: "reseller_logins_decrease",
      requested_value: String(loginsNum),
      status: "aguardando",
    });

    logActivity("change_request_created", {
      username,
      actor: "reseller",
      description: `Solicitação de redução de logins: ${info.logins} → ${loginsNum}`,
      metadata: { type: "reseller_logins_decrease", requestedValue: loginsNum },
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reseller/pix/logins-upgrade — generate PIX for login count increase (pro-rated)
app.post("/api/reseller/pix/logins-upgrade", requireResellerAuth, async (req: any, res) => {
  try {
    const username = req.resellerUsername;
    const { newLogins } = req.body;
    const loginsNum = Math.max(10, parseInt(newLogins));

    const { data: payments } = await getDb().from("payments").select("*")
      .eq("username", username)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
      .order("created_at", { ascending: true }).limit(50);
    const info = calcResellerInfo(payments || []);

    if (!info.expiresAt) return res.status(400).json({ error: "Sem plano ativo. Renove primeiro." });
    const daysLeft = Math.ceil((new Date(info.expiresAt).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 0) return res.status(400).json({ error: "Plano expirado. Renove primeiro." });
    if (loginsNum <= info.logins) return res.status(400).json({ error: "Para reduzir logins use o formulário de redução." });

    const loginDiff = loginsNum - info.logins;
    const amount = Math.max(1, Math.round(loginDiff * daysLeft / 30));

    const client = getMpClient();
    const payment = new Payment(client);
    const mpRes = await payment.create({
      body: {
        transaction_amount: amount,
        description: `Adição de ${loginDiff} logins — VS+ Revenda (${daysLeft} dias restantes)`,
        payment_method_id: "pix",
        payer: { email: `${username}@cloudbrasil.shop`, first_name: username, last_name: "VS+" },
        notification_url: `${process.env.APP_URL}/api/webhook`,
      }
    });

    if (!mpRes.id || !mpRes.point_of_interaction?.transaction_data?.qr_code) {
      throw new Error("Erro ao gerar Pix no Mercado Pago");
    }

    await getDb().from("payments").insert({
      id: mpRes.id.toString(),
      username,
      status: "pending",
      type: "reseller_logins_increase",
      metadata: { newLogins: loginsNum, currentLogins: info.logins, loginDiff, daysLeft, amount },
    });
    schedulePaymentCheck(mpRes.id.toString());

    logActivity("pix_generated", {
      username,
      actor: "reseller",
      description: `PIX gerado: Aumento de Logins — +${loginDiff} logins (${info.logins} → ${loginsNum}), ${fmtBRL(amount)}`,
      metadata: { paymentId: mpRes.id.toString(), type: "reseller_logins_increase", amount, newLogins: loginsNum, loginDiff },
    });

    res.json({
      paymentId: mpRes.id.toString(),
      qrCodeBase64: mpRes.point_of_interaction.transaction_data.qr_code_base64,
      qrCode: mpRes.point_of_interaction.transaction_data.qr_code,
      amount,
      newLogins: loginsNum,
      loginDiff,
      daysLeft,
    });
  } catch (e: any) {
    console.error("[reseller/pix/logins-upgrade] error:", e);
    res.status(500).json({ error: e.message || "Erro ao gerar PIX" });
  }
});

// ─── Admin Reseller Requests ─────────────────────────────────────────────────

// GET /api/admin/reseller-requests — list reseller-specific change requests
app.get("/api/admin/reseller-requests", async (_req, res) => {
  try {
    const { data } = await getDb().from("change_requests")
      .select("*")
      .in("type", RESELLER_REQUEST_TYPES)
      .order("created_at", { ascending: false });
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/reseller-requests/:id/approve — approve logins_decrease → creates reseller_adjustment
app.post("/api/admin/reseller-requests/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: request } = await getDb().from("change_requests").select("*").eq("id", id).maybeSingle();
    if (!request) return res.status(404).json({ error: "Solicitação não encontrada" });

    const newLogins = parseInt(request.requested_value);
    if (isNaN(newLogins) || newLogins < 1) return res.status(400).json({ error: "Valor inválido" });

    await getDb().from("payments").insert({
      id: `adj_${request.username}_${Date.now()}`,
      username: request.username,
      status: "approved",
      type: "reseller_adjustment",
      paid_at: new Date().toISOString(),
      metadata: { resellerLogins: newLogins, approvedFrom: id },
    });

    await getDb().from("change_requests")
      .update({ status: "aprovado", approved_value: String(newLogins) })
      .eq("id", id);

    sendPush(request.username, "Solicitação aprovada! ✅", `Sua alteração para ${newLogins} logins foi aprovada.`);
    logActivity("change_request_approved", {
      username: request.username,
      actor: "admin",
      description: `Redução de logins aprovada: ${request.username} → ${newLogins} logins`,
      metadata: { type: request.type, requestId: id, newLogins },
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/reseller-requests/:id/reject — reject with reason (stored in approved_value)
app.post("/api/admin/reseller-requests/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { data: request } = await getDb().from("change_requests").select("username, type").eq("id", id).maybeSingle();
    await getDb().from("change_requests")
      .update({ status: "rejeitado", approved_value: reason || "Recusado pelo administrador." })
      .eq("id", id);
    if (request) {
      sendPush(request.username, "Solicitação recusada", reason ? `Motivo: ${reason}` : "Sua solicitação foi recusada.");
      logActivity("change_request_rejected", {
        username: request.username,
        actor: "admin",
        description: `Solicitação de revenda rejeitada (${request.type})${reason ? ` — motivo: ${reason}` : ""}`,
        metadata: { type: request.type, requestId: id, reason: reason || null },
      });
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/reseller-requests/:id/confirm — admin confirms login increase after payment
app.post("/api/admin/reseller-requests/:id/confirm", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: request } = await getDb().from("change_requests").select("*").eq("id", id).maybeSingle();
    if (!request) return res.status(404).json({ error: "Solicitação não encontrada" });

    const newLogins = parseInt(request.requested_value);
    if (isNaN(newLogins) || newLogins < 1) return res.status(400).json({ error: "Valor inválido" });

    await getDb().from("payments").insert({
      id: `adj_${request.username}_${Date.now()}`,
      username: request.username,
      status: "approved",
      type: "reseller_adjustment",
      paid_at: new Date().toISOString(),
      metadata: { resellerLogins: newLogins, confirmedFrom: id },
    });

    await getDb().from("change_requests").update({ status: "confirmado" }).eq("id", id);
    sendPush(request.username, "Logins adicionados! 🎉", `${newLogins} logins foram adicionados à sua revenda.`);
    logActivity("change_request_approved", {
      username: request.username,
      actor: "admin",
      description: `Aumento de logins confirmado: ${request.username} → ${newLogins} logins`,
      metadata: { type: request.type, requestId: id, newLogins },
    });
    // A API do painel não tem módulo para alterar o limite de um revendedor —
    // o admin precisa fazer isso manualmente no painel VPN.
    res.json({ success: true, message: `Confirmado. IMPORTANTE: altere o limite de ${request.username} para ${newLogins} logins manualmente no painel VPN.` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin Reseller Management ────────────────────────────────────────────────

// GET /api/admin/resellers — list all resellers with their computed plan info
app.get("/api/admin/resellers", async (_req, res) => {
  try {
    const resellers = await fetchVpnResellers();

    // Fetch all reseller-type payments from Supabase in one query
    const { data: allPayments } = await getDb()
      .from("payments")
      .select("*")
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
      .order("created_at", { ascending: true });

    // Pull outstanding failed attempts so the UI can flag resellers needing attention.
    const allPaymentIds = (allPayments || []).map((p: any) => p.id);
    const { data: failedAttempts } = allPaymentIds.length
      ? await getDb().from("payment_attempts")
          .select("payment_id, target_username")
          .in("payment_id", allPaymentIds)
          .eq("status", "failed")
      : { data: [] as any[] };
    const failedByUser = new Set<string>();
    for (const a of failedAttempts || []) {
      const p = (allPayments || []).find((x: any) => x.id === a.payment_id);
      if (p) failedByUser.add(p.username);
    }

    const result = await Promise.all(resellers.map(async (r: any) => {
      const payments = (allPayments || []).filter((p: any) => p.username === r.login);
      const info = await calcResellerInfoWithAttempts(payments);
      const { senha: _s, ...safeReseller } = r;
      return {
        ...safeReseller,
        expiresAt: info.expiresAt,
        logins: info.logins,
        hasFailedApplication: failedByUser.has(r.login),
      };
    }));

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/resellers/:username/details — full audit trail for one reseller:
// plan state, every payment with embedded VPN attempts and day-added accounting.
app.get("/api/admin/resellers/:username/details", requireAdminAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const db = getDb();

    const { data: payments } = await db
      .from("payments")
      .select("*")
      .eq("username", username)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
      .order("created_at", { ascending: true })
      .limit(200);

    const ids = (payments || []).map((p: any) => p.id);
    const { data: allAttempts } = ids.length
      ? await db.from("payment_attempts").select("*").in("payment_id", ids).order("created_at", { ascending: true })
      : { data: [] as any[] };

    const info = await calcResellerInfoWithAttempts(payments || []);

    // Build per-payment history with days-added + applied flag + embedded attempts.
    const history: any[] = [];
    let runningExpiry: Date | null = null;
    for (const p of (payments || []).sort((a: any, b: any) =>
      new Date(a.paid_at || a.created_at).getTime() - new Date(b.paid_at || b.created_at).getTime())
    ) {
      const meta = parseMetadata(p.metadata);
      const attempts = (allAttempts || []).filter((a: any) => a.payment_id === p.id);
      const successRenewrev = attempts.filter((a: any) => a.status === "success" && a.module === "renewrev").length;
      const anyFailed = attempts.some((a: any) => a.status === "failed");

      let daysAdded = 0;
      if (p.status === "approved") {
        if (p.type === "reseller_setup" || p.type === "reseller_adjustment") {
          if (meta.resellerExpiresAt) runningExpiry = new Date(meta.resellerExpiresAt);
        } else {
          const claimedMonths = Math.max(1, Math.min(12, parseInt(meta.resellerMonths) || 1));
          const hasAttempts = attempts.length > 0;
          const effectiveMonths = hasAttempts ? successRenewrev : claimedMonths;
          daysAdded = effectiveMonths * 30;
          if (daysAdded > 0) {
            const base = runningExpiry ? new Date(runningExpiry) : new Date(p.paid_at || p.created_at);
            base.setDate(base.getDate() + daysAdded);
            runningExpiry = base;
          }
        }
      }

      history.push({
        paymentId: p.id,
        status: p.status,
        type: p.type,
        paidAt: p.paid_at,
        createdAt: p.created_at,
        amount: meta.amount ?? null,
        monthsPaid: parseInt(meta.resellerMonths) || null,
        logins: parseInt(meta.resellerLogins) || null,
        daysAdded,
        expiresAfter: runningExpiry ? runningExpiry.toISOString() : null,
        discountApplied: !!meta.discountApplied,
        vpnApplied: !anyFailed && (p.type === "reseller_setup" || p.type === "reseller_adjustment" || successRenewrev > 0 || attempts.length === 0 ? meta.vpnApplied !== false : false),
        hasFailedAttempts: anyFailed,
        attempts,
      });
    }

    res.json({
      plan: { logins: info.logins, expiresAt: info.expiresAt, totalMonthsPaid: info.totalMonths },
      history: history.reverse(),
    });
  } catch (e: any) {
    console.error("[admin/resellers/:username/details] error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/resellers/:username/adjust — manually set expiry and/or logins for a reseller
app.post("/api/admin/resellers/:username/adjust", async (req, res) => {
  try {
    const { username } = req.params;
    const { expiresAt, logins } = req.body;

    if (!expiresAt && logins === undefined) {
      return res.status(400).json({ error: "Informe expiresAt e/ou logins" });
    }

    const meta: any = { isAdminAdjustment: true };

    if (expiresAt) {
      const dateStr = String(expiresAt).trim();
      const isoStr = dateStr.length === 10 ? `${dateStr}T23:59:59-03:00` : dateStr;
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return res.status(400).json({ error: "Data de vencimento inválida" });
      meta.resellerExpiresAt = d.toISOString();
    }

    if (logins !== undefined) {
      const loginsNum = Math.max(1, parseInt(logins));
      if (isNaN(loginsNum)) return res.status(400).json({ error: "Quantidade de logins inválida" });
      meta.resellerLogins = loginsNum;
    }

    const id = `adj_${username}_${Date.now()}`;
    await getDb().from("payments").insert({
      id,
      username,
      status: "approved",
      type: "reseller_adjustment",
      paid_at: new Date().toISOString(),
      metadata: meta,
    });

    logActivity("admin_reseller_adjust", {
      username,
      actor: "admin",
      description: `Admin ajustou revenda ${username}:${meta.resellerExpiresAt ? ` vencimento → ${new Date(meta.resellerExpiresAt).toLocaleDateString("pt-BR")}` : ""}${meta.resellerLogins !== undefined ? ` logins → ${meta.resellerLogins}` : ""}`,
      metadata: { adjustmentId: id, ...meta },
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Expiry Notifications ────────────────────────────────────────────────────
// Warns users/resellers whose access expires in 3 or 1 day. Triggered daily at
// 9h BRT via node-cron (persistent hosts) or /api/cron/daily (serverless).
async function runExpiryNotifications(): Promise<{ clients: number; resellers: number; trials: number }> {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = { clients: 0, resellers: 0, trials: 0 };

  // Only usernames that can actually receive a push — avoids iterating the
  // whole VPN panel for users who never subscribed.
  const { data: subRows } = await db.from("push_subscriptions").select("username");
  const subscribed = new Set((subRows || []).map((s: any) => s.username));
  if (subscribed.size === 0) return counts;

  // Trial devices (used both for the trial notices and to skip trial accounts
  // in the regular-client loop while their 2-day window is active).
  const { data: trialDevices } = await db.from("devices").select("username, created_at");
  const activeTrialUsers = new Set(
    (trialDevices || [])
      .filter((d: any) => {
        const exp = new Date(d.created_at);
        exp.setDate(exp.getDate() + 2);
        return exp.getTime() >= today.getTime();
      })
      .map((d: any) => d.username)
  );

  // ── Regular clients — expiry comes from the VPN panel (userget), which is
  // the source of truth. (The old code read user_groups.expires_at, a column
  // that never existed — client warnings silently never fired.)
  try {
    const vpnUsers = await fetchVpnUsers();
    for (const u of vpnUsers) {
      if (!u?.login || !subscribed.has(u.login) || activeTrialUsers.has(u.login)) continue;
      const exp = parseVpnExpira(u.expira);
      if (!exp) continue;
      exp.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((exp.getTime() - today.getTime()) / 86400000);
      if (daysLeft === 3) {
        counts.clients++;
        await sendPush(u.login, "Seu acesso vence em 3 dias", "Renove agora para não perder o acesso.");
      } else if (daysLeft === 1) {
        counts.clients++;
        await sendPush(u.login, "Seu acesso vence amanhã! ⚠️", "Renove hoje para manter seu acesso ativo.");
      }
    }
  } catch (e) { console.error("[cron] client expiry check failed:", e); }

  // ── Resellers ──
  try {
    const { data: resellers } = await db
      .from("payments")
      .select("username")
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_adjustment"])
      .eq("status", "approved");

    const uniqueResellers = [...new Set((resellers || []).map((r: any) => r.username))]
      .filter(u => subscribed.has(u));

    for (const username of uniqueResellers) {
      // Filter by reseller payment types — mixing in regular payments skewed the date.
      const { data: payments } = await db
        .from("payments")
        .select("*")
        .eq("username", username)
        .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment"])
        .eq("status", "approved");

      const info = calcResellerInfo(payments || []);
      if (!info.expiresAt) continue;

      const exp = new Date(info.expiresAt);
      exp.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((exp.getTime() - today.getTime()) / 86400000);
      if (daysLeft === 3) {
        counts.resellers++;
        await sendPush(username, "Sua revenda vence em 3 dias", "Renove sua revenda para não perder o acesso.");
      } else if (daysLeft === 1) {
        counts.resellers++;
        await sendPush(username, "Sua revenda vence amanhã! ⚠️", "Renove hoje para manter sua revenda ativa.");
      }
    }
  } catch (e) { console.error("[cron] reseller expiry check failed:", e); }

  // ── Trial users (2-day trial) ──
  try {
    for (const d of trialDevices || []) {
      if (!subscribed.has(d.username)) continue;
      const exp = new Date(d.created_at);
      exp.setDate(exp.getDate() + 2);
      exp.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((exp.getTime() - today.getTime()) / 86400000);
      if (daysLeft === 1) {
        counts.trials++;
        await sendPush(d.username, "Seu teste gratuito vence amanhã! ⏰", "Gostou? Assine agora para não perder o acesso.");
      } else if (daysLeft === 0) {
        counts.trials++;
        await sendPush(d.username, "Seu teste gratuito venceu hoje", "Assine agora e continue usando sem interrupções.");
      }
    }
  } catch (e) { console.error("[cron] trial expiry check failed:", e); }

  return counts;
}

cron.schedule("0 9 * * *", () => {
  runExpiryNotifications().catch(e => console.error("[cron] daily error:", e));
  cleanupOldLogs().catch(() => {});
}, { timezone: "America/Sao_Paulo" });

// ─── Sync pending/cancelled payments against Mercado Pago ────────────────────
async function syncPendingPayments(): Promise<number> {
  let recovered = 0;
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // last 48h
    const { data: stale } = await getDb()
      .from("payments")
      .select("*")
      .in("status", ["pending", "cancelled"])
      .gte("created_at", since);

    if (!stale || stale.length === 0) return 0;

    const paymentApi = new Payment(getMpClient());
    for (const p of stale) {
      try {
        const mpRes = await paymentApi.get({ id: p.id });
        if (mpRes.status === "approved") {
          await approvePayment(p);
          recovered++;
          console.log(`[bg-sync] Recovered payment ${p.id} for ${p.username}`);
          logActivity("payment_recovered", {
            username: p.username,
            actor: "system",
            description: `Pagamento recuperado pela varredura automática: ${logPaymentTypeLabel(p.type)} (estava "${p.status}")`,
            metadata: { paymentId: p.id, previousStatus: p.status },
          });
        }
      } catch (e) {
        // Silently skip individual failures
      }
    }
  } catch (e) {
    console.warn("[bg-sync] payment sync error:", e);
  }
  return recovered;
}

// Persistent hosts: run every 10 minutes. (On serverless this interval rarely
// fires — /api/cron/tick below is the reliable trigger there.)
setInterval(() => { syncPendingPayments().catch(() => {}); }, 10 * 60 * 1000);

// Varredura de reaplicação (pagamentos aprovados com aplicação incompleta no
// painel) a cada 10 min enquanto a instância viver; no serverless o
// /api/cron/tick diário é o gatilho garantido.
setInterval(() => { retryFailedApplications().catch(() => {}); }, 10 * 60 * 1000);

// ─── Cron endpoints (serverless-safe workers) ────────────────────────────────
// setInterval/node-cron do NOT run reliably on Vercel/serverless: the process
// only lives during a request. These endpoints let an external scheduler
// (Vercel Cron, cron-job.org, UptimeRobot…) drive the background work.
// Auth: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically
// when the CRON_SECRET env var is set. A valid admin token also works.
function requireCronAuth(req: any, res: any, next: any) {
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers["authorization"] || "");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (secret && bearer === secret) return next();
  if (hasAdminToken(req)) return next();
  if (!secret && process.env.NODE_ENV !== "production") return next(); // dev convenience
  return res.status(401).json({ error: "Não autorizado." });
}

// Every-few-minutes tick: scheduled 1min/5min checks, MP sync, VPN retry, stale cleanup.
app.get("/api/cron/tick", requireCronAuth, async (_req, res) => {
  const startedAt = Date.now();
  try {
    await runScheduledChecksTick();
    const recovered = await syncPendingPayments();
    const retry = await retryFailedApplications();
    await cancelStalePendingPayments();
    res.json({ ok: true, recovered, retry, ms: Date.now() - startedAt });
  } catch (e: any) {
    console.error("[cron/tick] error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Daily tick: expiry notifications (9h BRT ≈ 12:00 UTC) + log retention cleanup.
app.get("/api/cron/daily", requireCronAuth, async (_req, res) => {
  try {
    const counts = await runExpiryNotifications();
    await cleanupOldLogs();
    res.json({ ok: true, ...counts });
  } catch (e: any) {
    console.error("[cron/daily] error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

async function startServer() {
  const server = http.createServer(app);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: { server } },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite failed to start:", e);
    }
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ 
    error: "Erro interno do servidor", 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
  });
});

export default app;

if (process.env.NODE_ENV !== "production") {
  startServer();
}
