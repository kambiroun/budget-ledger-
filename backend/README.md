# Hotfix — 422 on txns + React error #31

**Two bugs, one drop:**

1. **`GET /api/transactions?limit=2000` → 422**
   `TxnQuery.limit` was capped at 1000 but Dashboard / Compare / Rules /
   Weekly all call with `limit: 2000`. Bumped the cap to 5000 in
   `lib/schemas/index.ts`.

2. **React error #31 ("object with keys {…Date…}") on Dashboard**
   `toLegacyTxns` converts Supabase's `date: string` into a `Date` object.
   The new DashBudgetTab accordion rendered `{t.date}` directly — React
   refuses to render a Date. Fixed by:
   - importing `fmtDate` and rendering `{fmtDate(t.date)}`
   - sorting via `getTime()` instead of string compare
   - rendering `t.description` (legacy txns don't have `merchant`)

**Apply:** overwrite both files. No schema / env changes. Reload.
