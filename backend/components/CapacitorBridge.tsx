"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { registerPushNotifications } from "@/lib/native/push";

/**
 * Mounts once at the root layout on native platforms.
 * Handles: deep-link auth callbacks, StatusBar styling,
 * biometric lock on app resume, push notification setup,
 * and Android back button.
 */
export function CapacitorBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      const platform = Capacitor.getPlatform();

      // ── StatusBar ──────────────────────────────────────────────────────────
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Dark });
      // Android requires an explicit background color; iOS reads it from config
      if (platform === "android") {
        await StatusBar.setBackgroundColor({ color: "#F5F1E8" });
      }

      // ── Deep links (magic-link auth callback) ─────────────────────────────
      const { App } = await import("@capacitor/app");
      const { createClient } = await import("@supabase/supabase-js");

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const appUrlHandle = await App.addListener("appUrlOpen", async (event) => {
        const url = event.url;
        // Handles both:
        //  • budgetledger://auth/callback  (iOS URL scheme + Android intent filter)
        //  • https://budget-ledger.vercel.app/auth/callback  (Android App Links)
        if (!url.includes("auth/callback") && !url.includes("access_token")) return;

        const parsed = new URL(
          url.startsWith("budgetledger://")
            ? url.replace("budgetledger://", "https://placeholder.local/")
            : url
        );
        const code = parsed.searchParams.get("code");
        const accessToken = parsed.hash
          ? new URLSearchParams(parsed.hash.slice(1)).get("access_token")
          : null;

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken) {
          const refreshToken = new URLSearchParams(parsed.hash.slice(1)).get("refresh_token") ?? "";
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
        // Navigate into the app after successful auth
        window.location.href = "/app";
      });

      // ── Biometric lock on resume ───────────────────────────────────────────
      const { checkBiometricAvailability, authenticateWithBiometrics } = await import(
        "@/lib/native/biometric"
      );
      const biometricAvailable = await checkBiometricAvailability();

      let appState: "active" | "background" = "active";
      let backgroundedAt = 0;

      const stateHandle = await App.addListener("appStateChange", async (state) => {
        if (!state.isActive) {
          appState = "background";
          backgroundedAt = Date.now();
          return;
        }
        // Only prompt if app was backgrounded for more than 15 seconds
        if (appState === "background" && biometricAvailable && Date.now() - backgroundedAt > 15_000) {
          const result = await authenticateWithBiometrics("Confirm it's you");
          if (!result.success && result.reason !== "unavailable") {
            window.location.href = "/sign-in";
          }
        }
        appState = "active";
      });

      // ── Android back button ────────────────────────────────────────────────
      // Press once: show "press again to exit" toast. Press twice within 2s: exit.
      let backHandle: { remove: () => void } | undefined;
      if (platform === "android") {
        let lastBackPress = 0;

        backHandle = await App.addListener("backButton", () => {
          const now = Date.now();
          if (now - lastBackPress < 2000) {
            App.exitApp();
            return;
          }
          lastBackPress = now;

          // Minimal DOM toast — avoids an extra plugin dependency
          const toast = document.createElement("div");
          toast.textContent = "Press back again to exit";
          toast.style.cssText = [
            "position:fixed",
            "bottom:calc(80px + env(safe-area-inset-bottom))",
            "left:50%",
            "transform:translateX(-50%)",
            "background:rgba(0,0,0,0.75)",
            "color:#fff",
            "padding:10px 22px",
            "border-radius:4px",
            "font-size:14px",
            "font-family:'JetBrains Mono',monospace",
            "z-index:9999",
            "pointer-events:none",
            "white-space:nowrap",
          ].join(";");
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        });
      }

      // ── Push notifications ─────────────────────────────────────────────────
      await registerPushNotifications();

      cleanup = () => {
        appUrlHandle.remove();
        stateHandle.remove();
        backHandle?.remove();
      };
    })();

    return () => cleanup?.();
  }, []);

  return null;
}
