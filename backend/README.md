# Hotfix — Dashboard → Ledger drill-in

**Symptom:** clicking a category on the Dashboard Budget tab did nothing.

**Root cause:** `DashBudgetTab` rendered the rows but no click handler was
wired, so there was no way to drill into a category's transactions from the
Dashboard.

**Fix:**

1. **`components/budget/BudgetShell.tsx`** — adds a new global listener
   `window.addEventListener("budget:cmd", ...)`. Any component in the tree can
   now dispatch a `CmdAction` via a `CustomEvent` and the shell routes it
   through the same handler the Command Palette already uses. Decouples
   child components from the shell's state.

2. **`components/budget/DashBudgetTab.tsx`** — each category row becomes a
   `role="button"` with `onClick` + `Enter/Space` keyboard activation. It
   dispatches `{ kind: "filter-category", categoryName: c }`, which the
   shell turns into: switch to Ledger tab + apply the category filter.

**Apply:** overwrite both files. No schema, no env changes. Reload.

**Future use:** the new `budget:cmd` bus lets you wire drill-in from
anywhere — compare-period rows, weekly digest, heatmap day-cells, etc.
Just dispatch a matching `CmdAction`.
