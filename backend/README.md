# M4a delta — drop these into your `backend/` repo

This zip contains **only the files added/changed in milestone M4a**. It slots into the Next.js app you already have.

## File map

```
app/globals.css                        ← REPLACES existing (full editorial stylesheet)
app/app/page.tsx                        ← REPLACES existing placeholder (renders <BudgetShell/>)
components/budget/Primitives.tsx        ← NEW
components/budget/BudgetShell.tsx       ← NEW
lib/budget/types.ts                     ← NEW
lib/budget/format.ts                    ← NEW
lib/budget/defaults.ts                  ← NEW
lib/budget/parsers.ts                   ← NEW
lib/budget/txn.ts                       ← NEW
lib/budget/inbox.ts                     ← NEW
lib/budget/demo.ts                      ← NEW
lib/budget/index.ts                     ← NEW (barrel export)
```

## What's in M4a

- Full editorial design system (warm-paper palette, IBM Plex Serif + Mono, dark mode)
- Typed budget logic library (dedupe, recurring detection, transfers, splits, forecast, anomalies, envelopes, weekly digest, smart inbox, demo-data generator)
- UI primitives (`Btn`, `Pill`, `Masthead`, `Tabs`, `SectionHead`, `MonthPicker`, `Modal`, `EmptyState`, `Flash`)
- App shell with all 7 tabs (Dashboard, Ledger, Rules, Goals, Weekly, Compare, Setup) wired to live Supabase data via the React Query hooks from M2

## What's still stubbed (coming in M4b–e)

- Transaction writes (add / edit / delete / split / bulk ops)
- Keyboard nav, command palette, receipt drawer
- Weekly digest + Compare full UIs
- Setup's demo loader + CSV import action

## Install

```bash
# from your backend/ repo root
unzip m4a-delta.zip
cp -r m4a-delta/* ./
rm -rf m4a-delta m4a-delta.zip

npm run dev
```

Visit `/app` after signing in.
