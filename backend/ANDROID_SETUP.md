# Android Setup & Play Store Guide

Everything here must be done on a machine with Android Studio installed.
Most steps can be done on Windows, macOS, or Linux.

---

## Prerequisites

- **Android Studio** (Hedgehog 2023.1.1+ recommended) — includes the Android SDK
- **JDK 17+** — Android Studio ships one, or `winget install Microsoft.OpenJDK.17`
- **Node.js 18+**
- A **Google Play Developer account** ($25 one-time at play.google.com/console)
- A **Firebase project** (for FCM push notifications on Android)

---

## 1. Install dependencies and add Android platform

```bash
cd backend
npm install
npx cap add android
npx cap sync
```

This creates an `android/` directory with a Gradle project.

---

## 2. Open in Android Studio

```bash
npx cap open android
```

Wait for Gradle sync to complete (~2–3 min on first open).

---

## 3. Set up Firebase for FCM (push notifications)

Android push notifications require Firebase Cloud Messaging (FCM).

1. Go to [Firebase Console](https://console.firebase.google.com) → **Add project**
2. Skip Google Analytics (optional)
3. In the project: **Add app** → Android
   - Android package name: `com.kamran.budgetledger`
   - App nickname: Budget Ledger Android
4. Download `google-services.json` and place it in `android/app/google-services.json`
5. Capacitor automatically configures FCM when this file is present

**Sending push notifications later (Phase 8):**
- In Firebase Console → **Cloud Messaging** → **Service accounts** → generate a new private key
- This JSON file is your FCM server credential for server-side sending
- Keep it secret — add it to Vercel as `FIREBASE_SERVICE_ACCOUNT_JSON`

---

## 4. Configure signing (for release builds)

### Generate a release keystore

```bash
keytool -genkey -v -keystore release-key.jks \
  -alias budgetledger \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

**Store this file securely — it can never be recovered if lost.** Back it up to a password manager or encrypted cloud storage. Never commit it to Git.

### Reference the keystore in Gradle

Create or edit `android/key.properties` (add this to `.gitignore`):
```
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=budgetledger
storeFile=../../release-key.jks
```

Edit `android/app/build.gradle` — add before the `android {}` block:
```groovy
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Inside `android { ... }`, add a `signingConfigs` block and update `buildTypes`:
```groovy
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
```

---

## 5. Add app icons

Android requires adaptive icons (foreground layer + background layer) plus legacy icons.

**Recommended tool**: [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html)

Place the generated folders in `android/app/src/main/res/`:
- `mipmap-hdpi/`, `mipmap-mdpi/`, `mipmap-xhdpi/`, `mipmap-xxhdpi/`, `mipmap-xxxhdpi/`
- For adaptive icons: `mipmap-anydpi-v26/ic_launcher.xml`

---

## 6. Deep link setup — intent filters

For `budgetledger://` URL scheme (magic-link auth callbacks), add an intent filter
to `android/app/src/main/AndroidManifest.xml` inside the `<activity>` element:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="budgetledger" />
</intent-filter>
```

**Optional: App Links (https://) for Android 12+**

App Links are more reliable than custom schemes on modern Android. To add them:

1. Add another intent filter:
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

2. Host a Digital Asset Links file at:
   `https://budget-ledger.vercel.app/.well-known/assetlinks.json`
   
   Content:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.kamran.budgetledger",
       "sha256_cert_fingerprints": ["YOUR_SIGNING_CERT_SHA256"]
     }
   }]
   ```
   
   Get your cert fingerprint:
   ```bash
   keytool -list -v -keystore release-key.jks -alias budgetledger
   ```

3. Add `/.well-known/assetlinks.json` as a static file in `backend/public/` and configure Vercel to serve it with `application/json` content type.

The `CapacitorBridge` already handles both `budgetledger://` and `https://` App Link callbacks.

---

## 7. Permissions in AndroidManifest.xml

These are already added by Capacitor plugins, but verify they're present:

```xml
<!-- Push Notifications (FCM) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>

<!-- Camera -->
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>

<!-- Network -->
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
```

---

## 8. Target API level

Google Play requires `targetSdkVersion 34` (Android 14) for new apps as of 2024.

In `android/app/build.gradle`:
```groovy
android {
    compileSdkVersion 34
    defaultConfig {
        minSdkVersion 23   // Android 6.0 — covers ~99% of active devices
        targetSdkVersion 34
        ...
    }
}
```

---

## 9. Build a release AAB

From Android Studio: **Build** → **Generate Signed Bundle / APK** → **Android App Bundle**

Or from the command line:
```bash
cd android
./gradlew bundleRelease
```

The AAB is at `android/app/build/outputs/bundle/release/app-release.aab`.

---

