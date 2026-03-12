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
