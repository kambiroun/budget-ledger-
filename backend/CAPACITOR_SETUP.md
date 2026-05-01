# Capacitor iOS Setup Guide

Everything here must be done on a Mac with Xcode installed.

---

## Prerequisites

- macOS with Xcode 15+
- Node.js 18+
- CocoaPods (`sudo gem install cocoapods`)
- An Apple Developer account (paid, $99/year, needed for App Store)

---

## 1. Install dependencies and add iOS platform

```bash
cd backend
npm install
npx cap add ios
npx cap sync
```

This creates an `ios/` directory containing the Xcode project.

---

## 2. Open in Xcode

```bash
npx cap open ios
```

---

## 3. Configure signing

1. In Xcode, select the **App** target → **Signing & Capabilities**
2. Set **Team** to your Apple Developer account
3. The **Bundle Identifier** is `com.kamran.budgetledger` (set in `capacitor.config.ts`)
4. Let Xcode manage provisioning profiles automatically

---

## 4. Add app icons

Generate a 1024×1024 PNG icon and use [makeappicon.com](https://makeappicon.com) or Xcode's
Asset Catalog to produce all required sizes.

Place the generated `AppIcon.appiconset` folder in:
```
ios/App/App/Assets.xcassets/AppIcon.appiconset/
```

---

## 5. Add splash screen image

Place a `splash.png` (2732×2732 px, background `#F5F1E8`) in:
```
ios/App/App/Assets.xcassets/Splash.imageset/
```

---

## 6. Info.plist privacy strings (required by App Store)

Open `ios/App/App/Info.plist` and add:

```xml
<key>NSCameraUsageDescription</key>
<string>Budget Ledger uses your camera to scan receipts.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Budget Ledger reads photos to scan receipts you select.</string>

<key>NSFaceIDUsageDescription</key>
<string>Budget Ledger uses Face ID to unlock your account quickly.</string>
```

---

## 7. Deep link URL scheme

In Xcode: **App** target → **Info** tab → **URL Types** → add:

| Field        | Value           |
|-------------|-----------------|
| Identifier  | budgetledger    |
| URL Schemes | budgetledger    |

This enables magic-link auth callbacks via `budgetledger://auth/callback`.

Also add the scheme to the **Associated Domains** entitlement if you want
universal links later (optional for initial release).

---

## 8. Push Notifications entitlement

In Xcode: **App** target → **Signing & Capabilities** → **+ Capability** → add
**Push Notifications**.

In App Store Connect, create an APNs key (Auth Key, not certificate):
1. Certificates, Identifiers & Profiles → Keys → Create new key
2. Enable **Apple Push Notifications service (APNs)**
3. Download the `.p8` file and note the Key ID and Team ID
4. Store these in your server environment for sending push later

---

## 9. Supabase: configure auth redirect URL

In Supabase Dashboard → **Authentication** → **URL Configuration**:

- Add to **Redirect URLs**: `budgetledger://auth/callback`

---

## 10. Build and archive for App Store

1. Select **Any iOS Device (arm64)** as the build target
2. **Product** → **Archive**
3. In the Organizer, click **Distribute App** → **App Store Connect**
4. Follow the prompts to upload the build

---

## 11. App Store Connect submission checklist

- [ ] App name: **Budget Ledger**
- [ ] Subtitle: *A quiet place to watch your money*
- [ ] Category: Finance
- [ ] Age Rating: 4+
- [ ] Privacy Policy URL: `https://budget-ledger.vercel.app/privacy`
- [ ] Support URL: `mailto:kamranbiroun@gmail.com`
- [ ] Description (see below)
- [ ] Screenshots: 6.7" and 6.1" required; iPad optional
- [ ] Keywords: budget, ledger, personal finance, expense tracker, spending

**Suggested description:**
> Budget Ledger is a quiet, editorial personal finance app. Track income and expenses,
> set category budgets, build savings goals, and stay offline-first — your data syncs
> automatically when you reconnect. No ads. No algorithms. Just your money, clearly laid out.

---

## 12. Running locally (for development)

To point the webview at your local Next.js server instead of Vercel:

1. Edit `capacitor.config.ts` and change `server.url` to `http://YOUR_LOCAL_IP:3000`
2. Run `npm run dev` in the `backend/` directory
3. Run `npx cap sync && npx cap open ios`
4. Build and run on a simulator or device

Remember to revert `capacitor.config.ts` before committing.
