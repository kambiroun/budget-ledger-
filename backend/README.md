# Hotfix — budgets crash on add

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'startsWith')`
when setting a budget amount on a category.

**Root cause:** `budgetMapForMonth` in `lib/budget/adapter.ts` filters
budgets by `b.month.startsWith(mk)`, but the schema has no `month` column
on `budgets` — rows are one-per-(user, category). With zero budgets, the
forEach was a no-op so it silently worked. Add one and it crashes.

**Fix:**
- `lib/budget/adapter.ts` — drop the hard `month` filter. Budgets apply
  to every month until per-month budgets ship. Still honors a `month`
  field defensively if one shows up.
- `lib/db/client.ts` — no longer stamps an optimistic `month` on new
  budget rows (the server doesn't set one either).

**Apply:** overwrite the two files. No migration. No env changes. Reload.
