# DEPLOY — Budget Ledger Cloud

Step-by-step from zero to a running app with your own domain.
Reading time: ~15 minutes. Actual click-time: ~30–45 minutes.

---

## Part 1 — Create accounts (5 min)

You'll need three free accounts:

1. **[Supabase](https://supabase.com)** — database + auth
2. **[Vercel](https://vercel.com)** — hosting
3. **[Anthropic Console](https://console.anthropic.com)** — AI API key
4. **GitHub** — you almost certainly have this

All have generous free tiers. You won't be charged anything unless you cross ~1000s of users.

---

## Part 2 — Supabase project (10 min)

### 2a. Create a project

1. In Supabase dashboard → **New Project**
2. Pick a name (e.g. `budget-ledger`), a strong DB password (save it), and a region close to you
3. Wait ~2 min for provisioning

### 2b. Run the schema

1. Left sidebar → **SQL Editor** → **New query**
2. Open `backend/supabase/migrations/0001_initial.sql` — paste contents → **Run**
3. **New query** again; open `backend/supabase/migrations/0002_category_is_income.sql` — paste contents → **Run**
4. If you add more migrations later, run them in numeric order. Each one is a single `Run` click.
5. You should see `Success. No rows returned.` after each.

### 2c. Grab your API keys

1. Left sidebar → **Project Settings** (gear icon) → **API**
2. Copy these three values (you'll paste them in Part 4):
   - **Project URL** → goes into `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → goes into `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → goes into `SUPABASE_SERVICE_ROLE_KEY` ⚠️ keep secret

### 2d. Enable Google OAuth (optional, but you asked for it)

1. Left sidebar → **Authentication** → **Providers** → **Google** → toggle on
2. You'll need a Google OAuth client:
   - Go to [Google Cloud Console](https://console.cloud.google.com) → create a project
   - **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
   - App type: **Web application**
   - Authorized redirect URIs: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
     (use your real Supabase project URL)
   - Copy the **Client ID** and **Client Secret** back into Supabase's Google provider panel
3. Hit **Save**

### 2e. Enable email OTP + password

- **Authentication** → **Providers** → **Email** → enable both "Confirm email" and "Magic link"
- (Defaults are fine. Supabase uses their free SMTP for dev — you can plug in your own mailer later.)

### 2f. Set site URL

- **Authentication** → **URL Configuration**
- **Site URL**: `http://localhost:3000` for dev, change to `https://your-domain.com` once deployed
- **Redirect URLs** (whitelist): add
  - `http://localhost:3000/**`
  - `https://your-domain.com/**` (once you have one)

---

## Part 3 — Anthropic API key (2 min)

1. [console.anthropic.com](https://console.anthropic.com) → **Settings** → **API Keys** → **Create Key**
2. Copy the `sk-ant-...` value
3. Add $5 of credit (Billing tab) — this app uses Haiku which costs ~$0.80/M tokens

---

## Part 4 — Run locally (5 min)

```bash
# From this repo root:
cd backend
npm install
cp .env.example .env.local
```

Edit `.env.local` and paste the four values from above:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Then:

```bash
npm run dev
```

Open `http://localhost:3000`. You should see the landing page.
Click **Create account** → try all three methods (magic link, password, Google).
After signing in you'll land on `/app` with a "Hello, [your name]" screen and your session details.

If anything breaks here, that's the point — ping me with the error.

---

## Part 5 — Deploy to Vercel (10 min)

### 5a. Push to GitHub

```bash
cd backend
git init
git add .
git commit -m "initial"
gh repo create budget-ledger-cloud --private --source=. --push
# or create the repo manually on github.com and push
```

### 5b. Import to Vercel

1. [vercel.com/new](https://vercel.com/new) → select your repo
2. Root directory: `backend` (since it's inside a subfolder)
3. Framework preset: **Next.js** (auto-detected)
4. **Environment Variables** → paste all five from `.env.local`
   - Set `NEXT_PUBLIC_APP_URL` to `https://your-vercel-url.vercel.app` (or your domain)
5. **Deploy**

### 5c. Update Supabase site URL

Once Vercel gives you a URL:

- Supabase → **Auth** → **URL Configuration** → **Site URL** = your Vercel URL
- Add `https://your-vercel-url.vercel.app/**` to redirect whitelist
- Google Cloud Console → edit OAuth client → add `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (already there) — no change needed, Supabase handles the prod callback

### 5d. Custom domain (optional)

In Vercel → **Settings** → **Domains** → add yours. They give you DNS records to set at your registrar. After DNS propagates, update Supabase Site URL to the custom domain.

---

## Part 6 — Verify

Open your live URL, sign in with all three methods, confirm you land on `/app` and see the shell. Open Setup → Load demo data, then poke around the Ledger, Dashboard, Weekly, Compare, Rules, Goals tabs.

---

## Part 7 — Importing from the old standalone (optional)

If you ran the HTML-only version before this:

1. Open that HTML file in the browser where your data lives
2. Setup → **Export JSON** — you'll get `budget-export-*.json`
3. In the new app: Setup → **Import from JSON** — pick the file
4. Watch the status line; warnings (unknown categories, bad rows) print to the browser console as `[ledger] JSON import warnings…`

The importer:
- Matches categories by name (existing rows win)
- Upserts budgets by (user, category)
- Dedupes transactions in-run on `date|amount|description`
- Imports rules/goals only if the referenced category exists

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Invalid login credentials" | Check SUPABASE keys match the project |
| Magic link email not arriving | Check spam. Supabase's free mailer is rate-limited — plug in your own SMTP in Supabase Auth → Emails for reliability |
| Google button loops back to sign-in | Google OAuth redirect URI must be EXACTLY `https://YOUR-PROJECT.supabase.co/auth/v1/callback` — no trailing slash |
| "Row-level security policy violation" | You haven't run the migrations — see Part 2b (both `0001_` and `0002_`) |
| 422 on POST /api/categories with `is_income` | You skipped migration `0002_category_is_income.sql` — run it |
| 422 on GET /api/transactions with `limit=2000` | Old cap was 1000; current schema accepts up to 5000. Pull the latest code |
| Vercel build fails with "Module not found" | Ensure `backend` is set as Root Directory in Vercel, not repo root |
| "Cannot read properties of undefined (reading 'startsWith')" on Dashboard | Pre-fix code — pull the latest; this was caused by rendering a Date object directly |
| Pending writes won't drain | Reset widget (bottom-right, dev-only) → Flush now. If they 4xx permanently, they move to dead-letter and stop retrying |

---

## Phase 4 — Analytics + Crash Reporting (optional but recommended)

### PostHog (product analytics)

1. Sign up at [posthog.com](https://posthog.com) — free up to 1M events/month
2. Create a project, copy the **Project API key** and **Host** (e.g. `https://us.i.posthog.com`)
3. Add to Vercel environment variables:
   ```
   NEXT_PUBLIC_POSTHOG_KEY=phc_...
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   ```
4. Events tracked automatically: `signed_up`, `signed_in`, `tab_viewed`, `paywall_shown`,
   `checkout_started`, `checkout_completed`, `ai_used`, `transaction_created`, `$pageview`

### Sentry (crash reporting)

1. Sign up at [sentry.io](https://sentry.io) — free tier includes 5K errors/month
2. Create a **Next.js** project
3. Copy the **DSN** (looks like `https://abc123@o0.ingest.sentry.io/456`)
4. Add to Vercel environment variables:
   ```
   NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
   ```
5. Optional — to upload source maps for better stack traces (add to Vercel build env):
   ```
   SENTRY_AUTH_TOKEN=sntrys_...
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=your-project-slug
   ```

Both integrations are no-ops if the env vars are absent — the app works fine without them.

---

## What ships

All milestones landed:

- **M1** — Foundation (schema, auth)
- **M2** — CRUD API routes
- **M3** — Offline-first sync + service worker
- **M4** — Full UI port (Ledger / Dashboard / Compare / Weekly / Rules / Goals / Setup / ⌘K / Drawer / Onboarding)
- **M5** — Server-side AI (categorize / parse / insights) with per-user daily cap + merchant-map cache
- **M6** — JSON importer from the legacy standalone
- **M7** — This doc
