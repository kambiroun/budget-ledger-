# M4b delta — Ledger interactivity

Drops the real, editable Ledger into your `backend/` repo.

## File map

```
components/budget/LedgerPage.tsx         ← NEW: full ledger with writes + keyboard + bulk
components/budget/LedgerRow.tsx          ← NEW: individual row + inline category select
components/budget/LedgerEditRow.tsx      ← NEW: inline edit mode
components/budget/LedgerSplitModal.tsx   ← NEW: split-a-transaction modal
components/budget/BudgetShell.tsx        ← REPLACES: now routes to <LedgerPage /> for the Ledger tab
lib/hooks/useWrites.ts                   ← NEW: thin hooks around the db/client write API
```

## What M4b enables

- ✍️ **Add a row** — manual entry form with date/desc/amount/category/income
- ✏️ **Edit inline** — `e` or click "edit" on any row
- 🗑 **Delete** — per-row "×"
- ⌨️ **Keyboard nav** — `j`/`k`, arrows, `space` to select, `1-9` to assign category, `0` to clear, `e` to edit, `/` to focus search, `esc` to clear selection
- 🖱 **Multi-select** — shift-click / cmd-click / checkbox; bulk-assign palette appears at top
- 🔀 **Split** — divide one transaction into multiple rows with different categories; validates the parts sum to the original
- 🔎 **Search & filter** — description search, plus per-category / uncategorized / income filter pills
- 📅 **Month picker** — "all months" or any specific month
- 📊 **Progress bar** — shows categorized-vs-total for the current month

All writes go through the network-first client (online → server + cache; offline → local + enqueue + replay on reconnect).

## Install

```bash
unzip m4b-delta.zip
cp -r m4b-delta/* ./
rm -rf m4b-delta
npm run dev
```

Sign in, visit `/app`, open the **Ledger** tab.

## What's next

- **M4c** — Dashboard (forecast, heatmap, anomalies, narrative insights)
- **M4d** — Weekly digest + Compare periods
- **M4e** — Rules editor + Goals + Setup (demo loader, CSV import, ⌘K, receipt drawer)
- **M5**   — Server-side AI endpoints (`/api/ai/categorize`, `/api/ai/parse`)
- **M6**   — LocalStorage → DB migration
- **M7**   — Final deploy docs
