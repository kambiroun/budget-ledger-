-- ============================================================================
-- Budget Ledger — Initial schema (M1)
-- ============================================================================
-- Run this in Supabase dashboard → SQL Editor → New query → Run.
-- Or: supabase db push (if using the CLI).
--
-- Design notes:
--   • Every user-owned table has `user_id uuid references auth.users` and
--     row-level-security (RLS) policies that scope every query to that user.
--     You can never accidentally read another user's data, even from the API.
--   • Every sync'd row has `updated_at` (auto-bumped) and `deleted_at`
--     (soft delete) so offline clients can resolve conflicts via LWW.
--   • Primary keys are uuid, generated client-side, so offline writes can
--     create records before the server sees them.
-- ============================================================================

-- Enable extensions ----------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- PROFILE — one row per auth.users, holds display prefs
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  rollover_enabled boolean not null default false,
  pay_day integer not null default 1,      -- 1..28
  theme text not null default 'light',     -- 'light' | 'dark'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- CATEGORIES — per-user list of spend buckets
-- ============================================================================
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,                              -- hex or null (auto-pick)
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, name)                   -- no dupe category names per user
);
create index on public.categories (user_id, updated_at);

-- ============================================================================
-- BUDGETS — monthly target per category
-- ============================================================================
create table public.budgets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, category_id)
);
create index on public.budgets (user_id, updated_at);

-- ============================================================================
-- TRANSACTIONS — the big one
-- ============================================================================
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  date date not null,
  description text not null,
  amount numeric(14, 2) not null,
  is_income boolean not null default false,
  is_dupe boolean not null default false,
  is_transfer boolean not null default false,
  is_refund boolean not null default false,
  split_of uuid references public.transactions(id) on delete set null,
  ai_confidence real,                      -- 0..1 or null
  source text,                             -- 'csv' | 'paste' | 'manual' | 'demo'
  source_file text,                        -- original filename
  raw jsonb,                               -- original row for debugging
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.transactions (user_id, date desc);
create index on public.transactions (user_id, updated_at);
create index on public.transactions (user_id, category_id);

-- ============================================================================
-- RULES — merchant pattern → category
-- ============================================================================
create table public.rules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,                   -- substring match, case-insensitive
  category_id uuid not null references public.categories(id) on delete cascade,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.rules (user_id, priority desc);

-- ============================================================================
-- MERCHANT_MAP — learned merchant → category (from AI + manual)
-- ============================================================================
create table public.merchant_map (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,              -- normalized description fragment
  category_id uuid not null references public.categories(id) on delete cascade,
  hits integer not null default 1,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, merchant_key)
);
create index on public.merchant_map (user_id, merchant_key);

-- ============================================================================
-- GOALS — savings targets
-- ============================================================================
create table public.goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target numeric(14, 2) not null,
  saved numeric(14, 2) not null default 0,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.goals (user_id, updated_at);

-- ============================================================================
-- Auto-bump updated_at on any UPDATE
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'categories', 'budgets', 'transactions',
    'rules', 'merchant_map', 'goals'
  ]
  loop
    execute format('
      create trigger touch_%1$s
        before update on public.%1$s
        for each row execute function public.touch_updated_at();
    ', t);
  end loop;
end $$;

-- ============================================================================
-- ROW-LEVEL SECURITY
-- Every table locked down — only rows where user_id = auth.uid() are visible.
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.budgets         enable row level security;
alter table public.transactions    enable row level security;
alter table public.rules           enable row level security;
alter table public.merchant_map    enable row level security;
alter table public.goals           enable row level security;

-- profiles: user can read+update their own row
create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- generic "self owns" policies for the rest
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'budgets', 'transactions',
    'rules', 'merchant_map', 'goals'
  ]
  loop
    execute format('
      create policy "%1$s_self_select" on public.%1$s
        for select using (auth.uid() = user_id);
      create policy "%1$s_self_insert" on public.%1$s
        for insert with check (auth.uid() = user_id);
      create policy "%1$s_self_update" on public.%1$s
        for update using (auth.uid() = user_id);
      create policy "%1$s_self_delete" on public.%1$s
        for delete using (auth.uid() = user_id);
    ', t);
  end loop;
end $$;