## 10. Billing policy note

Our subscription flow opens Stripe checkout in the system browser via `@capacitor/browser`.
This is compliant with Google Play's billing policy for digital service subscriptions
accessed via an external website — **as long as the app does not present the payment UI
inside the WebView itself** (which we do not).

However, Google reserves the right to require in-app billing for apps that offer
subscriptions through the Play Store. Monitor the [Google Play billing policy](https://support.google.com/googleplay/android-developer/answer/10281818)
and be prepared to add `@capacitor-community/in-app-purchases` (losing 15–30% to Google)
if required.

---

## 11. Google Play Console setup

### Create the app

1. [play.google.com/console](https://play.google.com/console) → **Create app**
2. App name: **Budget Ledger**
3. Default language: English (United States)
4. App or game: **App**
5. Free or paid: **Free** (subscriptions handled separately)
6. Accept policies

### Store listing

| Field | Value |
|---|---|
| Short description (80 chars) | A quiet personal finance app. No ads, no algorithms. |
| Full description | See suggested copy below |
| Category | Finance |
| Tags | budget, personal finance, expense tracker, spending |
| Contact email | kamranbiroun@gmail.com |
| Privacy policy URL | https://budget-ledger.vercel.app/privacy |

**Suggested full description:**
> Budget Ledger is a clean, editorial personal finance app for people who want to think clearly about money.
>
> Track income and expenses by category, set monthly budgets, build savings goals, and import transactions from CSV or bank statements. Everything stays in sync across your devices.
>
> AI-powered features help you categorize transactions and scan receipts automatically — or use it completely without AI.
>
> No ads. No data brokers. No dark patterns. Just your ledger.
>
> Free to use. Pro subscription ($8/mo) unlocks AI features.

### Screenshots

Required: **2 phone screenshots minimum** (16:9 or 9:16, min 320px on shortest side)
Recommended sizes: 1080×1920 (portrait) or 1920×1080 (landscape)

Capture from Android emulator:
1. Run the app on a Pixel 7 emulator (Android 14)
2. **Screenshot** button in the emulator toolbar
3. Screens to capture: Ledger, Dashboard, Goals, Receipt drawer, Command palette

### Content rating

**App content rating questionnaire:**
- Violence: None
- Sexual content: None
- Language: None
- Controlled substance: None
- Financial services: **Yes** — select "Personal finance tracking app"
- You'll receive a **PEGI 3 / E for Everyone** equivalent rating

---

## 12. Closed testing track (mandatory for new developers)

Google Play requires new developer accounts to run a **closed testing track with at least
20 opt-in testers for 14 continuous days** before promoting to production.

### Set up internal testing first

1. **Testing** → **Internal testing** → **Create new release**
2. Upload your AAB
3. Add yourself + a few emails as internal testers
4. Test the full flow: install, sign in, add transaction, upgrade modal, biometrics

### Then closed testing

1. **Testing** → **Closed testing** → **Create track** (name it "Beta")
2. Create a new release, upload AAB
3. **Testers** → **Create email list** → add 20+ email addresses
4. Share the opt-in URL with testers
5. Wait 14 days with testers actively enrolled

Tips for finding 20 testers:
- Friends/family (it's free to use the app)
- Post in r/personalfinance, r/androiddev, r/betatesting
- Join a beta-testing Discord

---

## 13. Production release

After the 14-day closed testing period:

1. **Production** → **Create new release**
2. Upload the same (or newer) AAB
3. Add release notes (what's new)
4. **Review and roll out** → start at 20% rollout

### Rollout strategy

Start at 20% to catch any crashes before full rollout:
- Day 1: 20% — monitor Sentry and Play Console Android Vitals
- Day 3: 50% — if crash-free rate > 99%
- Day 7: 100%

---

## 14. Post-launch checklist

- [ ] Android Vitals in Play Console: crash-free rate target > 99.5%
- [ ] ANR (Application Not Responding) rate: target < 0.47%
- [ ] Sentry: verify Android crashes are captured and tagged with platform
- [ ] Respond to Play Store reviews within 24 hours
- [ ] Monitor FCM delivery in Firebase Console
- [ ] Check that biometric auth works on Android fingerprint + face unlock devices

---

## 15. Running locally (for development)

To point the webview at your local Next.js server instead of Vercel:

1. Edit `capacitor.config.ts` and change `server.url` to `http://YOUR_LOCAL_IP:3000`
   (use your machine's LAN IP — `localhost` won't work from the Android emulator/device;
   for the emulator use `http://10.0.2.2:3000`)
2. Run `npm run dev` in the `backend/` directory
3. Run `npx cap sync && npx cap open android`
4. Build and run on an emulator or physical device

Remember to revert `capacitor.config.ts` before committing.
