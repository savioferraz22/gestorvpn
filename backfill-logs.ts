// Backfill da tabela activity_logs a partir do histórico existente.
// Idempotente: usa IDs determinísticos (bf_*) com upsert ignoreDuplicates,
// então pode rodar quantas vezes quiser sem duplicar.
//
// Uso: npx tsx backfill-logs.ts          (dry-run — só conta)
//      npx tsx backfill-logs.ts --apply  (grava)
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const apply = process.argv.includes("--apply");

const RESELLER_TYPES = ["reseller_hire", "reseller_renewal", "reseller_setup", "reseller_adjustment", "reseller_logins_increase"];

function fmtBRL(v: any): string {
  const n = Number(v);
  return Number.isFinite(n) ? `R$ ${n.toFixed(2).replace(".", ",")}` : "—";
}

function typeLabel(type?: string): string {
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

function meta(raw: any): any {
  if (!raw) return {};
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

type Row = {
  id: string;
  event_type: string;
  username: string | null;
  actor: string;
  description: string;
  metadata: any;
  created_at: string;
};

async function fetchAll(table: string, columns: string): Promise<any[]> {
  const out: any[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await db.from(table).select(columns).range(offset, offset + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}

async function main() {
  const rows: Row[] = [];

  // ── payments ──
  const payments = await fetchAll("payments", "id, username, status, type, metadata, paid_at, created_at");
  for (const p of payments) {
    const m = meta(p.metadata);
    const isManual = String(p.id).startsWith("setup_") || String(p.id).startsWith("adj_");
    const actor = RESELLER_TYPES.includes(p.type) ? "reseller" : "client";

    if (p.type === "reseller_setup") {
      rows.push({
        id: `bf_pay_${p.id}_setup`, event_type: "reseller_setup", username: p.username, actor: "reseller",
        description: `Setup de revenda existente: ${p.username}${m.resellerLogins ? ` — ${m.resellerLogins} logins` : ""}`,
        metadata: { backfilled: true, paymentId: p.id }, created_at: p.paid_at || p.created_at,
      });
      continue;
    }
    if (p.type === "reseller_adjustment") {
      rows.push({
        id: `bf_pay_${p.id}_adj`, event_type: "admin_reseller_adjust", username: p.username, actor: "admin",
        description: `Admin ajustou revenda ${p.username}${m.resellerLogins !== undefined ? ` — logins → ${m.resellerLogins}` : ""}${m.resellerExpiresAt ? ` — vencimento → ${new Date(m.resellerExpiresAt).toLocaleDateString("pt-BR")}` : ""}`,
        metadata: { backfilled: true, paymentId: p.id }, created_at: p.paid_at || p.created_at,
      });
      continue;
    }

    if (!isManual) {
      rows.push({
        id: `bf_pay_${p.id}_pix`, event_type: "pix_generated", username: p.username, actor,
        description: `PIX gerado: ${typeLabel(p.type)} — ${fmtBRL(m.amount)}${m.discountApplied ? " (desconto fidelidade)" : ""}`,
        metadata: { backfilled: true, paymentId: p.id, type: p.type, amount: m.amount ?? null }, created_at: p.created_at,
      });
    }
    if (p.status === "approved") {
      rows.push({
        id: `bf_pay_${p.id}_ok`, event_type: "payment_approved", username: p.username, actor,
        description: `Pagamento aprovado: ${typeLabel(p.type)} — ${fmtBRL(m.amount)}`,
        metadata: { backfilled: true, paymentId: p.id, type: p.type, amount: m.amount ?? null }, created_at: p.paid_at || p.created_at,
      });
    }
  }

  // ── devices (testes grátis) ──
  const devices = await fetchAll("devices", "device_id, username, created_at");
  for (const d of devices) {
    rows.push({
      id: `bf_dev_${d.device_id}`, event_type: "trial_created", username: d.username, actor: "client",
      description: `Teste grátis criado: ${d.username} (2 dias)`,
      metadata: { backfilled: true, deviceId: d.device_id }, created_at: d.created_at,
    });
  }

  // ── tickets ──
  const tickets = await fetchAll("tickets", "id, username, category, subject, created_at");
  for (const t of tickets) {
    rows.push({
      id: `bf_tkt_${t.id}`, event_type: "ticket_created", username: t.username, actor: "client",
      description: `Ticket aberto: "${t.subject}" (${t.category})`,
      metadata: { backfilled: true, ticketId: t.id }, created_at: t.created_at,
    });
  }

  // ── change_requests ──
  const changes = await fetchAll("change_requests", "id, username, type, requested_value, created_at");
  for (const c of changes) {
    rows.push({
      id: `bf_chg_${c.id}`, event_type: "change_request_created", username: c.username, actor: "client",
      description: `Solicitação criada (${c.type})${c.requested_value ? ` → ${c.requested_value}` : ""}`,
      metadata: { backfilled: true, requestId: c.id, type: c.type }, created_at: c.created_at,
    });
  }

  // ── refund_requests ──
  const refunds = await fetchAll("refund_requests", "id, username, pix_type, status, refunded_at, created_at");
  for (const r of refunds) {
    rows.push({
      id: `bf_ref_${r.id}`, event_type: "refund_requested", username: r.username, actor: "client",
      description: `Reembolso solicitado (PIX ${r.pix_type})`,
      metadata: { backfilled: true, refundId: r.id }, created_at: r.created_at,
    });
    if (r.refunded_at) {
      rows.push({
        id: `bf_ref_${r.id}_ok`, event_type: "refund_approved", username: r.username, actor: "admin",
        description: `Reembolso realizado para ${r.username}`,
        metadata: { backfilled: true, refundId: r.id }, created_at: r.refunded_at,
      });
    }
  }

  // ── referrals ──
  const referrals = await fetchAll("referrals", "id, referrer_username, referred_username, created_at");
  for (const r of referrals) {
    rows.push({
      id: `bf_refl_${r.id}`, event_type: "referral_created", username: r.referrer_username, actor: "client",
      description: `Indicação registrada: ${r.referrer_username} indicou ${r.referred_username}`,
      metadata: { backfilled: true, referredUsername: r.referred_username }, created_at: r.created_at,
    });
  }

  console.log(`Eventos a gravar: ${rows.length}`);
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.event_type] = (byType[r.event_type] || 0) + 1;
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);

  if (!apply) { console.log("\n[DRY-RUN] nada gravado. Rode com --apply."); return; }

  let ok = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await db.from("activity_logs").upsert(batch, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`lote ${i}: ${error.message}`);
    ok += batch.length;
    console.log(`gravados ${ok}/${rows.length}`);
  }
  console.log("Backfill concluído.");
}

main().catch((e) => { console.error("Erro:", e.message || e); process.exit(1); });
