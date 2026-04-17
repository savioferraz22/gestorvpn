/**
 * Smoke-test suite for the payments & VPN-application pipeline.
 *
 * Usage (server must be running locally):
 *   ADMIN_PASSWORD=xxx tsx test-payments.ts
 *
 * What this exercises (all read-only / assertion-based — no writes):
 *   1. Admin listing enumerates payments with a vpnApplicationStatus annotation.
 *   2. Every approved reseller payment contributes a deterministic days-added
 *      count (months * 30) when computed through /api/admin/resellers/:u/details.
 *   3. The payment_attempts audit trail is retrievable per payment and has a
 *      success-count that never exceeds the claimed resellerMonths — this is
 *      the invariant that protects against "paid 1 month, got 2".
 *   4. Resellers with `hasFailedApplication: true` in the list endpoint really
 *      have at least one `status: "failed"` attempt in their detail timeline.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.warn("[test-payments] ADMIN_PASSWORD not set — skipping admin-scoped checks");
}

interface Failure { name: string; detail: string; }
const failures: Failure[] = [];
const pass = (name: string) => console.log(`✓ ${name}`);
const fail = (name: string, detail: string) => { failures.push({ name, detail }); console.error(`✗ ${name}: ${detail}`); };

async function adminToken(): Promise<string | null> {
  if (!ADMIN_PASSWORD) return null;
  const r = await fetch(`${BASE}/api/admin/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!r.ok) return null;
  const d: any = await r.json();
  return d.token;
}

async function adminGet<T>(token: string, path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

async function testPaymentsListShape(token: string) {
  const name = "GET /api/admin/payments returns annotated list";
  try {
    const payments: any[] = await adminGet(token, "/api/admin/payments");
    if (!Array.isArray(payments)) return fail(name, "not an array");
    if (payments.length === 0) return pass(`${name} (empty)`);
    const sample = payments[0];
    if (!("vpnApplicationStatus" in sample)) return fail(name, "missing vpnApplicationStatus field");
    const allowed = new Set(["applied", "failed", "pending", "none"]);
    const bad = payments.find(p => !allowed.has(p.vpnApplicationStatus));
    if (bad) return fail(name, `invalid status on ${bad.id}: ${bad.vpnApplicationStatus}`);
    pass(name);
  } catch (e: any) {
    fail(name, e.message);
  }
}

async function testAttemptsNeverExceedMonths(token: string) {
  const name = "payment_attempts.success never exceeds resellerMonths";
  try {
    const payments: any[] = await adminGet(token, "/api/admin/payments");
    const resellerRenewals = payments.filter(p => p.type === "reseller_renewal" && p.status === "approved");
    for (const p of resellerRenewals) {
      const attempts: any = await adminGet(token, `/api/admin/payments/${encodeURIComponent(p.id)}/attempts`);
      const list: any[] = Array.isArray(attempts) ? attempts : (attempts.attempts || []);
      const successes = list.filter(a => a.status === "success" && a.module === "renewrev").length;
      const meta = p.metadata ? (typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata) : {};
      const claimed = Math.max(1, Math.min(12, parseInt(meta.resellerMonths) || 1));
      if (successes > claimed) {
        return fail(name, `payment ${p.id}: ${successes} successes > claimed ${claimed} months`);
      }
    }
    pass(`${name} (${resellerRenewals.length} renewal payments checked)`);
  } catch (e: any) {
    fail(name, e.message);
  }
}

async function testResellersFailedFlagMatchesAttempts(token: string) {
  const name = "hasFailedApplication flag matches real failed attempts";
  try {
    const resellers: any[] = await adminGet(token, "/api/admin/resellers");
    const flagged = resellers.filter(r => r.hasFailedApplication);
    for (const r of flagged) {
      const details: any = await adminGet(token, `/api/admin/resellers/${encodeURIComponent(r.login)}/details`);
      const history: any[] = details.history || [];
      const hasFailed = history.some(h => h.hasFailedAttempts);
      if (!hasFailed) {
        return fail(name, `${r.login} flagged but no failed attempts in history`);
      }
    }
    pass(`${name} (${flagged.length} flagged resellers checked)`);
  } catch (e: any) {
    fail(name, e.message);
  }
}

async function testDetailsDaysAddedMatchesMonths(token: string) {
  const name = "reseller details: daysAdded === successfulRenewrev * 30";
  try {
    const resellers: any[] = await adminGet(token, "/api/admin/resellers");
    let totalChecked = 0;
    for (const r of resellers.slice(0, 10)) {
      const details: any = await adminGet(token, `/api/admin/resellers/${encodeURIComponent(r.login)}/details`);
      for (const h of (details.history || [])) {
        if (h.type !== "reseller_renewal" && h.type !== "reseller_hire") continue;
        const renewrevSuccess = (h.attempts || []).filter((a: any) => a.status === "success" && a.module === "renewrev").length;
        const hasAnyAttempt = (h.attempts || []).length > 0;
        // If no attempts recorded (legacy payment), daysAdded uses claimed months.
        if (hasAnyAttempt && h.daysAdded !== renewrevSuccess * 30) {
          return fail(name, `payment ${h.paymentId}: daysAdded=${h.daysAdded}, expected=${renewrevSuccess * 30}`);
        }
        totalChecked++;
      }
    }
    pass(`${name} (${totalChecked} payments checked)`);
  } catch (e: any) {
    fail(name, e.message);
  }
}

async function main() {
  const token = await adminToken();
  if (!token) {
    console.log("Only running public checks (no ADMIN_PASSWORD provided).");
    // No public endpoint to smoke, so skip.
    return;
  }
  await testPaymentsListShape(token);
  await testAttemptsNeverExceedMonths(token);
  await testResellersFailedFlagMatchesAttempts(token);
  await testDetailsDaysAddedMatchesMonths(token);

  if (failures.length > 0) {
    console.error(`\n${failures.length} test(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll tests passed.");
}

main().catch(e => { console.error("Fatal:", e); process.exit(2); });
