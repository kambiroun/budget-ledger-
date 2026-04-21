# Budget Ledger — Cloud Edition

Multi-user, offline-first port of the standalone HTML Budget Ledger. Your transactions, categories, budgets, rules, and goals live in Postgres behind Supabase Auth; the UI works offline and reconciles via an IndexedDB-backed sync queue.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) · React 18 |
| Backend | Next.js API routes (serverless) |
| Database | Supabase Postgres (RLS enforced) |
| Auth | Supabase Auth — magic link, password, Google |
| Offline | IndexedDB (Dexie) + service worker + pending-write queue |
| AI | Anthropic SDK, server-side (`claude-haiku`) |
| Hosting | Vercel (frontend + API) + Supabase (DB + auth) |

## What ships

- Ledger with keyboard nav, bulk edit, AI categorize, CSV / JSON import
- Dashboard with forecasts, heatmap, anomalies, narrative, in-place category drill-in
- Compare periods, Weekly digest, Budget stress-test
- Rules engine with live pattern tester
- Goals (save-toward)
- Receipt drawer, merchant history, first-seen
- ⌘K command palette with natural-language parse ("latte yesterday 5.40")
- Offline queue with deduped 409 handling, permanent drop for 4xx, backoff + dead-letter for 5xx
- Dev-facing Reset widget: pending count, flush, scoped wipe (nuclear / txns / cats+budgets / goals / rules)
- JSON import from the legacy standalone HTML's Export JSON button

## Layout

```
backend/
├── app/
│   ├── (auth)/             # sign-in, sign-up, callback
│   ├── (app)/              # authed app shell
│   ├── api/
│   │   ├── transactions/
│   │   ├── categories/
│   │   ├── budgets/
│   │   ├── rules/
│   │   ├── goals/
│   │   ├── sync/
│   │   ├── wipe/
│   │   └── ai/             # categorize, parse, insights
│   └── layout.tsx
├── lib/
│   ├── supabase/           # server + browser clients, middleware
│   ├── db/                 # Dexie schema, client, pending queue
│   ├── budget/             # adapters, demo loader, CSV / JSON import
│   ├── hooks/              # useResource, useCategories, ...
│   └── schemas/            # Zod validators
├── components/budget/      # the whole UI
├── supabase/migrations/    # SQL — run these in order
├── public/sw.js            # service worker
├── DEPLOY.md
└── README.md
```

## Quick start

```bash
cd backend
npm install
cp .env.example .env.local  # fill in SUPABASE + ANTHROPIC values
npm run dev                 # http://localhost:3000
```

Then in Supabase SQL Editor, run **every file** in `supabase/migrations/` in order:

- `0001_initial.sql` — base schema, RLS, triggers
- `0002_category_is_income.sql` — income-flag column (required)

See [`DEPLOY.md`](./DEPLOY.md) for Supabase + Vercel end-to-end.

## Milestones

All shipped:

- **M1** — Foundation (schema, auth, sign-in)
- **M2** — API routes for CRUD
- **M3** — Offline-first sync + service worker
- **M4** — Full UI port
- **M5** — Server-side AI (categorize, parse, insights)
- **M6** — JSON import from the legacy standalone
- **M7** — Deploy docs (this file + DEPLOY.md)

## Importing from the old standalone

If you were running the HTML-only version:

1. Open it in the browser where your data lives
2. Setup → **Export JSON** → saves `budget-export-*.json`
3. In this app: Setup → **Import from JSON** → pick that file

Categories are matched by name (existing wins); budgets upsert by `(user, category)`; transactions dedupe in-run on `date|amount|description`; rules and goals import if their referenced category exists. The importer logs any skipped rows to the browser console (`[ledger] JSON import warnings…`).
