# M5 Delta — Server-side AI Endpoints

Apply these on top of the existing backend/ tree. All paths in this zip are
relative to `backend/`.

## Order of operations

1. **Run the migration first** in Supabase SQL Editor:
   `supabase/migrations/0003_ai_usage.sql`

2. **Add env vars** (Vercel → Project Settings → Environment Variables, and
   locally in `.env.local`):
   - `ANTHROPIC_API_KEY=sk-ant-...` (required)
   - `ANTHROPIC_MODEL=claude-haiku-4-5` (optional — default)
   - `AI_DAILY_CALL_LIMIT=1000` (optional — default 1000 calls/user/day)

3. **Drop files into place** — overwrite/create:
   - `supabase/migrations/0003_ai_usage.sql` — new
   - `lib/ai/provider.ts` — new
   - `lib/ai/quota.ts` — new
   - `lib/ai/client.ts` — new
   - `app/api/ai/categorize/route.ts` — new
   - `app/api/ai/parse/route.ts` — new
   - `app/api/ai/insights/route.ts` — new
   - `app/api/ai/quota/route.ts` — new
   - `components/budget/BudgetShell.tsx` — **overwrites** (ai-parse now creates txns)
   - `components/budget/LedgerPage.tsx` — **overwrites** (adds ✨ AI ×N button)
   - `components/budget/DashInsights.tsx` — **overwrites** (adds narrative block)
   - `.env.example` — **overwrites** (adds AI env vars)

4. **Redeploy** (or restart `next dev`).

## What each endpoint does

- `POST /api/ai/categorize` — batch (≤50), cache-first via `merchant_map`,
  only LLM for misses. High-confidence LLM results are written back to cache.
- `POST /api/ai/parse` — "coffee $5 yesterday" → `{ date, description, amount, is_income, category_id }`.
- `POST /api/ai/insights` — month aggregates → narrative paragraph + findings.
- `GET  /api/ai/quota` — how many calls you have left today.

## Cost notes

Haiku pricing + cache means a typical active user should stay well under
$1/month. The 1000-call/day quota is a safety valve, not a target.

## Errors the UI handles

- `ai_daily_limit_exceeded` → 429, soft-fail with a toast
- `ai_not_configured` → missing API key on deployment
- `could_not_extract_transaction` → the NL parser couldn't extract a txn
- `no_categories` → user needs to create categories first
