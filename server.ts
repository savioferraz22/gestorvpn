import express from "express";
import http from "http";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { MercadoPagoConfig, Payment } from "mercadopago";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// --- Supabase Backup Logic ---
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    console.log("Downloading database from Supabase...");
    const { data, error } = await supabase.storage.from('sqlite_backup').download('database.sqlite');
    if (data) {
      const buffer = await data.arrayBuffer();
      fs.writeFileSync('database.sqlite', Buffer.from(buffer));
      console.log("Database downloaded successfully.");
    } else {
      console.log("No existing database found in Supabase or error:", error?.message);
    }
  } catch (e) {
    console.error("Error downloading database:", e);
  }
}

// Database setup
const db = new Database("database.sqlite");

if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let uploadTimeout: NodeJS.Timeout;

  const scheduleUpload = () => {
    clearTimeout(uploadTimeout);
    uploadTimeout = setTimeout(async () => {
      try {
        console.log("Uploading database to Supabase...");
        const buffer = fs.readFileSync('database.sqlite');
        const { error } = await supabase.storage.from('sqlite_backup').upload('database.sqlite', buffer, { upsert: true });
        if (error) console.error("Error uploading database:", error.message);
        else console.log("Database uploaded successfully.");
      } catch (e) {
        console.error("Failed to upload database:", e);
      }
    }, 5000);
  };

  const originalPrepare = db.prepare.bind(db);
  db.prepare = (query: string) => {
    const stmt = originalPrepare(query);
    const originalRun = stmt.run.bind(stmt);
    stmt.run = (...args: any[]) => {
      const result = originalRun(...args);
      scheduleUpload();
      return result;
    };
    return stmt;
  };

  const originalExec = db.exec.bind(db);
  db.exec = (query: string) => {
    const result = originalExec(query);
    scheduleUpload();
    return result;
  };
}

