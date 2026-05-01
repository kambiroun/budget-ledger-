/**
 * Push notification registration for iOS/Android via @capacitor/push-notifications.
 *
 * Call registerPushNotifications() once at app startup (inside CapacitorBridge).
 * On success the device token is sent to /api/profile/push-token so the server
 * can fan out notifications later.
 */
import { Capacitor } from "@capacitor/core";

export async function registerPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  // Check / request permission
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") return;

  // Register with APNs / FCM
  await PushNotifications.register();

  // Send token to our server on registration or rotation
  PushNotifications.addListener("registration", async (token) => {
    try {
      await fetch("/api/profile/push-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.value }),
      });
    } catch {
      // Non-fatal: push token rotation can retry on next launch
    }
  });

  // Foreground notification display (iOS only — Android shows automatically)
  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.info("[push] received in foreground:", notification.title);
  });

  // User tapped a notification
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data as Record<string, string> | undefined;
    if (data?.route) {
      // Navigate to the specified route within the app
      window.location.hash = data.route;
    }
  });
}
