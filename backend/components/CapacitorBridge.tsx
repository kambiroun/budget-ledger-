"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { registerPushNotifications } from "@/lib/native/push";

/**
 * Mounts once at the root layout on native platforms.
 * Handles: deep-link auth callbacks, StatusBar styling,
 * biometric lock on app resume, and push notification setup.
 */
export function CapacitorBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      // ── StatusBar ──────────────────────────────────────────────────────────
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Dark });

      // ── Deep links (magic-link auth callback) ─────────────────────────────
      const { App } = await import("@capacitor/app");
      const { createClient } = await import("@supabase/supabase-js");

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const appUrlHandle = await App.addListener("appUrlOpen", async (event) => {
        const url = event.url;
        // budgetledger://auth/callback?code=...&next=...
        if (!url.includes("auth/callback") && !url.includes("access_token")) return;

        const parsed = new URL(url.replace("budgetledger://", "https://placeholder.local/"));
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
            // On cancellation or failure, keep the app locked (show sign-in)
            window.location.href = "/sign-in";
          }
        }
        appState = "active";
      });

      // ── Push notifications ─────────────────────────────────────────────────
      await registerPushNotifications();

      cleanup = () => {
        appUrlHandle.remove();
        stateHandle.remove();
      };
    })();

    return () => cleanup?.();
  }, []);

  return null;
}
