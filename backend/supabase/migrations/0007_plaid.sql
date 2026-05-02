-- ============================================================================
-- Budget Ledger — Plaid bank sync (M7 / Phase 6)
-- Adds tables for linked Plaid items and their accounts, plus a
-- plaid_transaction_id column on transactions for idempotent syncing.
-- ============================================================================

-- ── plaid_items ───────────────────────────────────────────────────────────────
-- One row per linked institution/item.
-- Access tokens are sensitive — this table has NO user-facing RLS policies.
-- All reads/writes go through server-side API routes using the service_role key.
create table public.plaid_items (
  id                 uuid        primary key default uuid_generate_v4(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  plaid_item_id      text        not null unique,
  plaid_access_token text        not null,
  institution_id     text,
  institution_name   text,
  cursor             text,        -- /transactions/sync pagination cursor
  last_synced_at     timestamptz,
  error_code         text,
  error_message      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on public.plaid_items (user_id);
alter table public.plaid_items enable row level security;
-- No policies: service_role only. Never accessible from the browser.

create trigger touch_plaid_items
  before update on public.plaid_items
  for each row execute function public.touch_updated_at();

-- ── plaid_accounts ────────────────────────────────────────────────────────────
-- One row per bank account within an item. Safe to expose to the authenticated
-- user (no secrets here — just metadata like account name and last-4 mask).
create table public.plaid_accounts (
  id                uuid    primary key default uuid_generate_v4(),
  user_id           uuid    not null references auth.users(id) on delete cascade,
  item_id           uuid    not null references public.plaid_items(id) on delete cascade,
  plaid_account_id  text    not null unique,
  name              text    not null,
  official_name     text,
  mask              text,
  type              text,
  subtype           text,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

create index on public.plaid_accounts (user_id);
create index on public.plaid_accounts (item_id);
alter table public.plaid_accounts enable row level security;

create policy "plaid_accounts_self_select" on public.plaid_accounts
  for select using (auth.uid() = user_id);
create policy "plaid_accounts_self_update" on public.plaid_accounts
  for update using (auth.uid() = user_id);

-- ── transactions.plaid_transaction_id ────────────────────────────────────────
-- Unique Plaid transaction ID — used to upsert on sync so re-syncing is safe.
alter table public.transactions
  add column if not exists plaid_transaction_id text unique;

create index if not exists transactions_plaid_txn_id_idx
  on public.transactions (plaid_transaction_id)
  where plaid_transaction_id is not null;
