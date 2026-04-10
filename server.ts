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
const PORT = 3000;

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

// ─── Admin Auth ────────────────────────────────────────────────────────────
// Tokens are stored in memory with a TTL of 24h. Never exposed in client JS.
const ADMIN_TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

function requireResellerAuth(req: any, res: any, next: any) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = resellerTokens.get(token);
  if (!session || Date.now() > session.expiresAt) {
    resellerTokens.delete(token);
    return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
  }
  (req as any).resellerUsername = session.username;
  next();
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

  // Parse metadata safely
  const metadata = parseMetadata(paymentRecord.metadata);

  if (paymentRecord.type === "reseller_hire") {
    // Create new reseller in VPN panel, then renew N months
    const { resellerUsername: newRev, resellerPassword: newRevPass, resellerWhatsapp, resellerLogins, resellerMonths } = metadata;
    if (newRev && newRevPass) {
      const createParams = new URLSearchParams();
      createParams.append("passapi", VPN_API_KEY);
      createParams.append("module", "createrev");
      createParams.append("user", newRev);
      createParams.append("pass", newRevPass);
      createParams.append("userlimite", String(resellerLogins || 10));
      if (resellerWhatsapp) createParams.append("whatsapp", resellerWhatsapp);
      try {
        const text = await callVpnApi(createParams);
        console.log(`[reseller] createrev for ${newRev}:`, text);
      } catch (e: any) {
        console.error(`[reseller] createrev failed after retries:`, e.message);
        sendPush("__admin__", "⚠️ Falha ao criar revendedor", `Falha ao criar ${newRev} no painel VPN. Pagamento: ${paymentId}. Erro: ${e.message}`);
      }

      // Renew N times to set expiry (each call adds ~30 days)
      const months = Number(resellerMonths) || 1;
      for (let i = 0; i < months; i++) {
        const renewP = new URLSearchParams();
        renewP.append("passapi", VPN_API_KEY);
        renewP.append("module", "renewrev");
        renewP.append("user", newRev);
        try {
          const text = await callVpnApi(renewP);
          console.log(`[reseller] renewrev ${newRev} month ${i + 1}:`, text);
        } catch (e: any) {
          console.error(`[reseller] renewrev failed after retries:`, e.message);
          sendPush("__admin__", "⚠️ Falha ao renovar revendedor", `Falha ao renovar ${newRev} (mês ${i + 1}) no painel VPN. Erro: ${e.message}`);
        }
      }
      sendPush(paymentRecord.username, "Revenda ativada! 🎉", "Sua conta de revenda está ativa e pronta para uso.");
    }

  } else if (paymentRecord.type === "reseller_renewal") {
    // Renew existing reseller N months
    const resellerUser = metadata.resellerUsername || paymentRecord.username;
    const months = Number(metadata.resellerMonths) || 1;
    for (let i = 0; i < months; i++) {
      const renewP = new URLSearchParams();
      renewP.append("passapi", VPN_API_KEY);
      renewP.append("module", "renewrev");
      renewP.append("user", resellerUser);
      try {
        const text = await callVpnApi(renewP);
        console.log(`[reseller] renewrev ${resellerUser} month ${i + 1}:`, text);
      } catch (e: any) {
        console.error(`[reseller] renewrev failed after retries:`, e.message);
        sendPush("__admin__", "⚠️ Falha ao renovar revendedor", `Falha ao renovar ${resellerUser} (mês ${i + 1}) no painel VPN. Pagamento: ${paymentId}. Erro: ${e.message}`);
      }
    }
    sendPush(paymentRecord.username, "Revenda renovada! 🎉", "Sua revenda foi renovada com sucesso.");

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
    }
    sendPush(paymentRecord.username, "Pagamento recebido!", "Aguardando confirmação do administrador para adicionar os logins.");
    sendPush("__admin__", "Aumento de logins pago", `${paymentRecord.username} pagou pelo aumento de logins. Confirme no painel.`);

  } else if (paymentRecord.type === "new_device") {
    const { newUsername, remainingDays, groupId } = metadata;

    if (newUsername && remainingDays && groupId) {
      // Create user in VPN Panel
      const password = Math.floor(100000 + Math.random() * 900000).toString();
      const params = new URLSearchParams();
      params.append("passapi", VPN_API_KEY);
      params.append("module", "createuser");
      params.append("user", newUsername);
      params.append("pass", password);
      params.append("limit", "1");
      params.append("days", remainingDays.toString());

      try {
        const vpnText = await callVpnApi(params);
        console.log(`VPN Create Response for ${newUsername}:`, vpnText);
      } catch (e: any) {
        console.error(`Failed to create VPN user ${newUsername} after retries:`, e.message);
        sendPush("__admin__", "⚠️ Falha ao criar usuário VPN", `Falha ao criar ${newUsername} no painel VPN. Pagamento: ${paymentId}. Erro: ${e.message}`);
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
        usersToRenew = groupUsers.map(u => u.username);
      }
    }

    // Renew users in VPN Panel
    // renewuser adds 30 days to the CURRENT expiry date. If the user is expired,
    // those 30 days start from the past date, resulting in fewer days from today.
    // We detect this and pass extra "dias" parameter to compensate the deficit.
    const allVpnUsers = await fetchVpnUsers();
    let renewFailed = false;
    for (const user of usersToRenew) {
      // Check if user is expired and calculate deficit
      let deficitDays = 0;
      const vpnUser = allVpnUsers.find((u: any) => u.login === user);
      if (vpnUser?.expira) {
        const expiry = new Date(vpnUser.expira.replace(' ', 'T'));
        const now = new Date();
        if (expiry < now) {
          deficitDays = Math.ceil((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`[renew] ${user} expired ${deficitDays}d ago — adding deficit to first renewal call`);
        }
      }

      for (let i = 0; i < monthsToRenew; i++) {
        const params = new URLSearchParams();
        params.append("passapi", VPN_API_KEY);
        params.append("module", "renewuser");
        params.append("user", user);
        // On the first call for an expired user, add the deficit so the panel
        // gives 30 + deficit days instead of just 30 (if the panel supports it)
        if (i === 0 && deficitDays > 0) {
          params.append("dias", String(30 + deficitDays));
          params.append("days", String(30 + deficitDays));
        }

        try {
          const vpnText = await callVpnApi(params);
          console.log(`VPN Renew Response for ${user} (Month ${i + 1}${i === 0 && deficitDays > 0 ? `, +${deficitDays}d deficit` : ""}):`, vpnText);
        } catch (e: any) {
          console.error(`Failed to renew VPN user ${user} after retries:`, e.message);
          renewFailed = true;
          sendPush("__admin__", "⚠️ Falha ao renovar acesso VPN", `Falha ao renovar ${user} (mês ${i + 1}). Pagamento: ${paymentId}. Erro: ${e.message}`);
        }
      }
    }
    if (renewFailed) {
      // Mark payment with a flag so admin can re-trigger renewal
      await db.from("payments").update({ metadata: JSON.stringify({ ...metadata, vpnRenewFailed: true }) }).eq("id", paymentId);
    }
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
    // Give 1 month free to referrer
    const params = new URLSearchParams();
    params.append("passapi", VPN_API_KEY);
    params.append("module", "renewuser");
    params.append("user", referral.referrer_username);

    try {
      await fetch(VPN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      // Update referral status
      await db.from("referrals").update({ status: 'bonus_received' }).eq("id", referral.id);
    } catch (e) {
      console.error(`Failed to award referral bonus to ${referral.referrer_username}:`, e);
    }
  }
}

// ─── Auto-check payment against MP after 1 min and 5 min ─────────────────────
function schedulePaymentCheck(paymentId: string) {
  const delays = [60_000, 300_000]; // 1 minute, 5 minutes
  for (const delay of delays) {
    setTimeout(async () => {
      try {
        const { data: p } = await getDb().from("payments").select("*").eq("id", paymentId).maybeSingle();
        if (!p || p.status === "approved") return; // already handled
        const mpPayment = new Payment(getMpClient());
        const mpRes = await mpPayment.get({ id: paymentId });
        if (mpRes.status === "approved") {
          await approvePayment(p);
          console.log(`[auto-check] Payment ${paymentId} approved at ${delay / 1000}s check`);
        }
      } catch (e) {
        console.warn(`[auto-check] Error checking payment ${paymentId} at ${delay / 1000}s:`, e);
      }
    }, delay);
  }
}

// Pricing formula:
// Base: R$15/month for 1 device
// Each additional month: +R$10 total
// Each additional device: +R$10 total
function calculatePlanPrice(months: number, devices: number): number {
  return 15 + (months - 1) * 10 + (devices - 1) * 10;
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
    res.json(details);
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

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error adding to group:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/group/remove", async (req, res) => {
  try {
    const { groupId, usernameToRemove } = req.body;

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

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error removing from group:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/group/plan", async (req, res) => {
  try {
    const { groupId, plan_type, plan_months, plan_devices, plan_price } = req.body;

    await getDb().from("group_plans").update({ plan_type, plan_months, plan_devices, plan_price }).eq("group_id", groupId);

    res.json({ success: true });
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

    // Get group-wide active change requests (only regular user types)
    const { data: changeRequests } = await getDb().from("change_requests").select("*").in("username", groupUsernames).in("type", ["date", "username", "uuid", "password"]);

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

    res.json({ ...user, isTrusted, points, referrals, refundRequest, changeRequests, recentDateChangeRequest, lastPaymentDate, payments });
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

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error verifying password:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

// 0.1 Create Free User
app.post("/api/create-free", async (req, res) => {
  try {
    const { username, deviceId, referrer } = req.body;

    if (!username || !deviceId) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    // Validate username: only letters and numbers, max 10 chars
    if (!/^[a-zA-Z0-9]{1,10}$/.test(username)) {
      return res.status(400).json({ error: "Usuário inválido. Use apenas letras e números, até 10 caracteres." });
    }

    // Check if device already created a user
    const { data: existingDevice } = await getDb().from("devices").select("*").eq("device_id", deviceId).maybeSingle();
    if (existingDevice) {
      return res.status(403).json({ error: "Este aparelho já gerou um teste gratuito.", existing_username: existingDevice.username });
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

    // Save device
    await getDb().from("devices").upsert({ device_id: deviceId, username });

    // Trust device automatically
    await getDb().from("trusted_devices").upsert({ device_id: deviceId, username });

    // Save referral if exists
    if (referrer) {
      const referralId = crypto.randomUUID();
      await getDb().from("referrals").insert({ id: referralId, referrer_username: referrer, referred_username: username });
    }

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

    // Calculate price difference
    const { data: groupUsers } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
    const currentDevices = (groupUsers || []).length;

    const getPrice = (devices: number) => {
      if (devices <= 1) return 20;
      if (devices === 2) return 35;
      if (devices === 3) return 50;
      if (devices === 4) return 60;
      if (devices === 5) return 70;
      return 80;
    };

    const currentPrice = getPrice(currentDevices);
    const newPrice = getPrice(currentDevices + 1);
    const priceDiff = newPrice - currentPrice;

    let proratedPrice = Number(((priceDiff / 30) * remainingDays).toFixed(2));

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
    const { groupId, mainUsername, newUsername, remainingDays } = req.body;

    // Generate random password
    const password = Math.random().toString(36).slice(-6);

    // Create user in VPN
    const createParams = new URLSearchParams();
    createParams.append("passapi", VPN_API_KEY);
    createParams.append("module", "useradd");
    createParams.append("login", newUsername);
    createParams.append("senha", password);
    createParams.append("dias", remainingDays.toString());
    createParams.append("limite", "1");

    await fetch(VPN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams.toString(),
    });

    // Add to group
    await getDb().from("user_groups").upsert({ group_id: groupId, username: newUsername });

    // Update plan
    const { data: groupUsers } = await getDb().from("user_groups").select("username").eq("group_id", groupId);
    const numDevices = (groupUsers || []).length;
    let newPrice = 20;
    if (numDevices === 2) newPrice = 35;
    else if (numDevices === 3) newPrice = 50;
    else if (numDevices === 4) newPrice = 60;
    else if (numDevices === 5) newPrice = 70;
    else if (numDevices >= 6) newPrice = 80;

    await getDb().from("group_plans").update({ plan_type: 'devices', plan_devices: numDevices, plan_price: newPrice }).eq("group_id", groupId);

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

// 3. Webhook for Mercado Pago
app.post("/api/webhook", async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === "payment" && data?.id) {
      const paymentId = data.id.toString();

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
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/user/update-access", async (req, res) => {
  try {
    const { username, action, newValue } = req.body;

    if (!['username', 'password', 'date', 'uuid'].includes(action)) {
      return res.status(400).json({ error: "Ação inválida" });
    }
    if (!newValue && action !== 'uuid') {
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
    res.json(payments || []);
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

    if (refund) sendPush(refund.username, "Reembolso aprovado! ✅", "Seu reembolso foi processado com sucesso.");

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
    if (refund) sendPush(refund.username, "Reembolso recusado", "Sua solicitação de reembolso foi negada.");
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
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/change-requests/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { data: request } = await getDb().from("change_requests").select("username").eq("id", id).maybeSingle();
    await getDb().from("change_requests").update({ status: 'rejeitado', approved_value: reason || null }).eq("id", id);
    if (request) sendPush(request.username, "Solicitação recusada", reason ? `Motivo: ${reason}` : "Sua solicitação foi recusada.");
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
      : ["date", "username", "uuid", "password"];
    const { data: changeRequests } = await getDb().from("change_requests").select("*").eq("username", username).in("type", changeRequestTypes).order("created_at", { ascending: false });

    // Get plan info + all group members
    const { data: group } = await getDb().from("user_groups").select("*").eq("username", username).maybeSingle();
    let plan = null;
    let groupMembers: any[] = [];
    if (group) {
      const { data: p } = await getDb().from("group_plans").select("*").eq("group_id", group.group_id).maybeSingle();
      plan = p;
      const { data: gm } = await getDb().from("user_groups").select("username").eq("group_id", group.group_id);
      if (gm && gm.length > 1) {
        const allVpnUsers = await fetchVpnUsers();
        groupMembers = (gm || [])
          .filter(m => m.username !== username)
          .map(m => ({ username: m.username, ...allVpnUsers.find((u: any) => u.login === m.username) }));
      }
    }

    // Get loyalty points (calculated from payment history — always in sync with history display)
    const points = await calculateLoyaltyPoints(username);

    // Get referrals
    const { data: referrals } = await getDb().from("referrals").select("*").eq("referrer_username", username).order("created_at", { ascending: false });

    res.json({
      user,
      devices: devices || [],
      payments: payments || [],
      refunds: refunds || [],
      changeRequests: changeRequests || [],
      plan,
      points,
      referrals: referrals || [],
      groupMembers,
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
    const previousRevenue = (prevPayments || []).reduce((sum: number, p: any) => sum + getAmount(p), 0);
    const previousSales = (prevPayments || []).filter((p: any) => getAmount(p) > 0).length;

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
    const ticketId = crypto.randomUUID();
    const messageId = crypto.randomUUID();

    await getDb().from("tickets").insert({ id: ticketId, username, category, subject });
    await getDb().from("ticket_messages").insert({ id: messageId, ticket_id: ticketId, sender: "user", message });

    // Notify admin of new ticket
    sendPush("__admin__", "Novo chamado aberto", `${username}: ${subject}`, "/");

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

app.post("/api/tickets/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const { sender, message } = req.body;
    const messageId = crypto.randomUUID();

    await getDb().from("ticket_messages").insert({ id: messageId, ticket_id: id, sender, message });

    const status = sender === "admin" ? "answered" : "open";
    await getDb().from("tickets").update({ status }).eq("id", id);

    // Notify user when admin replies, notify admin when user replies
    if (sender === "admin") {
      const { data: ticket } = await getDb().from("tickets").select("username, subject").eq("id", id).single();
      if (ticket) sendPush(ticket.username, "Nova resposta no suporte", `Seu chamado "${ticket.subject}" foi respondido.`, "/");
    } else {
      const { data: ticket } = await getDb().from("tickets").select("username, subject").eq("id", id).single();
      if (ticket) sendPush("__admin__", "Resposta em chamado", `${ticket.username}: ${ticket.subject}`, "/");
    }

    res.json({ success: true, messageId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Edit a ticket message (update text only)
app.patch("/api/tickets/messages/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Mensagem inválida" });
    const { error } = await getDb().from("ticket_messages").update({ message: message.trim() }).eq("id", messageId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Hard-delete a ticket message (no trace)
app.delete("/api/tickets/messages/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
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
    await getDb().from("tickets").update({ status }).eq("id", id);
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
    await getDb().from("devices").delete().neq("id", "0"); // Delete all effectively
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

// Calculate reseller plan expiry and current logins from approved payments
// The VPN panel API doesn't expose these for reseller accounts, so Supabase is the source of truth.
// Renewals use 30-day periods (not calendar months) to match the VPN panel behavior.
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
      // Manual first-access setup: use exact values as provided by the reseller
      if (meta.resellerLogins) logins = parseInt(meta.resellerLogins) || logins;
      if (meta.resellerExpiresAt) expiry = new Date(meta.resellerExpiresAt);
      continue;
    }

    if (p.type === "reseller_adjustment") {
      // Admin manual adjustment: override exact values
      if (meta.resellerLogins !== undefined) logins = parseInt(meta.resellerLogins) || logins;
      if (meta.resellerExpiresAt) expiry = new Date(meta.resellerExpiresAt);
      continue;
    }

    if ((p.type === "reseller_hire" || p.type === "reseller_renewal") && meta.resellerLogins) {
      logins = parseInt(meta.resellerLogins) || logins;
    }

    // Each "month" = exactly 30 days (matches VPN panel renewrev behavior)
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

    // Issue session token
    const token = crypto.randomBytes(32).toString("hex");
    resellerTokens.set(token, { username: reseller.login, expiresAt: Date.now() + RESELLER_TOKEN_TTL });

    // Also fetch reseller's payments from Supabase
    const { data: payments } = await getDb()
      .from("payments")
      .select("*")
      .eq("username", reseller.login)
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup"])
      .order("created_at", { ascending: true })
      .limit(50);

    const info = calcResellerInfo(payments || []);
    const points = await calculateLoyaltyPoints(reseller.login);
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
      .in("type", ["reseller_hire", "reseller_renewal", "reseller_setup"])
      .order("created_at", { ascending: true })
      .limit(50);

    const info = calcResellerInfo(payments || []);
    const points = await calculateLoyaltyPoints(username);
    const passwordHint2 = reseller.senha
      ? reseller.senha.slice(0, 2) + "•".repeat(Math.max(2, reseller.senha.length - 2))
      : null;
    const { senha: _s2, ...safeReseller2 } = reseller;
    res.json({ reseller: { ...safeReseller2, passwordHint: passwordHint2 }, payments: (payments || []).reverse(), expiresAt: info.expiresAt, logins: info.logins, points });
  } catch (e: any) {
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
    const loginsNum = Math.max(10, parseInt(logins));
    const monthsNum = Math.max(1, parseInt(months));

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
      metadata: { resellerUsername: username, resellerPassword: password, resellerWhatsapp: whatsapp || "", resellerLogins: loginsNum, resellerMonths: monthsNum, amount },
    });
    schedulePaymentCheck(mpRes.id.toString());

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
    const monthsNum = Math.max(1, parseInt(months) || 1);

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
    // Allow changing logins during renewal; minimum 10
    const logins = loginsParam ? Math.max(10, parseInt(loginsParam)) : Math.max(10, currentInfo.logins || 10);

    const points = await calculateLoyaltyPoints(username);
    let amount = calcResellerPrice(monthsNum, logins);
    let discountApplied = false;
    if (points >= 3) {
      amount = Math.round(amount * 0.8);
      discountApplied = true;
    }

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
      metadata: { resellerUsername: username, resellerLogins: logins, resellerMonths: monthsNum, amount, discountApplied, paidOnTime: true },
    });
    schedulePaymentCheck(mpRes.id.toString());

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
    const { data: request } = await getDb().from("change_requests").select("username").eq("id", id).maybeSingle();
    await getDb().from("change_requests")
      .update({ status: "rejeitado", approved_value: reason || "Recusado pelo administrador." })
      .eq("id", id);
    if (request) sendPush(request.username, "Solicitação recusada", reason ? `Motivo: ${reason}` : "Sua solicitação foi recusada.");
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
    res.json({ success: true });
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

    const result = resellers.map((r: any) => {
      const payments = (allPayments || []).filter((p: any) => p.username === r.login);
      const info = calcResellerInfo(payments);
      const { senha: _s, ...safeReseller } = r;
      return { ...safeReseller, expiresAt: info.expiresAt, logins: info.logins };
    });

    res.json(result);
  } catch (e: any) {
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

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Cron: Expiry Notifications ──────────────────────────────────────────────
// Runs every day at 9h BRT to warn users/resellers whose access expires in 3 or 1 day

cron.schedule("0 9 * * *", async () => {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Regular clients ──
  try {
    const { data: groups } = await db
      .from("user_groups")
      .select("username, expires_at")
      .not("expires_at", "is", null);

    for (const g of groups || []) {
      const exp = new Date(g.expires_at);
      exp.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((exp.getTime() - today.getTime()) / 86400000);
      if (daysLeft === 3) {
        sendPush(g.username, "Seu acesso vence em 3 dias", "Renove agora para não perder o acesso.");
      } else if (daysLeft === 1) {
        sendPush(g.username, "Seu acesso vence amanhã! ⚠️", "Renove hoje para manter seu acesso ativo.");
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

    const uniqueResellers = [...new Set((resellers || []).map((r: any) => r.username))];

    for (const username of uniqueResellers) {
      const { data: payments } = await db
        .from("payments")
        .select("*")
        .eq("username", username)
        .eq("status", "approved");

      const info = calcResellerInfo(payments || []);
      if (!info.expiresAt) continue;

      const exp = new Date(info.expiresAt);
      exp.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((exp.getTime() - today.getTime()) / 86400000);
      if (daysLeft === 3) {
        sendPush(username, "Sua revenda vence em 3 dias", "Renove sua revenda para não perder o acesso.");
      } else if (daysLeft === 1) {
        sendPush(username, "Sua revenda vence amanhã! ⚠️", "Renove hoje para manter sua revenda ativa.");
      }
    }
  } catch (e) { console.error("[cron] reseller expiry check failed:", e); }

  // ── Trial users (2-day trial) ──
  try {
    const { data: trialDevices } = await db.from("devices").select("username, created_at");
    for (const d of trialDevices || []) {
      const exp = new Date(d.created_at);
      exp.setDate(exp.getDate() + 2);
      exp.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((exp.getTime() - today.getTime()) / 86400000);
      if (daysLeft === 1) {
        sendPush(d.username, "Seu teste gratuito vence amanhã! ⏰", "Gostou? Assine agora para não perder o acesso.");
      } else if (daysLeft === 0) {
        sendPush(d.username, "Seu teste gratuito venceu hoje", "Assine agora e continue usando sem interrupções.");
      }
    }
  } catch (e) { console.error("[cron] trial expiry check failed:", e); }
}, { timezone: "America/Sao_Paulo" });

// ─── Background: sync pending/cancelled payments every 10 minutes ────────────
setInterval(async () => {
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // last 48h
    const { data: stale } = await getDb()
      .from("payments")
      .select("*")
      .in("status", ["pending", "cancelled"])
      .gte("created_at", since);

    if (!stale || stale.length === 0) return;

    const paymentApi = new Payment(getMpClient());
    for (const p of stale) {
      try {
        const mpRes = await paymentApi.get({ id: p.id });
        if (mpRes.status === "approved") {
          await approvePayment(p);
          console.log(`[bg-sync] Recovered payment ${p.id} for ${p.username}`);
        }
      } catch (e) {
        // Silently skip individual failures
      }
    }
  } catch (e) {
    console.warn("[bg-sync] payment sync error:", e);
  }
}, 10 * 60 * 1000); // every 10 minutes

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
