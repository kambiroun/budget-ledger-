-- ============================================================================
-- Budget Ledger — Referral system (M9)
-- ============================================================================

-- Each user gets a short referral code derived from their UUID.
-- referred_by tracks which user invited them.
alter table public.profiles
  add column if not exists referral_code text unique,
  add column if not exists referred_by   uuid references auth.users(id);

-- Backfill existing users with a deterministic code
update public.profiles
set referral_code = substr(replace(id::text, '-', ''), 1, 8)
where referral_code is null;

-- Index for O(1) lookups when claiming a referral code
create index if not exists profiles_referral_code_idx on public.profiles(referral_code);

-- RLS: users can read their own referral row to get their code + count
create policy "profiles_referral_self_select"
  on public.profiles
  for select
  using (auth.uid() = id);
