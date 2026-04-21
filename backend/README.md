# Budget Ledger — Multi-User Cloud Edition

A full-stack version of Budget Ledger with accounts, a Postgres database, and offline-first sync.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + React 18 + Vite-compatible |
| Backend | Next.js API routes (serverless) |
| Database | Supabase Postgres |
| Auth | Supabase Auth (magic link + email/password + Google) |
| Offline | IndexedDB (Dexie) + service worker + last-write-wins sync |
| AI | Anthropic SDK (server-side) |
| Hosting | Vercel (frontend + API), Supabase (DB + auth) |
| Cost | $0/mo to start |

## Project layout (monorepo)

```
backend/
├── app/                     # Next.js app router
│   ├── (auth)/             # sign-in, sign-up pages
│   ├── (app)/              # authed app pages
│   ├── api/                # server routes
│   │   ├── transactions/
│   │   ├── categories/
│   │   ├── budgets/
│   │   ├── rules/
│   │   ├── goals/
│   │   ├── sync/           # batch push/pull for offline
│   │   └── ai/             # categorize, parse
│   └── layout.tsx
├── lib/
│   ├── supabase/           # server + browser clients
│   ├── db/                 # Dexie (IndexedDB)
│   ├── sync/               # sync engine
│   └── schemas/            # Zod validators
├── components/             # React components (ported from HTML version)
├── supabase/
│   └── migrations/         # SQL schema + RLS policies
├── public/
│   └── sw.js               # service worker
├── DEPLOY.md               # step-by-step hosting guide
├── .env.example
├── package.json
├── next.config.js
└── tsconfig.json
```

## Milestones

- **M1** — Foundation: schema, auth, sign-in page. ⬅ **current**
- M2 — API routes for CRUD
- M3 — Offline-first sync
- M4 — Port full UI
- M5 — Server-side AI
- M6 — Import from the HTML version's localStorage
- M7 — Deploy docs

## Quick start (after M1 ships)

```bash
cd backend
npm install
cp .env.example .env.local   # fill in values
npm run dev                   # → http://localhost:3000
```

See `DEPLOY.md` for the Supabase + Vercel setup steps.
