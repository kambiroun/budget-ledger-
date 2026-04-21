# Hotfix — Dashboard category expansion

**Symptom:** clicking a category row redirected to the Ledger tab. Should
expand in-place to reveal that category's transactions for the selected
month, like the original HTML prototype.

**Fix:** `components/budget/DashBudgetTab.tsx` — replaces the navigate-
to-Ledger behavior with an accordion:

- Each row toggles an expanded state (one open at a time).
- A ▸ chevron rotates 90° when open.
- Expanded panel lists that category's transactions for the current month,
  newest first, indented with a colored left-border in the category color.
- Each transaction is a button that opens the Receipt Drawer (same event
  the Ledger rows use on double-click).
- Empty state: "No transactions this month".

No shell changes needed — the previously-added `budget:cmd` bus is kept
for other drill-ins, but the Dashboard doesn't use it anymore.

**Apply:** overwrite the one file. Reload.
