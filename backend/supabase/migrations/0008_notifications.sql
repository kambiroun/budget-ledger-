-- ============================================================================
-- Budget Ledger — Notification preferences (M8)
-- ============================================================================

alter table public.profiles
  add column if not exists notif_budget_overage boolean not null default true,
  add column if not exists notif_weekly_digest  boolean not null default true;