const VPN_API_URL = "https://pweb.cloudbrasil.shop/core/apiatlas.php";
const VPN_API_KEY = "LTm2H0TnZwKY560Vqj7gfbxeIL";

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

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    status TEXT NOT NULL,
    type TEXT DEFAULT 'renewal',
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS trusted_devices (
    device_id TEXT,
    username TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, username)
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS ticket_messages (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
  );
  CREATE TABLE IF NOT EXISTS user_groups (
    group_id TEXT NOT NULL,
    username TEXT NOT NULL,
    PRIMARY KEY (group_id, username)
  );
  CREATE TABLE IF NOT EXISTS group_plans (
    group_id TEXT PRIMARY KEY,
    plan_type TEXT NOT NULL,
    plan_months INTEGER NOT NULL,
    plan_devices INTEGER NOT NULL,
    plan_price REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_username TEXT NOT NULL,
    referred_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'testing', -- testing, paid, bonus_received
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS loyalty_points (
    username TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS refund_requests (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    pix_type TEXT NOT NULL,
    pix_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aguardando',
    refunded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS date_change_requests (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    new_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aguardando',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS change_requests (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    type TEXT NOT NULL,
    requested_value TEXT NOT NULL,
    approved_value TEXT,
    status TEXT NOT NULL DEFAULT 'aguardando',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  const oldRequests = db.prepare("SELECT * FROM date_change_requests").all() as any[];
  const insertReq = db.prepare("INSERT OR IGNORE INTO change_requests (id, username, type, requested_value, status, created_at) VALUES (?, ?, 'date', ?, ?, ?)");
  for (const req of oldRequests) {
    insertReq.run(req.id, req.username, req.new_date, req.status, req.created_at);
  }
} catch (e) { }

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

  // Update DB
  try {
    db.prepare("ALTER TABLE payments ADD COLUMN paid_at DATETIME").run();
  } catch (e) { }

  const updateStmt = db.prepare("UPDATE payments SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?");
  updateStmt.run("approved", paymentId);

  if (paymentRecord.type === "new_device") {
    const metadata = paymentRecord.metadata ? JSON.parse(paymentRecord.metadata) : {};
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

      const vpnRes = await fetch(VPN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const vpnText = await vpnRes.text();
      console.log(`VPN Create Response for ${newUsername}:`, vpnText);

      // Add to group
      const insertGroupUser = db.prepare("INSERT INTO user_groups (group_id, username) VALUES (?, ?)");
      insertGroupUser.run(groupId, newUsername);
    }
    return;
  }

  // Get group plan and users
  const groupId = paymentRecord.group_id;
  let usersToRenew = [paymentRecord.username];
  let monthsToRenew = 1;

  if (groupId) {
    const plan = db.prepare("SELECT * FROM group_plans WHERE group_id = ?").get(groupId) as any;
    if (plan) {
      monthsToRenew = plan.plan_months;
    }
    const groupUsers = db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(groupId) as any[];
    if (groupUsers.length > 0) {
      usersToRenew = groupUsers.map(u => u.username);
    }
  }

  // Renew user in VPN Panel
  for (const user of usersToRenew) {
    for (let i = 0; i < monthsToRenew; i++) {
      const params = new URLSearchParams();
      params.append("passapi", VPN_API_KEY);
      params.append("module", "renewuser");
      params.append("user", user);

      const vpnRes = await fetch(VPN_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const vpnText = await vpnRes.text();
      console.log(`VPN Renew Response for ${user} (Month ${i + 1}):`, vpnText);
    }
  }

  // Handle Loyalty Points
  const metadata = paymentRecord.metadata ? JSON.parse(paymentRecord.metadata) : {};
  if (metadata.discountApplied) {
    // Reset points
    db.prepare("UPDATE loyalty_points SET points = 0, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(paymentRecord.username);
  } else {
    // Add point if paid on time or in advance
    if (metadata.paidOnTime) {
      db.prepare("INSERT INTO loyalty_points (username, points) VALUES (?, 1) ON CONFLICT(username) DO UPDATE SET points = points + 1, updated_at = CURRENT_TIMESTAMP").run(paymentRecord.username);
    }
  }

  // Handle Referral Bonus
  // Check if this user was referred and the status is 'testing'
  const referral = db.prepare("SELECT * FROM referrals WHERE referred_username = ? AND status = 'testing'").get(paymentRecord.username) as any;
  if (referral) {
    // Give 1 month free to referrer
    const params = new URLSearchParams();
    params.append("passapi", VPN_API_KEY);
    params.append("module", "renewuser");
    params.append("user", referral.referrer_username);

    await fetch(VPN_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    // Update referral status
    db.prepare("UPDATE referrals SET status = 'bonus_received' WHERE id = ?").run(referral.id);
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
app.get("/api/group/:username", (req, res) => {
  try {
    const { username } = req.params;

    // Find if user is in a group
    let stmt = db.prepare("SELECT group_id FROM user_groups WHERE username = ?");
    let groupRecord = stmt.get(username) as any;

    let groupId;
    if (!groupRecord) {
      // Create new group for user
      groupId = crypto.randomUUID();
      db.prepare("INSERT INTO user_groups (group_id, username) VALUES (?, ?)").run(groupId, username);
      // Default plan: 1 month, 1 device, R$ 15
      db.prepare("INSERT INTO group_plans (group_id, plan_type, plan_months, plan_devices, plan_price) VALUES (?, ?, ?, ?, ?)").run(groupId, 'custom', 1, 1, 15);
    } else {
      groupId = groupRecord.group_id;
    }

    // Get all users in group
    const users = db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(groupId) as any[];
    const plan = db.prepare("SELECT * FROM group_plans WHERE group_id = ?").get(groupId) as any;

    res.json({
      groupId,
      users: users.map(u => u.username),
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
    const groupUsers = db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(groupId) as any[];
    const usernames = groupUsers.map(u => u.username);

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
    const existingGroup = db.prepare("SELECT group_id FROM user_groups WHERE username = ?").get(newUsername) as any;
    if (existingGroup && existingGroup.group_id !== groupId) {
      // Remove from old group
      db.prepare("DELETE FROM user_groups WHERE username = ?").run(newUsername);
      // If old group is empty, delete its plan
      const oldGroupUsers = db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(existingGroup.group_id);
      if (oldGroupUsers.length === 0) {
        db.prepare("DELETE FROM group_plans WHERE group_id = ?").run(existingGroup.group_id);
      }
    }

    // Add to new group
    db.prepare("INSERT OR IGNORE INTO user_groups (group_id, username) VALUES (?, ?)").run(groupId, newUsername);

    // Automatically update plan price based on new device count
    const groupUsers2 = db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(groupId);
    const numDevices = groupUsers2.length;
    if (numDevices >= 1) {
      const currentPlan = db.prepare("SELECT * FROM group_plans WHERE group_id = ?").get(groupId) as any;
      const months = currentPlan ? currentPlan.plan_months : 1;
      const newPrice = calculatePlanPrice(months, numDevices);
      db.prepare("UPDATE group_plans SET plan_type = 'custom', plan_devices = ?, plan_price = ? WHERE group_id = ?").run(numDevices, newPrice, groupId);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error adding to group:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/group/remove", (req, res) => {
  try {
    const { groupId, usernameToRemove } = req.body;

    // Remove from group
    db.prepare("DELETE FROM user_groups WHERE group_id = ? AND username = ?").run(groupId, usernameToRemove);

    // Automatically update plan for remaining group members
    const groupUsers = db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(groupId);
    const plan2 = db.prepare("SELECT * FROM group_plans WHERE group_id = ?").get(groupId) as any;
    const remainingMonths = plan2 ? plan2.plan_months : 1;
    const newNumDevices = groupUsers.length;
    const newGroupPrice = calculatePlanPrice(remainingMonths, newNumDevices);
    db.prepare("UPDATE group_plans SET plan_type = 'custom', plan_devices = ?, plan_price = ? WHERE group_id = ?").run(newNumDevices, newGroupPrice, groupId);

    // Create a new group for the removed user with default plan
    const newGroupId = crypto.randomUUID();
    db.prepare("INSERT INTO user_groups (group_id, username) VALUES (?, ?)").run(newGroupId, usernameToRemove);
    db.prepare("INSERT INTO group_plans (group_id, plan_type, plan_months, plan_devices, plan_price) VALUES (?, ?, ?, ?, ?)").run(newGroupId, 'custom', 1, 1, 15);

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error removing from group:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/group/plan", (req, res) => {
  try {
    const { groupId, plan_type, plan_months, plan_devices, plan_price } = req.body;

    db.prepare("UPDATE group_plans SET plan_type = ?, plan_months = ?, plan_devices = ?, plan_price = ? WHERE group_id = ?")
      .run(plan_type, plan_months, plan_devices, plan_price, groupId);

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
    db.prepare("INSERT OR IGNORE INTO trusted_devices (device_id, username) VALUES (?, ?)").run(deviceId, username);

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
      const stmt = db.prepare("SELECT * FROM trusted_devices WHERE device_id = ? AND username = ?");
      const trusted = stmt.get(deviceId, username);
      if (trusted) isTrusted = true;
    }

    // Get loyalty points
    const loyaltyRecord = db.prepare("SELECT points FROM loyalty_points WHERE username = ?").get(username) as any;
    const points = loyaltyRecord ? loyaltyRecord.points : 0;

    // Get referrals
    const referrals = db.prepare("SELECT * FROM referrals WHERE referrer_username = ? ORDER BY created_at DESC").all(username);

    // Get group ID to fetch group-wide requests
    const groupRecord = db.prepare("SELECT group_id FROM user_groups WHERE username = ?").get(username) as any;
    const groupId = groupRecord ? groupRecord.group_id : null;
    const groupUsernames = groupId 
      ? (db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(groupId) as any[]).map(u => u.username)
      : [username];

    // Get group-wide active refund request
    const refundRequest = groupId
      ? db.prepare("SELECT * FROM refund_requests WHERE username IN (" + groupUsernames.map(() => "?").join(",") + ") AND status = 'aguardando'").get(...groupUsernames)
      : db.prepare("SELECT * FROM refund_requests WHERE username = ? AND status = 'aguardando'").get(username);

    // Get group-wide active change requests
    const changeRequests = groupId
      ? db.prepare("SELECT * FROM change_requests WHERE username IN (" + groupUsernames.map(() => "?").join(",") + ") AND status = 'aguardando'").all(...groupUsernames)
      : db.prepare("SELECT * FROM change_requests WHERE username = ? AND status = 'aguardando'").all(username);

    // Get recent date change request (last 30 days) for the group
    const recentDateChangeRequest = groupId
      ? db.prepare("SELECT * FROM change_requests WHERE username IN (" + groupUsernames.map(() => "?").join(",") + ") AND type = 'date' AND created_at >= datetime('now', '-30 days') ORDER BY created_at DESC LIMIT 1").get(...groupUsernames)
      : db.prepare("SELECT * FROM change_requests WHERE username = ? AND type = 'date' AND created_at >= datetime('now', '-30 days') ORDER BY created_at DESC LIMIT 1").get(username);

    // Get last payment date to calculate 7 days
    try {
      db.prepare("ALTER TABLE payments ADD COLUMN paid_at DATETIME").run();
    } catch (e) { }

    const lastPayment = db.prepare("SELECT created_at, paid_at FROM payments WHERE username = ? AND status = 'approved' ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 1").get(username) as any;
    let lastPaymentDate = null;
    if (lastPayment) {
      let dateStr = lastPayment.paid_at || lastPayment.created_at;
      // SQLite CURRENT_TIMESTAMP is 'YYYY-MM-DD HH:MM:SS', replace space with T for ISO format
      dateStr = dateStr.replace(' ', 'T');
      lastPaymentDate = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    }

    // Get payment history
    const payments = db.prepare("SELECT * FROM payments WHERE username = ? ORDER BY created_at DESC").all(username);

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

    // Check password (usually 'senha' or 'pass' in these panels)
    const userPass = user.senha || user.pass || user.password;

    if (userPass !== password) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    // Trust device
    const stmt = db.prepare("INSERT OR IGNORE INTO trusted_devices (device_id, username) VALUES (?, ?)");
    stmt.run(deviceId, username);

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
    const stmt = db.prepare("SELECT * FROM devices WHERE device_id = ?");
    const existingDevice = stmt.get(deviceId);
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
    const insertDevice = db.prepare("INSERT OR IGNORE INTO devices (device_id, username) VALUES (?, ?)");
    insertDevice.run(deviceId, username);

    // Trust device automatically
    const insertTrusted = db.prepare("INSERT OR IGNORE INTO trusted_devices (device_id, username) VALUES (?, ?)");
    insertTrusted.run(deviceId, username);

    // Save referral if exists
    if (referrer) {
      const referralId = crypto.randomUUID();
      const insertReferral = db.prepare("INSERT INTO referrals (id, referrer_username, referred_username) VALUES (?, ?, ?)");
      insertReferral.run(referralId, referrer, username);
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
    const expirationDate = new Date(mainUser.expira.replace(' ', 'T'));
    const now = new Date();
    const diffTime = Math.max(0, expirationDate.getTime() - now.getTime());
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Calculate price difference
    const groupUsers = db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(groupId);
    const currentDevices = groupUsers.length;

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
        email: "pagamento@cloudbrasil.shop",
      },
      notification_url: `${process.env.APP_URL}/api/webhook`,
    };

    const mpRes = await payment.create({ body: paymentData });

    if (!mpRes.id || !mpRes.point_of_interaction?.transaction_data?.qr_code) {
      throw new Error("Erro ao gerar Pix no Mercado Pago");
    }

    try {
      db.prepare("ALTER TABLE payments ADD COLUMN group_id TEXT").run();
    } catch (e) { }
    try {
      db.prepare("ALTER TABLE payments ADD COLUMN type TEXT DEFAULT 'renewal'").run();
    } catch (e) { }
    try {
      db.prepare("ALTER TABLE payments ADD COLUMN metadata TEXT").run();
    } catch (e) { }

    const stmt = db.prepare("INSERT INTO payments (id, username, status, group_id, type, metadata) VALUES (?, ?, ?, ?, ?, ?)");
    stmt.run(
      mpRes.id.toString(),
      mainUsername,
      "pending",
      groupId,
      "new_device",
      JSON.stringify({ newUsername, remainingDays, groupId, amount: proratedPrice })
    );

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
    db.prepare("INSERT OR IGNORE INTO user_groups (group_id, username) VALUES (?, ?)").run(groupId, newUsername);

    // Update plan
    const groupUsers = db.prepare("SELECT username FROM user_groups WHERE group_id = ?").all(groupId);
    const numDevices = groupUsers.length;
    let newPrice = 20;
    if (numDevices === 2) newPrice = 35;
    else if (numDevices === 3) newPrice = 50;
    else if (numDevices === 4) newPrice = 60;
    else if (numDevices === 5) newPrice = 70;
    else if (numDevices >= 6) newPrice = 80;

    db.prepare("UPDATE group_plans SET plan_type = 'devices', plan_devices = ?, plan_price = ? WHERE group_id = ?").run(numDevices, newPrice, groupId);

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
    const groupRecord = db.prepare("SELECT group_id FROM user_groups WHERE username = ?").get(username) as any;
    if (!groupRecord) {
      return res.status(404).json({ error: "Grupo não encontrado" });
    }
    const plan = db.prepare("SELECT * FROM group_plans WHERE group_id = ?").get(groupRecord.group_id) as any;
    if (!plan) {
      return res.status(404).json({ error: "Plano não encontrado" });
    }

    // Check loyalty points
    const loyaltyRecord = db.prepare("SELECT points FROM loyalty_points WHERE username = ?").get(username) as any;
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
      const expirationDate = new Date(userExists.expira.replace(' ', 'T'));
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

    try {
      db.prepare("ALTER TABLE payments ADD COLUMN group_id TEXT").run();
    } catch (e) { }
    try {
      db.prepare("ALTER TABLE payments ADD COLUMN type TEXT DEFAULT 'renewal'").run();
    } catch (e) { }
    try {
      db.prepare("ALTER TABLE payments ADD COLUMN metadata TEXT").run();
    } catch (e) { }

    const metadata = JSON.stringify({ discountApplied, paidOnTime, amount: transactionAmount });
    const stmt = db.prepare("INSERT INTO payments (id, username, status, group_id, type, metadata) VALUES (?, ?, ?, ?, ?, ?)");
    stmt.run(mpRes.id.toString(), username, "pending", groupRecord.group_id, "renewal", metadata);

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

    const stmt = db.prepare("SELECT * FROM payments WHERE id = ?");
    const paymentRecord = stmt.get(paymentId) as any;

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
      const paymentId = data.id;

      const stmt = db.prepare("SELECT * FROM payments WHERE id = ?");
      const paymentRecord = stmt.get(paymentId) as any;

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
app.get("/api/tickets/:username", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM tickets WHERE username = ? ORDER BY created_at DESC");
    const tickets = stmt.all(req.params.username);
    res.json(tickets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Refund and Date Change Requests
app.post("/api/refund", (req, res) => {
  try {
    const { username, pixType, pixKey } = req.body;
    const id = crypto.randomUUID();

    // Check if already requested
    const existing = db.prepare("SELECT * FROM refund_requests WHERE username = ? AND status = 'aguardando'").get(username);
    if (existing) {
      return res.status(400).json({ error: "Já existe uma solicitação de reembolso em andamento." });
    }

    const stmt = db.prepare("INSERT INTO refund_requests (id, username, pix_type, pix_key) VALUES (?, ?, ?, ?)");
    stmt.run(id, username, pixType, pixKey);
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
    const existingRequest = db.prepare("SELECT * FROM change_requests WHERE username = ? AND type = ? AND status = 'aguardando'").get(username, action);
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

      const lastChange = db.prepare("SELECT created_at FROM change_requests WHERE username = ? AND type = 'date' AND status = 'aprovado' ORDER BY created_at DESC LIMIT 1").get(username) as any;
      if (lastChange) {
        const lastChangeDate = new Date(lastChange.created_at);
        const daysSinceLastChange = Math.ceil((now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceLastChange < 30) {
          return res.status(400).json({ error: "Você só pode alterar a data uma vez a cada 30 dias." });
        }
      }
    }

    const id = crypto.randomUUID();
    db.prepare("INSERT INTO change_requests (id, username, type, requested_value, status) VALUES (?, ?, ?, ?, 'aguardando')").run(id, username, action, newValue);

    res.json({ success: true, message: "Solicitação enviada com sucesso. Aguarde a aprovação do administrador." });
  } catch (error: any) {
    console.error("Error requesting access update:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel change request
app.delete("/api/user/change-requests/:id", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("DELETE FROM change_requests WHERE id = ? AND status = 'aguardando'").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel refund request
app.delete("/api/user/refunds/:id", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("DELETE FROM refund_requests WHERE id = ? AND status = 'aguardando'").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoints for requests
app.get("/api/admin/payments", (req, res) => {
  try {
    const payments = db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
    res.json(payments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/refunds", (req, res) => {
  try {
    const refunds = db.prepare("SELECT * FROM refund_requests ORDER BY created_at DESC").all();
    res.json(refunds);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/refunds/:id/approve", (req, res) => {
  try {
    const { id } = req.params;
    const { refundedAt } = req.body;

    try {
      db.prepare("ALTER TABLE refund_requests ADD COLUMN refunded_at DATETIME").run();
    } catch (e) { }

    db.prepare("UPDATE refund_requests SET status = 'realizado', refunded_at = ? WHERE id = ?").run(refundedAt || new Date().toISOString(), id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/refunds/:id/reject", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("UPDATE refund_requests SET status = 'rejeitado' WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/change-requests", (req, res) => {
  try {
    const requests = db.prepare("SELECT * FROM change_requests ORDER BY created_at DESC").all();
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/change-requests/:id/approve", (req, res) => {
  try {
    const { id } = req.params;
    const { approvedValue } = req.body;

    const request = db.prepare("SELECT * FROM change_requests WHERE id = ?").get(id) as any;
    if (!request) {
      return res.status(404).json({ error: "Solicitação não encontrada" });
    }

    const finalValue = approvedValue || request.requested_value;

    if (request.type === 'username') {
      const oldUsername = request.username;
      const newUsername = finalValue;

      const transaction = db.transaction(() => {
        db.prepare("UPDATE payments SET username = ? WHERE username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE devices SET username = ? WHERE username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE tickets SET username = ? WHERE username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE ticket_messages SET sender = ? WHERE sender = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE loyalty_points SET username = ? WHERE username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE referrals SET referrer_username = ? WHERE referrer_username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE referrals SET referred_username = ? WHERE referred_username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE trusted_devices SET username = ? WHERE username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE user_groups SET username = ? WHERE username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE refund_requests SET username = ? WHERE username = ?").run(newUsername, oldUsername);
        db.prepare("UPDATE change_requests SET username = ? WHERE username = ?").run(newUsername, oldUsername);
      });
      transaction();
    }

    db.prepare("UPDATE change_requests SET status = 'aprovado', approved_value = ? WHERE id = ?").run(finalValue, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/change-requests/:id/reject", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("UPDATE change_requests SET status = 'rejeitado' WHERE id = ?").run(id);
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
    const devices = db.prepare("SELECT * FROM devices WHERE username = ?").all(username);

    // Get payments
    const payments = db.prepare("SELECT * FROM payments WHERE username = ? ORDER BY created_at DESC").all(username);

    // Get refunds
    const refunds = db.prepare("SELECT * FROM refund_requests WHERE username = ? ORDER BY created_at DESC").all(username);

    // Get change requests
    const changeRequests = db.prepare("SELECT * FROM change_requests WHERE username = ? ORDER BY created_at DESC").all(username);

    // Get plan info
    const group = db.prepare("SELECT * FROM user_groups WHERE username = ?").get(username) as any;
    let plan = null;
    if (group) {
      plan = db.prepare("SELECT * FROM group_plans WHERE group_id = ?").get(group.group_id);
    }

    // Get loyalty points
    const loyaltyRecord = db.prepare("SELECT points FROM loyalty_points WHERE username = ?").get(username) as any;
    const points = loyaltyRecord ? loyaltyRecord.points : 0;

    // Get referrals
    const referrals = db.prepare("SELECT * FROM referrals WHERE referrer_username = ? ORDER BY created_at DESC").all(username);

    res.json({
      user,
      devices,
      payments,
      refunds,
      changeRequests,
      plan,
      points,
      referrals
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/reports", (req, res) => {
  try {
    const { period = 30 } = req.query;
    const days = Number(period);

    // Get tests (devices)
    const tests = db.prepare(`
      SELECT date(created_at) as date, count(*) as count 
      FROM devices 
      WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `).all(days);

    // Get sales (payments)
    const sales = db.prepare(`
      SELECT date(COALESCE(paid_at, created_at)) as date, count(*) as count, metadata
      FROM payments 
      WHERE status = 'approved' AND COALESCE(paid_at, created_at) >= date('now', '-' || ? || ' days')
      GROUP BY date(COALESCE(paid_at, created_at)), metadata
      ORDER BY date(COALESCE(paid_at, created_at)) ASC
    `).all(days);

    // Process sales to get revenue
    const salesByDate: Record<string, { count: number, revenue: number }> = {};
    let totalRevenue = 0;
    let totalSales = 0;

    sales.forEach((s: any) => {
      if (!salesByDate[s.date]) {
        salesByDate[s.date] = { count: 0, revenue: 0 };
      }
      salesByDate[s.date].count += s.count;
      totalSales += s.count;

      let amount = 0;
      try {
        if (s.metadata) {
          const meta = JSON.parse(s.metadata);
          if (meta.amount) amount = Number(meta.amount) * s.count;
        }
      } catch (e) { }

      salesByDate[s.date].revenue += amount;
      totalRevenue += amount;
    });

    const salesHistory = Object.keys(salesByDate).map(date => ({
      date,
      count: salesByDate[date].count,
      revenue: salesByDate[date].revenue
    })).sort((a, b) => a.date.localeCompare(b.date));

    const totalTests = db.prepare("SELECT count(*) as count FROM devices WHERE created_at >= date('now', '-' || ? || ' days')").get(days) as any;

    res.json({
      totalRevenue,
      totalSales,
      totalTests: totalTests.count,
      conversionRate: totalTests.count > 0 ? ((totalSales / totalTests.count) * 100).toFixed(2) : 0,
      testsHistory: tests,
      salesHistory
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tickets", (req, res) => {
  try {
    const { username, category, subject, message } = req.body;
    const ticketId = crypto.randomUUID();
    const messageId = crypto.randomUUID();

    const insertTicket = db.prepare("INSERT INTO tickets (id, username, category, subject) VALUES (?, ?, ?, ?)");
    insertTicket.run(ticketId, username, category, subject);

    const insertMessage = db.prepare("INSERT INTO ticket_messages (id, ticket_id, sender, message) VALUES (?, ?, ?, ?)");
    insertMessage.run(messageId, ticketId, "user", message);

    res.json({ success: true, ticketId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tickets/:username", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM tickets WHERE username = ? ORDER BY created_at DESC");
    const tickets = stmt.all(req.params.username);
    res.json(tickets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tickets/:id/messages", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC");
    const messages = stmt.all(req.params.id);
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tickets/:id/messages", (req, res) => {
  try {
    const { id } = req.params;
    const { sender, message } = req.body;
    const messageId = crypto.randomUUID();

    const insertMessage = db.prepare("INSERT INTO ticket_messages (id, ticket_id, sender, message) VALUES (?, ?, ?, ?)");
    insertMessage.run(messageId, id, sender, message);

    const status = sender === "admin" ? "answered" : "open";
    db.prepare("UPDATE tickets SET status = ? WHERE id = ?").run(status, id);

    res.json({ success: true, messageId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/tickets/:id/status", (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare("UPDATE tickets SET status = ? WHERE id = ?").run(status, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- ADMIN API ROUTES ---

app.get("/api/admin/tickets", (req, res) => {
  try {
    const allTickets = db.prepare("SELECT * FROM tickets ORDER BY created_at DESC").all();
    res.json(allTickets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/payments", (req, res) => {
  try {
    const allPayments = db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
    res.json(allPayments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/refunds", (req, res) => {
  try {
    const allRefunds = db.prepare("SELECT * FROM refund_requests ORDER BY created_at DESC").all();
    res.json(allRefunds);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/refunds/:id/approve", (req, res) => {
  try {
    const { id } = req.params;
    const { refundedAt } = req.body;

    try {
      db.prepare("ALTER TABLE refund_requests ADD COLUMN refunded_at DATETIME").run();
    } catch (e) { }

    const refundedDate = refundedAt ? new Date(refundedAt).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19);

    db.prepare("UPDATE refund_requests SET status = 'realizado', refunded_at = ? WHERE id = ?").run(refundedDate, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/refunds/:id/reject", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("UPDATE refund_requests SET status = 'rejeitado' WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/change-requests", (req, res) => {
  try {
    const allRequests = db.prepare("SELECT * FROM change_requests ORDER BY created_at DESC").all();
    res.json(allRequests);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/change-requests/:id/approve", (req, res) => {
  try {
    const { id } = req.params;
    const { approvedValue } = req.body;
    db.prepare("UPDATE change_requests SET status = 'aprovado', approved_value = ? WHERE id = ?").run(approvedValue, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/change-requests/:id/reject", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("UPDATE change_requests SET status = 'rejeitado' WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/reports", (req, res) => {
  try {
    const period = parseInt(req.query.period as string) || 30;

    const dates = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const payments = db.prepare(`SELECT * FROM payments WHERE status = 'approved' AND created_at >= date('now', '-${period} days')`).all() as any[];

    let totalRevenue = 0;
    let totalSales = payments.length;

    const salesByDate: Record<string, { count: number, revenue: number }> = {};
    dates.forEach(d => salesByDate[d] = { count: 0, revenue: 0 });

    payments.forEach(p => {
      let amount = 0;
      if (p.metadata) {
        try {
          const meta = JSON.parse(p.metadata);
          if (meta.amount) amount = Number(meta.amount);
        } catch (e) { }
      }
      totalRevenue += amount;

      const dateStr = p.paid_at ? p.paid_at.split(' ')[0] : p.created_at.split(' ')[0];
      if (salesByDate[dateStr]) {
        salesByDate[dateStr].count++;
        salesByDate[dateStr].revenue += amount;
      }
    });

    const users = db.prepare(`SELECT * FROM devices WHERE created_at >= date('now', '-${period} days')`).all() as any[];
    const totalTests = users.length;

    const testsByDate: Record<string, number> = {};
    dates.forEach(d => testsByDate[d] = 0);

    users.forEach(u => {
      const dateStr = u.created_at.split(' ')[0];
      if (testsByDate[dateStr] !== undefined) {
        testsByDate[dateStr]++
      }
    });

    const conversionRate = totalTests > 0 ? ((totalSales / totalTests) * 100).toFixed(1) : "0.0";

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
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/users/:username/details", async (req, res) => {
  try {
    const { username } = req.params;

    const allUsers = await fetchVpnUsers();
    const user = allUsers.find((u: any) => u.login === username);

    const groupRecord = db.prepare("SELECT group_id FROM user_groups WHERE username = ?").get(username) as any;
    let plan = null;
    let devices = [];

    if (groupRecord) {
      plan = db.prepare("SELECT * FROM group_plans WHERE group_id = ?").get(groupRecord.group_id);
      devices = db.prepare("SELECT * FROM user_groups WHERE group_id = ? AND username != ?").all(groupRecord.group_id, username);
    }

    const payments = db.prepare("SELECT * FROM payments WHERE username = ? ORDER BY created_at DESC LIMIT 10").all(username);
    const refunds = db.prepare("SELECT * FROM refund_requests WHERE username = ? ORDER BY created_at DESC").all(username);

    res.json({
      user,
      plan,
      devices,
      payments,
      refunds
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/devices", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM devices ORDER BY created_at DESC");
    const devices = stmt.all();
    res.json(devices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/admin/devices", (req, res) => {
  try {
    const stmt = db.prepare("DELETE FROM devices");
    stmt.run();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/admin/devices/:id", (req, res) => {
  try {
    const stmt = db.prepare("DELETE FROM devices WHERE device_id = ?");
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  const server = http.createServer(app);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
