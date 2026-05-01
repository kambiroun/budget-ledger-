-- ============================================================================
-- Budget Ledger — Billing schema (M5)
-- Adds subscription fields to profiles + a billing events audit log.
-- ============================================================================

alter table public.profiles
  add column if not exists subscription_status text not null default 'free'
    check (subscription_status in ('free','pro','plus','past_due','canceled')),
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists current_period_end timestamptz,
  add column if not exists anthropic_byo_key text;  -- stored encrypted in app layer

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles(stripe_customer_id);

-- Audit log for Stripe webhook events (idempotency + debugging)
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

-- Only service_role can read/write billing_events (no RLS needed for user access)
alter table public.billing_events enable row level security;

create policy "service_role_only" on public.billing_events
  using (false);  -- users never access this table directly
