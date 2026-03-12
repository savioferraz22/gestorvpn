import express from "express";
import http from "http";
import { MercadoPagoConfig, Payment } from "mercadopago";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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

// ─── Admin Auth ────────────────────────────────────────────────────────────
// Tokens are stored in memory with a TTL of 24h. Never exposed in client JS.
const adminTokens = new Map<string, number>(); // token -> expiresAt (ms)

const ADMIN_TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours

function purgeExpiredTokens() {
  const now = Date.now();
  for (const [token, exp] of adminTokens.entries()) {
    if (now > exp) adminTokens.delete(token);
  }
}

function requireAdminAuth(req: any, res: any, next: any) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  purgeExpiredTokens();
  if (!token || !adminTokens.has(token)) {
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
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL;
  adminTokens.set(token, expiresAt);
  res.json({ token, expiresAt: new Date(expiresAt).toISOString() });
});

// Protect all /api/admin/* routes (except /api/admin/auth itself)
app.use("/api/admin", (req: any, res: any, next: any) => {
  if (req.path === "/auth" && req.method === "POST") return next();
  requireAdminAuth(req, res, next);
});

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

async function approvePayment(paymentRecord: any) {
  const paymentId = paymentRecord.id;
  const db = getDb();

  // Update DB status
  await db.from("payments").update({ status: "approved", paid_at: new Date().toISOString() }).eq("id", paymentId);

  if (paymentRecord.type === "new_device") {
    const metadata = paymentRecord.metadata || {};
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
        const vpnRes = await fetch(VPN_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        const vpnText = await vpnRes.text();
        console.log(`VPN Create Response for ${newUsername}:`, vpnText);
      } catch (e) {
        console.error(`Failed to create VPN user ${newUsername}:`, e);
      }

      // Add to group
      await db.from("user_groups").insert({ group_id: groupId, username: newUsername });
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
    for (const user of usersToRenew) {
      for (let i = 0; i < monthsToRenew; i++) {
        const params = new URLSearchParams();
        params.append("passapi", VPN_API_KEY);
        params.append("module", "renewuser");
        params.append("user", user);

        try {
          const vpnRes = await fetch(VPN_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });
          const vpnText = await vpnRes.text();
          console.log(`VPN Renew Response for ${user} (Month ${i + 1}):`, vpnText);
        } catch (e) {
          console.error(`Failed to renew VPN user ${user}:`, e);
        }
      }
    }
  }

  // Handle Loyalty Points
  const metadata = paymentRecord.metadata || {};
  if (metadata.discountApplied) {
    // Reset points
    await db.from("loyalty_points").update({ points: 0, updated_at: new Date().toISOString() }).eq("username", paymentRecord.username);
  } else {
    // Add point if paid on time or in advance
    if (metadata.paidOnTime) {
      const { data: lp } = await db.from("loyalty_points").select("points").eq("username", paymentRecord.username).maybeSingle();
      if (lp) {
        await db.from("loyalty_points").update({ points: lp.points + 1, updated_at: new Date().toISOString() }).eq("username", paymentRecord.username);
      } else {
        await db.from("loyalty_points").insert({ username: paymentRecord.username, points: 1 });
      }
    }
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

    // Get loyalty points
    const { data: loyaltyRecord } = await getDb().from("loyalty_points").select("points").eq("username", username).maybeSingle();
    const points = loyaltyRecord ? loyaltyRecord.points : 0;

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

    // Get group-wide active change requests
    const { data: changeRequests } = await getDb().from("change_requests").select("*").in("username", groupUsernames).eq("status", "aguardando");

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

    // Get last payment date to calculate 7 days
    const { data: lastPayment } = await getDb().from("payments")
      .select("created_at, paid_at")
      .eq("username", username)
      .eq("status", "approved")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    let lastPaymentDate = null;
    if (lastPayment) {
      lastPaymentDate = lastPayment.paid_at || lastPayment.created_at;
    }

    // Get payment history
    const { data: payments } = await getDb().from("payments").select("*").eq("username", username).order("created_at", { ascending: false });

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
      return res.status(403).json({ error: "Este aparelho já gerou um teste gratuito." });
    }

    // Check if user exists
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

    // 1. Get main user expiration
    const users = await fetchVpnUsers();
    const mainUser = users.find((u: any) => u.login === mainUsername);

    if (!mainUser) {
      return res.status(404).json({ error: "Usuário principal não encontrado" });
    }

    // Calculate remaining days
    const expirationDate = new Date(mainUser.expira.replace(' ', 'T') + '-03:00'); // Force -03:00 for Brazil
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
        email: process.env.MP_EMAIL || "pagamento@cloudbrasil.shop",
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

    // Check loyalty points
    const { data: loyaltyRecord } = await getDb().from("loyalty_points").select("points").eq("username", username).maybeSingle();
    const points = loyaltyRecord ? loyaltyRecord.points : 0;

    let transactionAmount = plan.plan_price;
    let discountApplied = false;

    if (points >= 3) {
      transactionAmount = Number((transactionAmount * 0.8).toFixed(2)); // 20% discount
      discountApplied = true;
    }

    // Check if paying on time or in advance
    let paidOnTime = false;
    if (userExists.expira) {
      const expirationDate = new Date(userExists.expira.replace(' ', 'T') + '-03:00'); // Force -03:00 for Brazil
      const now = new Date();
      if (now <= expirationDate) {
        paidOnTime = true;
      }
    }

    // Generate Pix via Mercado Pago
    const client = getMpClient();
    const payment = new Payment(client);

    const paymentData = {
      transaction_amount: transactionAmount,
      description: `Renovação VPN - Grupo ${groupRecord.group_id.substring(0, 8)}${discountApplied ? ' (Desconto Fidelidade)' : ''}`,
      payment_method_id: "pix",
      payer: {
        email: "pagamento@cloudbrasil.shop", // Dummy email as required by MP
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

      if (diffDaysFromCurrent > 15) {
        return res.status(400).json({ error: "A nova data não pode ter mais de 15 dias de diferença da data atual." });
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

    // Get username to reset points
    const { data: refund } = await getDb().from("refund_requests").select("username").eq("id", id).maybeSingle();
    if (refund) {
      await getDb().from("loyalty_points").update({ points: 0, updated_at: new Date().toISOString() }).eq("username", refund.username);
    }

    await getDb().from("refund_requests").update({ 
      status: 'realizado', 
      refunded_at: refundedAt || new Date().toISOString() 
    }).eq("id", id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/refunds/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    await getDb().from("refund_requests").update({ status: 'rejeitado' }).eq("id", id);
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
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/change-requests/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    await getDb().from("change_requests").update({ status: 'rejeitado' }).eq("id", id);
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

    // Get payments
    const { data: payments } = await getDb().from("payments").select("*").eq("username", username).order("created_at", { ascending: false });

    // Get refunds
    const { data: refunds } = await getDb().from("refund_requests").select("*").eq("username", username).order("created_at", { ascending: false });

    // Get change requests
    const { data: changeRequests } = await getDb().from("change_requests").select("*").eq("username", username).order("created_at", { ascending: false });

    // Get plan info
    const { data: group } = await getDb().from("user_groups").select("*").eq("username", username).maybeSingle();
    let plan = null;
    if (group) {
      const { data: p } = await getDb().from("group_plans").select("*").eq("group_id", group.group_id).maybeSingle();
      plan = p;
    }

    // Get loyalty points
    const { data: loyaltyRecord } = await getDb().from("loyalty_points").select("points").eq("username", username).maybeSingle();
    const points = loyaltyRecord ? loyaltyRecord.points : 0;

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
      referrals: referrals || []
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
    const totalSales = (payments || []).length;
    const totalTests = (devices || []).length;

    const salesByDate: Record<string, { count: number, revenue: number }> = {};
    const testsByDate: Record<string, number> = {};
    
    dates.forEach(d => {
      salesByDate[d] = { count: 0, revenue: 0 };
      testsByDate[d] = 0;
    });

    (payments || []).forEach(p => {
      let amount = 0;
      if (p.metadata) {
        // Handle metadata as object or string (sometimes needed depending on driver/JSONB)
        const metadata = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
        amount = Number(metadata.amount) || Number(p.amount) || 0;
      }
      totalRevenue += amount;

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

    const convertedUsers = new Set((payments || [])
      .filter(p => p.type === 'new_device')
      .map(p => p.username)
    );
    const totalConverted = convertedUsers.size;

    const conversionRate = totalTests > 0 ? ((totalConverted / totalTests) * 100).toFixed(1) : "0.0";

    res.json({
      totalRevenue,
      totalSales,
      totalTests,
      conversionRate,
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

    res.json({ success: true, messageId });
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
