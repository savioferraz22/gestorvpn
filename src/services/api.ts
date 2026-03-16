// Centralized API service with proper error handling

let adminToken: string | null = localStorage.getItem("admin_token");

export function setAdminToken(token: string | null) {
  adminToken = token;
  if (token) {
    localStorage.setItem("admin_token", token);
  } else {
    localStorage.removeItem("admin_token");
  }
}

export function getAdminToken(): string | null {
  return adminToken;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Erro desconhecido" }));
    throw new ApiError(err.error || err.message || `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
  return headers;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function loginUser(username: string, deviceId: string) {
  return apiFetch<any>("/api/user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, deviceId }),
  });
}

export async function verifyPassword(username: string, password: string, deviceId: string) {
  return apiFetch<any>("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, deviceId }),
  });
}

export async function adminLogin(password: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>("/api/admin/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

// ─── Group ─────────────────────────────────────────────────────────────────

export async function fetchGroup(username: string) {
  return apiFetch<any>(`/api/group/${encodeURIComponent(username)}`);
}

export async function fetchGroupDetails(groupId: string) {
  return apiFetch<any[]>(`/api/group/details/${groupId}`);
}

export async function addDeviceToGroup(groupId: string, newUsername: string, password?: string) {
  return apiFetch<any>("/api/group/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, newUsername, password }),
  });
}

export async function removeDeviceFromGroup(groupId: string, usernameToRemove: string) {
  return apiFetch<any>("/api/group/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, usernameToRemove }),
  });
}

export async function updateGroupPlan(groupId: string, plan_type: string, plan_months: number, plan_devices: number, plan_price: number) {
  return apiFetch<any>("/api/group/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, plan_type, plan_months, plan_devices, plan_price }),
  });
}

// ─── Tickets ───────────────────────────────────────────────────────────────

export async function fetchUserTickets(username: string) {
  return apiFetch<any[]>(`/api/tickets/${encodeURIComponent(username)}`);
}

export async function fetchTicketMessages(ticketId: string) {
  return apiFetch<any[]>(`/api/tickets/${ticketId}/messages`);
}

export async function createTicket(username: string, category: string, subject: string, message: string) {
  return apiFetch<any>("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, category, subject, message }),
  });
}

export async function sendTicketMessage(ticketId: string, sender: "user" | "admin", message: string) {
  return apiFetch<any>(`/api/tickets/${ticketId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender, message }),
  });
}

export async function updateTicketStatus(ticketId: string, status: string) {
  return apiFetch<any>(`/api/tickets/${ticketId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export async function fetchAdminDevices() {
  return apiFetch<any[]>("/api/admin/devices", { headers: adminHeaders() });
}

export async function deleteAdminDevice(deviceId: string) {
  return apiFetch<any>(`/api/admin/devices/${deviceId}`, { method: "DELETE", headers: adminHeaders() });
}

export async function deleteAllAdminDevices() {
  return apiFetch<any>("/api/admin/devices", { method: "DELETE", headers: adminHeaders() });
}

export async function fetchAdminTickets() {
  return apiFetch<any[]>("/api/admin/tickets", { headers: adminHeaders() });
}

export async function fetchAdminPayments() {
  return apiFetch<any[]>("/api/admin/payments", { headers: adminHeaders() });
}

export async function fetchAdminRefunds() {
  return apiFetch<any[]>("/api/admin/refunds", { headers: adminHeaders() });
}

export async function approveRefund(id: string, refundedAt: string) {
  return apiFetch<any>(`/api/admin/refunds/${id}/approve`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ refundedAt }),
  });
}

export async function rejectRefund(id: string) {
  return apiFetch<any>(`/api/admin/refunds/${id}/reject`, {
    method: "POST",
    headers: adminHeaders(),
  });
}

export async function fetchAdminChangeRequests() {
  return apiFetch<any[]>("/api/admin/change-requests", { headers: adminHeaders() });
}

export async function approveChangeRequest(id: string, approvedValue: string) {
  return apiFetch<any>(`/api/admin/change-requests/${id}/approve`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ approvedValue }),
  });
}

export async function rejectChangeRequest(id: string) {
  return apiFetch<any>(`/api/admin/change-requests/${id}/reject`, {
    method: "POST",
    headers: adminHeaders(),
  });
}

export async function fetchAdminReports(period: number) {
  return apiFetch<any>(`/api/admin/reports?period=${period}`, { headers: adminHeaders() });
}

export async function fetchAdminUserDetails(username: string) {
  return apiFetch<any>(`/api/admin/users/${encodeURIComponent(username)}/details`, { headers: adminHeaders() });
}

export async function deleteAdminUser(username: string) {
  return apiFetch<any>(`/api/admin/users/${encodeURIComponent(username)}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

export async function fetchAdminResellers() {
  return apiFetch<any[]>("/api/admin/resellers", { headers: adminHeaders() });
}

export async function adjustReseller(username: string, body: { expiresAt?: string; logins?: number }) {
  return apiFetch<any>(`/api/admin/resellers/${encodeURIComponent(username)}/adjust`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchAdminResellerRequests() {
  return apiFetch<any[]>("/api/admin/reseller-requests", { headers: adminHeaders() });
}

export async function approveResellerRequest(id: string) {
  return apiFetch<any>(`/api/admin/reseller-requests/${id}/approve`, { method: "POST", headers: adminHeaders() });
}

export async function rejectResellerRequest(id: string, reason: string) {
  return apiFetch<any>(`/api/admin/reseller-requests/${id}/reject`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function confirmResellerRequest(id: string) {
  return apiFetch<any>(`/api/admin/reseller-requests/${id}/confirm`, { method: "POST", headers: adminHeaders() });
}

// ─── Payments ──────────────────────────────────────────────────────────────

export async function createPixPayment(body: Record<string, any>) {
  return apiFetch<any>("/api/pix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function checkPaymentStatus(paymentId: string) {
  return apiFetch<any>(`/api/status/${paymentId}`);
}

// ─── User Actions ──────────────────────────────────────────────────────────

export async function createFreeUser(username: string, deviceId: string, referrer: string) {
  return apiFetch<any>("/api/create-free", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, deviceId, referrer }),
  });
}

export async function updateUserAccess(username: string, action: string, newValue: string) {
  return apiFetch<any>("/api/user/update-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, action, newValue }),
  });
}

// ─── Web Push ──────────────────────────────────────────────────────────────

export async function getVapidPublicKey(): Promise<string> {
  const data = await apiFetch<{ publicKey: string }>("/api/push/vapid-public-key");
  return data.publicKey;
}

export async function subscribePush(username: string, subscription: PushSubscription): Promise<void> {
  await apiFetch<any>("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, subscription: subscription.toJSON() }),
  });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await apiFetch<any>("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}
