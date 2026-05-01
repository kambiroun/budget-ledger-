-- ============================================================================
-- Budget Ledger — Push token (M6 / Capacitor iOS)
-- Stores the APNs/FCM device token for server-side push notifications.
-- ============================================================================

alter table public.profiles
  add column if not exists push_token text;
