import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kamran.budgetledger",
  appName: "Budget Ledger",
  // The mobile app loads the Vercel deployment — no static export needed.
  // For local development, override server.url with your local Next.js URL.
  webDir: "out",
  server: {
    url: "https://budget-ledger.vercel.app",
    cleartext: false,
    // Allow the webview to navigate to the auth callback
    allowNavigation: ["*.supabase.co", "*.supabase.io"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#F5F1E8",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#F5F1E8",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Camera: {
      // iOS: no extra config needed; permissions declared in Info.plist
      // Android: permissions declared in AndroidManifest.xml
    },
  },
  ios: {
    // Custom URL scheme for deep links (magic-link auth callbacks)
    scheme: "budgetledger",
    // Respect safe area insets — pairs with viewport-fit=cover in CSS
    contentInset: "always",
    // Scroll bounce disable — budgeting apps feel better without it
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    // Prevent a white flash while the webview loads
    backgroundColor: "#F5F1E8",
    // Disable Chrome remote debugging in release builds;
    // enable in dev by overriding locally (do not commit true)
    webContentsDebuggingEnabled: false,
    // Don't allow http:// resources in the https:// webview
    allowMixedContent: false,
    // Append a custom UA token so server-side code can distinguish the app
    appendUserAgent: "BudgetLedger-Android",
  },
};

export default config;
