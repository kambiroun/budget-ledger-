# M6 + M7 — JSON import + final docs

## M6 — Legacy JSON import

New file: **`backend/lib/budget/json-import.ts`** — reads the old standalone
HTML app's Export JSON output (categories / budgets / transactions / rules /
goals) and writes it into the DB via the existing client helpers.

- Categories: matched by name (existing wins, no update)
- Budgets: bulk upsert via `PUT /api/budgets`
- Transactions: deduped in-run on `date|amount|description`
- Rules / Goals: imported only when their referenced category exists
- Warnings surface in the browser console as `[ledger] JSON import warnings…`

Wired into **`backend/components/budget/SetupPage.tsx`**: new
`Import from JSON` button sits next to `Upload bank CSV` on the import bar.
Hidden `<input type="file" accept=".json,application/json">` picks the file
and the handler streams status into the existing `importReport` strip.

## M7 — Docs

- **`README.md`** (new, repo root) — orients between the standalone HTML
  and the cloud edition, covers the standalone→cloud migration path.
- **`backend/README.md`** (rewritten) — accurate stack, layout, what ships,
  quick start, and the migration-runs-in-order note.
- **`backend/DEPLOY.md`** — updated:
  - Part 2b now tells you to run **both** `0001_initial.sql` AND
    `0002_category_is_income.sql` (in order).
  - New **Part 7** describes the JSON import flow.
  - Troubleshooting table adds the four gotchas we actually hit in
    testing (missing 0002 migration, 422 txns limit, Date-render crash,
    stuck pending queue).
  - "What's next" replaced with "What ships" — all seven milestones
    marked shipped.

**Apply order:**

1. Overwrite the five files in-place.
2. No schema migration this time.
3. No env changes.
4. Redeploy (Vercel auto-picks up on push).
