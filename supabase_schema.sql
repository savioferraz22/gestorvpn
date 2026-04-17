-- SCRIPT DE MIGRAÇÃO VS PLUS (SQLITE PARA POSTGRESQL SUPABASE)
-- Execute este script no SQL Editor do seu Supabase.

CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    status TEXT NOT NULL,
    type TEXT DEFAULT 'renewal',
    group_id TEXT,
    metadata JSONB,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.devices (
    device_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.trusted_devices (
    device_id TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, username)
);

CREATE TABLE IF NOT EXISTS public.tickets (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_groups (
    group_id TEXT NOT NULL,
    username TEXT NOT NULL,
    PRIMARY KEY (group_id, username)
);

CREATE TABLE IF NOT EXISTS public.group_plans (
    group_id TEXT PRIMARY KEY,
    plan_type TEXT NOT NULL,
    plan_months INTEGER NOT NULL,
    plan_devices INTEGER NOT NULL,
    plan_price NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS public.referrals (
    id TEXT PRIMARY KEY,
    referrer_username TEXT NOT NULL,
    referred_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'testing',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.loyalty_points (
    username TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.refund_requests (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    pix_type TEXT NOT NULL,
    pix_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aguardando',
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.change_requests (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    type TEXT NOT NULL,
    requested_value TEXT NOT NULL,
    approved_value TEXT,
    status TEXT NOT NULL DEFAULT 'aguardando',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail for every VPN panel operation triggered by a payment.
-- Enables: retry of failed operations, idempotency checks (never apply twice),
-- visibility into which payments were actually propagated to the panel.
CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    target_username TEXT NOT NULL,
    module TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_number INTEGER NOT NULL DEFAULT 1,
    response_text TEXT,
    error_message TEXT,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment_id ON public.payment_attempts(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON public.payment_attempts(status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_module ON public.payment_attempts(payment_id, module, status);

-- Cache of current reseller plan state (computed from approved payments).
-- Kept in sync on every approvePayment + admin adjust. Reads are O(1) vs
-- recomputing calcResellerInfo over full payment history.
CREATE TABLE IF NOT EXISTS public.reseller_plans (
    username TEXT PRIMARY KEY,
    current_logins INTEGER NOT NULL DEFAULT 10,
    current_expires_at TIMESTAMPTZ,
    total_months_paid INTEGER NOT NULL DEFAULT 0,
    last_renewal_at TIMESTAMPTZ,
    last_payment_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Persistent queue for the auto-check-after-1min/5min mechanism.
-- Replaces in-memory setTimeout which is lost on process restart.
CREATE TABLE IF NOT EXISTS public.scheduled_checks (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    run_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scheduled_checks_pending ON public.scheduled_checks(run_at) WHERE status = 'pending';

-- Performance indexes on the heavy payments table.
CREATE INDEX IF NOT EXISTS idx_payments_username ON public.payments(username);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_type_status ON public.payments(type, status);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at);
