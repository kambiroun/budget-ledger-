# Budget Ledger — Manual Setup Tasks

This file is the single source of truth for everything that requires clicking around
dashboards, generating keys, or running commands outside of the codebase.
Work through sections in order. Each section ends with a verification step so you
know it's working before moving on.

---

## Quick-reference: all environment variables

Add these in **Vercel → Project → Settings → Environment Variables** (Production + Preview).

| Variable | Where to get it | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | ✅ Core |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | ✅ Core |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role | ✅ Core |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | ✅ Core |
| `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL | ✅ Core |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key | ✅ Billing |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API keys → Publishable key | ✅ Billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → signing secret | ✅ Billing |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Stripe → Products → Pro → Monthly price ID | ✅ Billing |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Stripe → Products → Pro → Annual price ID | ✅ Billing |
| `STRIPE_PLUS_MONTHLY_PRICE_ID` | Stripe → Products → Plus → Monthly price ID | ✅ Billing |
| `STRIPE_PLUS_ANNUAL_PRICE_ID` | Stripe → Products → Plus → Annual price ID | ✅ Billing |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog → Project Settings → Project API Key | Analytics |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` (or EU if applicable) | Analytics |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Project → Settings → Client Keys (DSN) | Crash reporting |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens → Create New | Source maps (optional) |
| `SENTRY_ORG` | Your Sentry org slug | Source maps (optional) |
| `SENTRY_PROJECT` | Your Sentry project slug | Source maps (optional) |
| `PLAID_CLIENT_ID` | dashboard.plaid.com → Team Settings → Keys | Plaid bank sync |
| `PLAID_SECRET` | dashboard.plaid.com → Team Settings → Keys (Sandbox secret) | Plaid bank sync |
| `PLAID_ENV` | `sandbox` for testing, `production` when live | Plaid bank sync |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase → Project Settings → Service accounts → Generate new private key | Phase 8 push |
| `RESEND_API_KEY` | resend.com → API Keys → Create API Key | Phase 8 email |
| `RESEND_FROM_EMAIL` | `Budget Ledger <noreply@yourdomain.com>` | Phase 8 email (optional) |
| `CRON_SECRET` | Any random string (`openssl rand -hex 32`) | Phase 8 cron security |

---

## Section 1 — Stripe + Supabase billing setup

**Estimated time: 45–60 minutes**
**Must be done before: anyone can pay you**

### 1.1 Run Supabase migrations

Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.

Run each migration below in a **separate query** (click **New query**, paste, click **Run**).
You should see `Success. No rows returned.` after each.

> ⚠️ Run them in numeric order. Each one is idempotent (`if not exists`) so re-running is safe.

**Migration 0005 — billing schema** *(required for Stripe)*

```sql
-- ============================================================================
-- Budget Ledger — Billing schema (M5)
-- ============================================================================

alter table public.profiles
  add column if not exists subscription_status text not null default 'free'
    check (subscription_status in ('free','pro','plus','past_due','canceled')),
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists current_period_end timestamptz,
  add column if not exists anthropic_byo_key text;

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles(stripe_customer_id);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;

create policy "service_role_only" on public.billing_events
  using (false);
```

**Migration 0006 — push token** *(required for iOS/Android notifications)*

```sql
-- ============================================================================
-- Budget Ledger — Push token (M6)
-- ============================================================================

alter table public.profiles
  add column if not exists push_token text;
```

✅ **Verify**: In Supabase → **Table Editor** → `profiles`, confirm the new columns
(`subscription_status`, `stripe_customer_id`, `push_token`) are visible.

---

### 1.2 Create a Stripe account

If you don't have one: [stripe.com](https://stripe.com) → **Start now** → complete onboarding.

To accept real payments you need to activate your account (add business details + bank account).
You can skip this for initial testing — test mode works without activation.

---

### 1.3 Create Stripe products and prices

Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Products** → **Add product**.

#### Product 1: Budget Ledger Pro

1. Name: `Budget Ledger Pro`
2. Description: `AI categorization, receipt extraction, natural-language entry, dashboard insights`
3. Click **Add a price**:
   - Pricing model: **Standard pricing**
   - Price: `8.00` USD
   - Billing period: **Monthly**
   - Click **Save**
4. Click **Add another price**:
   - Price: `72.00` USD
   - Billing period: **Yearly**
   - Click **Save**
5. Click **Save product**

After saving, click into each price to see its **Price ID** (format: `price_1ABC...`).
Copy these two IDs — you'll add them to Vercel shortly.

#### Product 2: Budget Ledger Plus

1. Name: `Budget Ledger Plus`
2. Description: `Everything in Pro, plus bank sync via Plaid (up to 4 accounts)`
3. Add two prices the same way:
   - Monthly: `15.00` USD/month
   - Annual: `144.00` USD/year
4. Save the product and copy both price IDs.

You now have **4 price IDs** total.

---

### 1.4 Get Stripe API keys

