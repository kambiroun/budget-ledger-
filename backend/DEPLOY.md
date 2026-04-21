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
2. Open `backend/supabase/migrations/0001_initial.sql` from this repo
3. Paste the entire contents into the editor → **Run**
4. You should see `Success. No rows returned.`

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

Open your live URL, sign in with all three methods, confirm you land on `/app` and see the session info. You're done with M1.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Invalid login credentials" | Check SUPABASE keys match the project |
| Magic link email not arriving | Check spam. Supabase free tier uses a rate-limited mailer; add your own SMTP in Supabase Auth → Emails for reliability. |
| Google button loops back to sign-in | Google OAuth redirect URI must be EXACTLY `https://YOUR-PROJECT.supabase.co/auth/v1/callback` — no trailing slash |
| "Row-level security policy violation" | You haven't run the migration — see Part 2b |
| Vercel build fails with "Module not found" | Ensure `backend` is set as Root Directory in Vercel, not repo root |

---

## What's next

You're now at M1 done. Upcoming milestones (I'll deliver each as a single conversation turn):

- **M2** — API routes for reading/writing your actual budget data
- **M3** — Offline-first: IndexedDB + sync engine so the app keeps working with no signal
- **M4** — Port the full editorial UI (ledger, dashboard, compare, rules, goals)
- **M5** — Move AI categorization server-side so it works across devices
- **M6** — Import your existing localStorage data from the HTML version
- **M7** — Final README + production polish

Tell me when M1 is running locally and I'll ship M2.