Go to [Stripe Developers → API keys](https://dashboard.stripe.com/apikeys).

- **Publishable key**: starts with `pk_test_...` (test) or `pk_live_...` (live)
- **Secret key**: starts with `sk_test_...` or `sk_live_...` — click **Reveal**

> ⚠️ Use test mode keys during development. Switch to live keys when you're ready
> to accept real payments.

---

### 1.5 Add all Stripe env vars to Vercel

Go to [Vercel Dashboard](https://vercel.com/dashboard) → your project → **Settings** →
**Environment Variables**. Add each one for **Production** and **Preview**.

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` (or `sk_live_...` for production) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` (or `pk_live_...`) |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_...` (from step 1.3) |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | `price_...` (from step 1.3) |
| `STRIPE_PLUS_MONTHLY_PRICE_ID` | `price_...` (from step 1.3) |
| `STRIPE_PLUS_ANNUAL_PRICE_ID` | `price_...` (from step 1.3) |
| `NEXT_PUBLIC_APP_URL` | `https://your-vercel-url.vercel.app` |
| `STRIPE_WEBHOOK_SECRET` | Set this **after** step 1.6 below |

Click **Save** after adding all. Then go to **Deployments** → **Redeploy** the latest
deployment so it picks up the new env vars.

---

### 1.6 Register the Stripe webhook

The webhook is how Stripe tells your app "this person just paid." Without it, users
won't be upgraded to Pro after checkout.

1. Go to [Stripe Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. **Endpoint URL**: `https://your-vercel-url.vercel.app/api/billing/webhook`
   *(use your actual Vercel URL — the one in `NEXT_PUBLIC_APP_URL`)*
4. **Description**: Budget Ledger billing events
5. Click **Select events** → add these 4 events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
6. Click **Add endpoint**
7. On the endpoint detail page, click **Reveal** under **Signing secret**
8. Copy the `whsec_...` value
9. Go back to Vercel → Environment Variables → add:
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
10. Redeploy again

> **Local testing**: use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward
> webhooks to `localhost:3000`:
> ```bash
> stripe listen --forward-to localhost:3000/api/billing/webhook
> ```
> The CLI prints a local webhook signing secret — set that as `STRIPE_WEBHOOK_SECRET`
> in your `.env.local` for local testing only.

---

### 1.7 Update Supabase auth redirect URL

Mobile apps use the `budgetledger://` URL scheme for magic-link callbacks.

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** →
   **URL Configuration**
2. Under **Redirect URLs**, add:
   - `budgetledger://auth/callback`
3. Click **Save**

---

### 1.8 Verify the full billing flow

1. Sign up for a new account on your deployed app
2. Navigate to `/pricing` — you should see Free / Pro / Plus columns
3. Click **Get Pro** — you should be redirected to Stripe Checkout
4. Complete checkout using test card `4242 4242 4242 4242`, any future expiry, any CVC
5. After checkout, you should be redirected to `/app?billing=success`
6. Open Setup → Billing — your tier should show **Pro**
7. In Stripe Dashboard → **Customers**, confirm the customer was created
8. In Stripe Dashboard → **Webhooks** → your endpoint → **Recent deliveries**,
   confirm `checkout.session.completed` shows **200 OK**

✅ **Verification checklist:**
- [ ] Stripe Checkout opens from `/pricing`
- [ ] Test payment completes and redirects back to `/app`
- [ ] Billing section shows "Pro" after payment
- [ ] Webhook delivery shows 200 OK
- [ ] Cancelling in the portal (Setup → Manage subscription) downgrades to Free

---

## Section 2 — iOS App Store submission

**Estimated time: 1–2 weeks (includes Apple review)**
**Must be done before: iOS users can install the app**

This section is fully documented in [`backend/CAPACITOR_SETUP.md`](backend/CAPACITOR_SETUP.md).
Key steps that interact with external services:

### 2.1 Apple Developer Program enrollment

1. Go to [developer.apple.com/programs](https://developer.apple.com/programs)
2. Enroll as an individual ($99/year)
3. **Start this on day 1** — approval takes 24–48 hours

### 2.2 Supabase: add iOS redirect URL

*(Same as step 1.7 above if you haven't done it yet)*

1. Supabase → Authentication → URL Configuration
2. Add `budgetledger://auth/callback` to Redirect URLs

### 2.3 App Store Connect submission checklist

See [`backend/CAPACITOR_SETUP.md`](backend/CAPACITOR_SETUP.md) §11 for the full
checklist. Key URLs to set in App Store Connect:

- **Privacy Policy URL**: `https://budget-ledger.vercel.app/privacy`
- **Support URL**: `mailto:kamranbiroun@gmail.com`
- **Marketing URL**: `https://budget-ledger.vercel.app`

> ⚠️ **Apple IAP note**: The upgrade buttons open Stripe in Safari (not inside the
> WebView). This is intentional — Apple rejects apps that route in-app payments
> through a third-party payment page inside the webview.

---

## Section 3 — Analytics + crash reporting

**Estimated time: 20 minutes**
**Must be done before: you can measure retention or catch crashes**

### 3.1 PostHog setup

**Dashboard**: [app.posthog.com](https://app.posthog.com)

1. Sign up at [posthog.com](https://posthog.com) — free up to 1M events/month
2. Create an **Organization** and a **Project** named "Budget Ledger"
3. Select **Web** as the platform
4. On the project overview page, find **Project API Key** — it looks like `phc_abc123...`
5. Note the **API Host** (e.g. `https://us.i.posthog.com` for US data residency,
   `https://eu.i.posthog.com` for EU)
6. Add to Vercel environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | `phc_...` |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` |

7. Redeploy on Vercel

**Verify**: Sign in to your app, then open PostHog → **Live Events**. You should see
`$pageview`, `signed_in`, and `tab_viewed` events appear in real time.

**Key events the app already tracks:**

| Event | When it fires |
|---|---|
| `signed_up` | New account created (any method) |
| `signed_in` | Successful sign-in |
| `tab_viewed` | User switches tabs (dashboard, ledger, etc.) |
| `paywall_shown` | Upgrade modal opened |
| `checkout_started` | User clicks a pricing button |
| `checkout_completed` | Stripe checkout success redirect lands |
| `ai_used` | AI parse feature used (command palette) |
| `transaction_created` | Transaction created via AI parse |
| `$pageview` | Every page navigation |

---

### 3.2 Sentry setup

**Dashboard**: [sentry.io](https://sentry.io)

1. Sign up at [sentry.io](https://sentry.io) — free tier includes 5,000 errors/month
2. Create an organization (your name or "Budget Ledger")
3. Create a new **Project**:
   - Platform: **Next.js**
   - Project name: `budget-ledger`
4. On the setup page, find the **DSN** — it looks like:
   `https://abc123def456@o123456.ingest.sentry.io/789012`
5. Add to Vercel:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | `https://...@sentry.io/...` |

6. Redeploy on Vercel

**Optional — source maps for readable stack traces** (highly recommended):

7. In Sentry → **Settings** → **Auth Tokens** → **Create New Token**
   - Permissions: `project:releases`, `org:read`
   - Copy the `sntrys_...` token
8. In Sentry → **Settings** → **Organization** → note the **Organization Slug**
9. Add these 3 vars to Vercel (build environment):

| Variable | Value |
|---|---|
| `SENTRY_AUTH_TOKEN` | `sntrys_...` |
| `SENTRY_ORG` | your-org-slug |
| `SENTRY_PROJECT` | budget-ledger |

**Verify**: Open your deployed app and click around. Then go to Sentry → **Issues** —
you should see no new issues (meaning it's connected but no crashes yet). To confirm
the connection is live, temporarily add `throw new Error("test")` somewhere client-side,
trigger it, and confirm it appears in Sentry Issues.

---

## Section 4 — Android Play Store setup

**Estimated time: 2–3 weeks (includes 14-day mandatory closed testing)**
**Must be done before: Android users can install the app**

### 4.1 Install required tools

On your development machine (Windows, macOS, or Linux):

1. **Android Studio** — download from [developer.android.com/studio](https://developer.android.com/studio)
   - Run the installer and accept all defaults
   - Open Android Studio → **More Actions** → **SDK Manager**
   - SDK Platforms: install **Android 14 (API 34)**
   - SDK Tools: ensure **Android Build-Tools 34**, **Android Emulator** are checked
   - Click **Apply**

2. **JDK 17** — Android Studio ships one, but if needed:
   - Windows: `winget install Microsoft.OpenJDK.17`
   - macOS: `brew install openjdk@17`

3. Verify installation:
   ```bash
   java -version   # should show 17.x
   ```

---

### 4.2 Add the Android platform

```bash
cd backend
npm install
npx cap add android
npx cap sync
```

This creates an `android/` directory (~50MB). It is in `.gitignore`.

Open Android Studio:
```bash
npx cap open android
```

Wait for **Gradle sync** to complete (2–5 min). You'll see "BUILD SUCCESSFUL" in the Build tab.

---

### 4.3 Create a Firebase project for FCM

Android push notifications require Firebase Cloud Messaging.
**[Firebase Console](https://console.firebase.google.com)**

1. Click **Add project** → name it "Budget Ledger"
2. Skip Google Analytics (or enable it — your choice)
3. Once created, click **Add app** → select the **Android** icon
4. Fill in:
   - **Android package name**: `com.kamran.budgetledger`
   - **App nickname**: Budget Ledger Android
   - **SHA-1** (optional for now, needed for Google Sign-In later)
5. Click **Register app**
6. Download **`google-services.json`**
7. Place it at: `android/app/google-services.json`
   *(this file is in `.gitignore` — it contains credentials, never commit it)*
8. Skip the remaining Firebase SDK steps — Capacitor handles them automatically

✅ **Verify**: After placing `google-services.json`, run:
```bash
npx cap sync android
```
No errors should appear.

---

### 4.4 Generate a release signing keystore

This keystore is your app's permanent identity on the Play Store.
**Back it up to a password manager. If you lose it, you can never update your app.**

```bash
keytool -genkey -v \
  -keystore release-key.jks \
  -alias budgetledger \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You'll be prompted for:
- **Keystore password** — pick a strong one, save it in your password manager
- **Key password** — can be the same as keystore password
- **Name, org, city, country** — these appear in the certificate; use real values

Store `release-key.jks` somewhere safe **outside** the repo (e.g. `~/keys/budget-ledger/`).

---

### 4.5 Configure Gradle signing

**Step 1** — Create `android/key.properties` (add this file to `.gitignore`):

```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=budgetledger
storeFile=../../../keys/budget-ledger/release-key.jks
```

> Adjust `storeFile` to the actual path where you stored `release-key.jks`.
> The path is relative to `android/app/`.

**Step 2** — Edit `android/app/build.gradle`. Find the top of the file and add
**before** the `android {` block:

```groovy
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

**Step 3** — Inside the `android { ... }` block, add a `signingConfigs` section
and update `buildTypes`:

```groovy
android {
    // ... existing config ...

    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword']
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

**Step 4** — Verify `compileSdkVersion` and `targetSdkVersion` are `34`:

```groovy
android {
    compileSdkVersion 34
    defaultConfig {
        minSdkVersion 23
        targetSdkVersion 34
        // ...
    }
}
```

---

### 4.6 Add app icons

Android requires adaptive icons (API 26+) plus legacy icons for older devices.

1. Go to [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html)
2. Upload your 1024×1024 app icon
3. Foreground: set appropriate padding (~10–15%)
4. Download the ZIP
5. Extract and place the `mipmap-*` folders into `android/app/src/main/res/`
   - Replace the existing `mipmap-*` folders

After adding icons, sync:
```bash
npx cap sync android
```

---

### 4.7 Configure deep links in AndroidManifest.xml

Open `android/app/src/main/AndroidManifest.xml` in Android Studio.
Find the `<activity>` element that contains `android.intent.action.MAIN` and add
this intent filter inside it:

```xml
<!-- budgetledger:// URL scheme for magic-link auth callbacks -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="budgetledger" />
</intent-filter>
```

**Optional: App Links (https://) for Android 12+** — more reliable than custom schemes.
Add a second intent filter:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https"
          android:host="budget-ledger.vercel.app"
          android:pathPrefix="/auth/callback" />
</intent-filter>
```

If you add App Links, also create `backend/public/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.kamran.budgetledger",
    "sha256_cert_fingerprints": ["AA:BB:CC:..."]
  }
}]
```

Get your SHA-256 fingerprint:
```bash
keytool -list -v -keystore release-key.jks -alias budgetledger | grep SHA256
```

---

### 4.8 Build a signed release AAB

In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle → Next**
- Key store path: browse to `release-key.jks`
- Key store password + key alias + key password
- Build variant: **release**
- Click **Finish**

Or from the command line:
```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

---

### 4.9 Create your Google Play Developer account

1. Go to [play.google.com/console](https://play.google.com/console)
2. Sign up with your Google account ($25 one-time fee)
3. Complete the developer profile (name, email, address)
4. Agree to the Distribution Agreement

---

### 4.10 Create the app in Play Console

1. **Play Console → All apps → Create app**
2. App name: **Budget Ledger**
3. Default language: **English (United States)**
4. App or game: **App**
5. Free or paid: **Free**
6. Check both policy agreement boxes
7. Click **Create app**

---

### 4.11 Complete the store listing

In Play Console → **Store presence → Main store listing**:

| Field | Content |
|---|---|
| App name | Budget Ledger |
| Short description (80 chars) | A quiet personal finance app. No ads, no algorithms. |
| Category | Finance |
| Email | kamranbiroun@gmail.com |
| Privacy policy URL | https://budget-ledger.vercel.app/privacy |

**Full description** (copy-paste):
```
Budget Ledger is a clean, editorial personal finance app for people who want to think clearly about money.

Track income and expenses by category, set monthly budgets, build savings goals, and import transactions from CSV or bank statements. Everything stays in sync across your devices.

AI-powered features help you categorize transactions and scan receipts automatically — or use it completely without AI.

No ads. No data brokers. No dark patterns. Just your ledger.

Free to use. Pro subscription ($8/mo) unlocks AI features.
```

**Screenshots** (required: at least 2 phone screenshots, 16:9 or 9:16 ratio):
1. Run the app on a Pixel 7 emulator in Android Studio
2. Navigate to: Ledger, Dashboard, Goals, Receipt scan, Command palette
3. Take screenshots from the emulator toolbar (camera icon)
4. Upload under **Phone screenshots** (1080×1920 recommended)

---

### 4.12 Content rating questionnaire

Play Console → **Policy → App content → Content rating**:

1. Click **Start questionnaire**
2. Select **Utility** category
3. Questions: answer **No** to violence, sexual content, profanity
4. Financial services section: indicate it's a **personal finance tracking app**
5. Submit — you'll receive a rating (likely **Everyone / PEGI 3**)

---

### 4.13 Internal testing (do this first)

Before closed testing, test internally:

1. Play Console → **Testing → Internal testing → Create new release**
2. Upload your `app-release.aab`
3. Add release notes: "Initial internal test build"
4. Under **Testers**, create a list with your own email
5. Click **Save and publish**
6. Install on your own phone via the internal testing link
7. Test the full flow:
   - [ ] App installs and loads
   - [ ] Sign in with email/password
   - [ ] Add a transaction
   - [ ] Camera permission for receipt scan
   - [ ] Biometric lock after backgrounding 15s
   - [ ] Back button shows "press again to exit" toast
   - [ ] Upgrade modal opens Stripe in browser (not in-app)

---

### 4.14 Closed testing track (mandatory 14-day requirement)

Google Play requires new developer accounts to run a closed test with **at least 20
opted-in testers for 14 continuous days** before promoting to production.

**This is the longest step — start it as early as possible.**

1. Play Console → **Testing → Closed testing → Create track**
   - Track name: `beta`
2. Click **Create new release**, upload the same AAB
3. Play Console → **Testing → Closed testing → Testers**:
   - Click **Create email list** → name it "Beta Testers"
   - Add 20+ email addresses (see sources below)
   - Copy the **opt-in URL** (a play.google.com link)
4. Share the opt-in URL with testers and ask them to:
   a. Click the opt-in link
   b. Install the app from the Play Store
   c. Actually open and use it (Google tracks active installs)
5. Monitor: **Testing → Closed testing → track details** — shows active tester count

**Where to find 20 testers:**
- Friends and family (the app is free)
- Post in [r/betatesting](https://reddit.com/r/betatesting): "Looking for beta testers for a budgeting app"
- Post in [r/androiddev](https://reddit.com/r/androiddev)
- Beta testing Discord servers (search "app beta testing Discord")
- Post in your Twitter/Bluesky followers

**The 14-day clock starts when testers opt in.** You can't fast-track it.

---

### 4.15 Promote to production

After 14 days and 20+ active testers:

1. Play Console → **Production → Create new release**
2. Upload the same (or a newer) AAB
3. Add release notes: "Budget Ledger — track your spending, set budgets, reach your goals."
4. Click **Review release** → **Start rollout to Production**
5. Start at **20% rollout** — monitor for 3 days before going to 100%

**Rollout cadence:**
- Day 1: 20% — watch Sentry and Play Console Android Vitals
- Day 3–4: increase to 50% if crash-free rate > 99%
- Day 7: increase to 100%

---

### 4.16 Post-launch monitoring

**Play Console → Android Vitals:**
- Crash rate target: **< 1%** (Google flags apps > 1.09%)
- ANR rate target: **< 0.47%** (Google may restrict distribution above this)

**Sentry:**
- Confirm Android crashes are tagged with `platform: android`
- Set up a Slack/email alert for new issues

---

## Section 5 — Validation checkpoint

**Complete this before starting Phase 6 (Plaid bank sync)**

The decision rule from the roadmap: **get 5 paying users within 14 days of launch.**
If you can't convert 5 people from your own network, pause and fix the upgrade flow
before building Plaid integration.

### 5.1 Launch announcement checklist

- [ ] **Email your list** — even 20 people is enough. Subject: "I built a budgeting app — try it free"
- [ ] **Twitter/Bluesky** — short post with a screenshot of the Ledger or Dashboard
- [ ] **r/personalfinance** — post in the weekly "Tools and Resources" thread (read rules first)
- [ ] **r/YNAB** — "I built a YNAB alternative with AI categorization"
- [ ] **r/SideProject** — direct self-promotion is allowed
- [ ] **ProductHunt** — hold this until Android is also live (bigger launch)

### 5.2 Demo account note

The app has a "Load demo data" button in Setup. **Make sure it works on your live
deployment** — Apple reviewers and curious users will use it to evaluate without signing up.

### 5.3 Check your numbers after 14 days

| Metric | Where to check | Target |
|---|---|---|
| Total installs | App Store Connect → App Analytics | ≥ 50 |
| Paid conversions | Stripe Dashboard → Customers (filter by created date) | ≥ 5 |
| Conversion rate | Stripe / PostHog | ≥ 5% of signups |
| Crash-free rate | Sentry → Project → Performance | > 99.5% |
| Paywall shown vs checkout started | PostHog → Funnels | Identify biggest drop-off |

**Stripe Dashboard links:**
- Customers: [dashboard.stripe.com/customers](https://dashboard.stripe.com/customers)
- Revenue: [dashboard.stripe.com/revenue](https://dashboard.stripe.com/revenue)
- Subscriptions: [dashboard.stripe.com/subscriptions](https://dashboard.stripe.com/subscriptions)

**PostHog funnel to create:**
1. PostHog → **Insights** → **New insight** → **Funnels**
2. Add steps: `signed_up` → `paywall_shown` → `checkout_started` → `checkout_completed`
3. Save as "Upgrade Funnel"
4. This shows exactly where users drop off

### 5.4 Decision gate

| Result | Action |
|---|---|
| ≥ 5 paid users | ✅ Continue to Phase 6 (Plaid Sandbox) |
| 1–4 paid users | Iterate on upgrade flow + pricing page before building Plaid |
| 0 paid users | Stop and talk to users. Ask: "What would make you pay $8/mo?" |

**The most common reasons for 0 conversions:**
- Users don't hit the paywall (they don't use AI features) → add more nudges
- Paywall is shown but not converting → try lowering price or offering a free trial
- Not enough traffic → more channels, not more features

---

## Section 6 — Plaid Sandbox bank sync

**Estimated time: 20 minutes**
**Must be done before: the "Connected banks" section in Setup works**

### 6.1 Run the Plaid migration

Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor** →
**New query**. Paste the full contents of `backend/supabase/migrations/0007_plaid.sql` and
click **Run**. You should see `Success. No rows returned.`

This creates three things:
- `plaid_items` table (stores access tokens server-side — no user-facing RLS)
- `plaid_accounts` table (safe account metadata — user-readable)
- `plaid_transaction_id` unique column on `transactions` (idempotent sync)

✅ **Verify**: Supabase → **Table Editor** → confirm `plaid_items` and `plaid_accounts`
appear, and `transactions` has a new `plaid_transaction_id` column.

---

### 6.2 Create a Plaid account and get Sandbox keys

1. Go to [dashboard.plaid.com](https://dashboard.plaid.com) → **Get started**
2. Sign up with your email
3. When asked about your use case, choose **Personal finance** → **I'm building for myself**
4. You'll land in the Plaid Dashboard. Sandbox access is enabled automatically.
5. Go to **Team Settings → Keys** (left sidebar)
6. Copy two values:
   - **client_id** — a short alphanumeric string (same for all environments)
   - **Sandbox secret** — under the Sandbox row

> Plaid has three environments: **Sandbox** (fake data, always free), **Development**
> (real bank connections, limited to 100 items, free), and **Production** (requires
> approval + billing). For Phase 6, Sandbox is all you need.

---

### 6.3 Add env vars to Vercel

Go to [Vercel Dashboard](https://vercel.com) → your project → **Settings → Environment Variables**.
Add for **Production** and **Preview**:

| Variable | Value |
|---|---|
| `PLAID_CLIENT_ID` | your client_id from step 6.2 |
| `PLAID_SECRET` | your Sandbox secret from step 6.2 |
| `PLAID_ENV` | `sandbox` |
| `NEXT_PUBLIC_APP_URL` | your Vercel deployment URL (already set from Section 1) |

Also add to your local `backend/.env.local` for development:

```bash
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
PLAID_ENV=sandbox
```

Redeploy on Vercel after adding the vars (**Deployments → Redeploy latest**).

---

### 6.4 Test the bank connection flow (Sandbox)

In Plaid Sandbox, no real bank credentials are used — everything is fake test data.

1. Open your app → **Setup tab** → scroll to **Connected banks**
2. Click **Connect a bank**
3. Plaid Link will open (a modal or overlay)
4. Search for any institution — try **"Chase"** or **"Wells Fargo"**
5. Enter these Sandbox test credentials:
   - **Username**: `user_good`
   - **Password**: `pass_good`
6. Select one or more accounts and click **Continue**
7. Plaid Link closes — you should see:
   - A status message: "Connected — imported N transactions"
   - The institution card appearing under Connected banks
   - Account name(s) listed below the institution with last-4 mask

**Verify in the Ledger tab:**
- Transactions with `source = plaid` should now appear
- They will have real-looking merchant names and amounts (Plaid Sandbox generates
  realistic fake data)

---

### 6.5 Test Sync now and Disconnect

**Sync now:**
1. Click **Sync now** in the Connected banks section
2. Status should show "Sync complete — 0 new transactions" (nothing changed since initial sync)

**Disconnect:**
1. Click **Disconnect** on the institution card
2. Confirm the dialog
3. The card should disappear
4. The previously imported transactions **stay in your ledger** (they are never auto-deleted)
5. Re-connect the same institution — it imports fresh from Plaid's cursor

---

### 6.6 Plaid webhook setup (optional for Sandbox, required for production)

The webhook fires when Plaid has new transactions ready (`SYNC_UPDATES_AVAILABLE`).
In Sandbox you can trigger it manually; in production it fires automatically.

**Register the webhook URL in Plaid Dashboard:**

1. [dashboard.plaid.com](https://dashboard.plaid.com) → **API** → **Webhooks**
2. Add webhook URL: `https://budget-ledger.vercel.app/api/plaid/webhook`

**Test the webhook manually in Sandbox:**
Use the [Plaid Sandbox API](https://plaid.com/docs/sandbox/) to fire a test event, or
simply use the "Sync now" button — it calls the same sync logic the webhook triggers.

> For production: the webhook route at `/api/plaid/webhook` currently does not verify
> the Plaid webhook signature (intentionally skipped for Sandbox). In Phase 7 (production
> launch), add signature verification using `PLAID_WEBHOOK_SECRET` before going live.

---

### 6.7 Verification checklist

- [ ] Migration `0007_plaid.sql` ran successfully (tables visible in Supabase)
- [ ] `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox` added to Vercel + redeployed
- [ ] "Connect a bank" button appears in Setup → Connected banks
- [ ] Plaid Link opens when clicked (no console errors)
- [ ] Sandbox credentials `user_good` / `pass_good` work
- [ ] Transactions appear in the Ledger with source `plaid`
- [ ] "Sync now" runs without error
- [ ] "Disconnect" removes the institution card
- [ ] Transactions imported before disconnecting remain in the Ledger

---

### 6.8 Upgrading to Plaid Production (Phase 7)

When you're ready for real bank connections:

1. In Plaid Dashboard → **API** → **Request development access** (free, up to 100 items)
2. Once approved, swap `PLAID_ENV=development` and update `PLAID_SECRET` to the Development secret
3. For Production access: submit the Plaid production application (requires privacy policy URL
   and description of how you use financial data — point to `https://budget-ledger.vercel.app/privacy`)
4. Webhook signature verification is already implemented — it activates automatically
   when `PLAID_ENV=production`. No code changes needed.
5. Update `PLAID_ENV=production` and `PLAID_SECRET` to the Production secret

---

## Section 7 — Plaid production + Plus tier launch

**Estimated time: 1–2 weeks (Plaid production approval takes time)**
**Must be done before: real bank connections work for paying users**

### 7.1 What changed in Phase 7

Phase 7 hardened the bank sync integration for production:

- **Webhook signature verification** — active when `PLAID_ENV=production`. Uses Plaid's
  ES256 JWT signature to reject spoofed webhooks. No code changes needed from you.
- **Plus tier gate** — `/api/plaid/link-token` and `/api/plaid/exchange` now return 402
  if the user is not on the Plus plan. The BanksPanel shows an upgrade prompt.
- **4-item limit** — Plus plan allows up to 4 linked institutions.
- **Re-link flow** — items that hit `ITEM_LOGIN_REQUIRED` (bank password changed, MFA
  required, etc.) show a red "Fix" button. Clicking it opens Plaid Link in update mode
  so the user can re-authenticate without disconnecting.
- **Auto-categorization** — new Plaid transactions are run through the user's rules
  engine on import (same rules as CSV import). Modified transactions preserve the user's
  manually-set category.

---

### 7.2 Make Plus plan live in Stripe

If you haven't already completed Section 1.3 (creating the Plus product in Stripe), do
that now. The Plus plan is what gates access to bank sync.

**Verify the Plus plan works end-to-end:**

1. Sign in to your app with a test account
2. Go to `/pricing` — confirm "Plus" column shows at $15/mo and $144/yr
3. Click "Get Plus" → complete Stripe checkout with test card `4242 4242 4242 4242`
4. Return to `/app` → Setup → Connected banks — should show the connection UI (not the
   upgrade prompt)
5. Connect a Sandbox bank (credentials: `user_good` / `pass_good`)
6. Confirm transactions import and are auto-categorized by your rules

---

### 7.3 Request Plaid Development access

Plaid Development allows real bank connections, up to 100 linked items, at no cost.
This is the right environment to test with your own real bank before Production.

1. Sign in to [dashboard.plaid.com](https://dashboard.plaid.com)
2. Go to **Team Settings → Access**
3. Click **Request development access** (or similar — the UI varies)
4. Fill in:
   - Use case: **Personal finance / expense tracking**
   - Description: "Budget Ledger — personal finance app that lets users import and
     categorize bank transactions. Users link their bank accounts to auto-sync transactions."
5. Approval is typically instant or within 1 business day

**Once approved**, swap to Development:

```bash
# In Vercel environment variables:
PLAID_SECRET=<Development secret from Plaid Dashboard → Team Settings → Keys>
PLAID_ENV=development
```

Redeploy on Vercel. Test with your own real bank account.

---

### 7.4 Verify the re-link flow works

To test the re-link flow in Sandbox:

1. Connect a Sandbox bank (from step 6.4)
2. In Plaid Dashboard → **Sandbox** → **User Inspector**, find your item
3. Set the item to `ITEM_LOGIN_REQUIRED` error state (or use the Plaid API to simulate it)
4. Go to Setup → Connected banks — the institution card should turn red with "Fix" button
5. Click "Fix" — Plaid Link opens in update mode
6. Re-enter Sandbox credentials: `user_good` / `pass_good`
7. Institution card should turn back to normal, last-sync time updates

---

### 7.5 Request Plaid Production access

Production access requires a formal application reviewed by Plaid.

**Before applying, verify these are live on your deployment:**

- [ ] Privacy policy page: `https://budget-ledger.vercel.app/privacy` (built in Phase 3)
- [ ] Terms of service page: `https://budget-ledger.vercel.app/terms` (built in Phase 3)
- [ ] App is deployed and working end-to-end

**Submit the Production application:**

1. Plaid Dashboard → **Team Settings → Access** → **Request production access**
2. Required information:
   - **App website**: `https://budget-ledger.vercel.app`
   - **Privacy policy URL**: `https://budget-ledger.vercel.app/privacy`
   - **Use case**: Personal finance — expense tracking and budgeting
   - **Data usage**: "Transaction data is displayed to the end user only. It is stored
     in Supabase (user's own data) and never shared with third parties or used for
     advertising. AI categorization processes descriptions client-side via Claude API."
   - **Security**: Plaid access tokens stored server-side only, never exposed to the
     browser. HTTPS enforced. Supabase RLS restricts all data to the owning user.
3. Approval typically takes **3–7 business days**

---

### 7.6 Go live with Production Plaid

Once Plaid approves Production access:

1. In Plaid Dashboard → **Team Settings → Keys**, copy the **Production secret**
2. Update Vercel environment variables:

| Variable | New value |
|---|---|
| `PLAID_SECRET` | Production secret (starts differently from Sandbox) |
| `PLAID_ENV` | `production` |

3. Redeploy on Vercel
4. Webhook signature verification is now **active** — Plaid webhooks will be verified
   with ES256 JWT signatures. Spoofed webhook requests will receive `400 invalid_signature`.

**Test with a real bank:**
5. Sign in with a Plus account on your live deployment
6. Connect a real bank account (use your own)
7. Verify transactions import and auto-categorize correctly
8. Test "Sync now" returns the correct count

---

### 7.7 Verification checklist

- [ ] Plus plan shown on `/pricing` at $15/mo and $144/yr
- [ ] Non-Plus users see upgrade prompt in Connected banks section
- [ ] Plus users can connect banks (Sandbox or Development)
- [ ] Auto-categorization applies user rules on new transactions
- [ ] Re-link "Fix" button appears for items with login errors
- [ ] Re-link flow successfully clears the error state
- [ ] 4-item limit enforced (5th connect attempt is rejected)
- [ ] `PLAID_ENV=production` activates webhook signature verification (check `/api/plaid/webhook` returns 400 for unsigned requests)
- [ ] Real bank transactions import correctly (after Production approval)

---

## Section 8 — Push notifications, email digests, and retention loops

**Estimated time: 30 minutes**
**Must be done before: budget overage push alerts work, weekly digest emails send**

### 8.1 What Phase 8 added

- **Budget overage push** — when a manually-entered transaction pushes a category over its monthly budget for the first time, the user gets a push notification (iOS/Android only, requires Firebase).
- **Weekly spending digest** — every Monday at 09:00 UTC, users with `notif_weekly_digest = true` receive an email with last week's spending by category, compared against their budgets.
- **Notification preferences** — two toggles in Setup → Notifications let users opt in/out per channel.

---

### 8.2 Run the notifications migration

Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor** → **New query**. Paste:

```sql
alter table public.profiles
  add column if not exists notif_budget_overage boolean not null default true,
  add column if not exists notif_weekly_digest  boolean not null default true;
```

Click **Run**. Verify the columns appear in Table Editor → `profiles`.

---

### 8.3 Firebase setup (for iOS/Android push notifications)

Push notifications require a Firebase project. This is the same Firebase project you set up in Section 4.3 (Android FCM) — you just need to generate a server-side service account key.

1. Go to [Firebase Console](https://console.firebase.google.com) → your "Budget Ledger" project
2. Click the gear icon → **Project settings** → **Service accounts** tab
3. Under **Firebase Admin SDK**, ensure **Node.js** is selected
4. Click **Generate new private key**
5. Download the JSON file (e.g. `budget-ledger-firebase-adminsdk.json`)
6. **Never commit this file.** Add it to `.gitignore` if you haven't already.
7. Open the file — it looks like:
   ```json
   {
     "type": "service_account",
     "project_id": "budget-ledger-xxxxx",
     "private_key_id": "abc123",
     "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n",
     "client_email": "firebase-adminsdk-xxxxx@budget-ledger-xxxxx.iam.gserviceaccount.com",
     ...
   }
   ```
8. In Vercel → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Paste the **entire JSON file contents** as a single line (minify it first) |

   To minify the JSON: open the file in a text editor and remove all newlines, OR run:
   ```bash
   node -e "console.log(JSON.stringify(require('./budget-ledger-firebase-adminsdk.json')))"
   ```

9. Redeploy on Vercel.

> **iOS APNs**: iOS push requires an APNs key uploaded to Firebase. Go to Firebase → Project settings → **Cloud Messaging** → **Apple app configuration** → upload your APNs key. See `backend/CAPACITOR_SETUP.md` for how to generate the APNs key in Apple Developer.

---

### 8.4 Test a budget overage push

1. On your iOS or Android device, open the app and grant notification permission (it will prompt automatically on first launch)
2. In Setup → Spending categories, ensure at least one category has a budget set (e.g. Food = $100)
3. Manually add a transaction that brings that category's total spending over the budget
4. You should receive a push notification: "Budget exceeded — You've spent $X in Food (budget: $Y)"

**If no notification arrives:**
- Check Vercel logs for `[fcm]` errors
- Confirm `FIREBASE_SERVICE_ACCOUNT_JSON` is set and properly escaped
- Confirm the device granted notification permission
- Confirm the app ran at least once after Phase 8 deploy (so the push token is saved)

---

### 8.5 Resend setup (for weekly digest emails)

1. Sign up at [resend.com](https://resend.com) — free tier: 3,000 emails/month, 100/day
2. In Resend → **API Keys** → **Create API Key**
   - Name: "Budget Ledger production"
   - Permission: **Sending access** (full access)
   - Copy the `re_...` key
3. **Verify a sending domain** (optional but recommended for deliverability):
   - Resend → **Domains** → **Add domain**
   - Enter your domain (e.g. `budgetledger.app`)
   - Add the DNS records Resend shows you (DKIM, SPF, DMARC)
   - Or use Resend's onboarding domain (`onboarding@resend.dev`) for early testing
4. Add to Vercel environment variables:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | `re_...` API key from step 2 |
| `RESEND_FROM_EMAIL` | `Budget Ledger <noreply@yourdomain.com>` (or leave unset to use default) |
| `CRON_SECRET` | Any random string (e.g. `openssl rand -hex 32`) — secures the cron endpoint |

5. Redeploy on Vercel.

---

### 8.6 Vercel Cron configuration

The weekly digest is triggered by a Vercel Cron Job defined in `backend/vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-digest",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

This runs every Monday at 09:00 UTC.

**Requirements:**
- Cron Jobs require **Vercel Pro** or higher. On the Hobby plan, crons are not supported.
- Verify in Vercel Dashboard → your project → **Cron Jobs** tab that the job appears after deploying.

**Manual test:**
```bash
curl -X POST https://your-vercel-url.vercel.app/api/cron/weekly-digest \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```
Response: `{"ok":true,"sent":N,"skipped":M,"week":"YYYY-MM-DD"}`

---

### 8.7 Verify the notification preferences UI

1. Open your deployed app → **Setup** → scroll down to **Notifications**
2. You should see two checkboxes:
   - "Budget overage alerts" (push, default on)
   - "Weekly spending digest" (email, default on)
3. Toggle either one off and confirm the PATCH request to `/api/profile` succeeds (check Network tab)

---

### 8.8 Verification checklist

- [ ] Migration ran — `notif_budget_overage` and `notif_weekly_digest` columns visible in Supabase
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` added to Vercel — no `[fcm]` errors in logs
- [ ] Budget overage push fires when a category first crosses its monthly budget
- [ ] `RESEND_API_KEY` and `CRON_SECRET` added to Vercel
- [ ] Weekly digest cron shows in Vercel → Cron Jobs (Pro plan required)
- [ ] Manual `curl` to `/api/cron/weekly-digest` returns `{"ok":true,...}`
- [ ] Notification preferences toggles in Setup work (PATCH /api/profile succeeds)
- [ ] Opting out of weekly digest skips that user in the cron

---

## Appendix: Local `.env.local` template

```bash
# backend/.env.local — never commit this file

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Stripe (use test-mode keys locally)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # get from: stripe listen --print-secret
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_PLUS_MONTHLY_PRICE_ID=price_...
STRIPE_PLUS_ANNUAL_PRICE_ID=price_...

# Plaid bank sync (Sandbox)
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
PLAID_ENV=sandbox

# Analytics + monitoring (optional locally)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# Push notifications + email (optional locally)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Budget Ledger <noreply@yourdomain.com>
CRON_SECRET=your_random_secret_here
```

---

## Appendix: Quick Stripe CLI cheat sheet

```bash
# Install (macOS)
brew install stripe/stripe-cli/stripe

# Install (Windows)
winget install Stripe.StripeCLI

# Log in
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/billing/webhook

# Trigger a test checkout completed event
stripe trigger checkout.session.completed

# Watch live events
stripe events tail

# Confirm webhook secret for local use
stripe listen --print-secret
```
