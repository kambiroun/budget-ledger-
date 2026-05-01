import { Capacitor } from "@capacitor/core";

export type BiometricResult =
  | { success: true }
  | { success: false; reason: "unavailable" | "cancelled" | "error"; message?: string };

export async function checkBiometricAvailability(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const result = await BiometricAuth.checkBiometry();
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(reason: string): Promise<BiometricResult> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, reason: "unavailable" };
  }

  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential: true,
    });
    return { success: true };
  } catch (err: any) {
    const msg = err?.message ?? "";
    if (msg.toLowerCase().includes("cancel") || err?.code === "userCancel") {
      return { success: false, reason: "cancelled" };
    }
    if (msg.toLowerCase().includes("not available") || msg.toLowerCase().includes("unavailable")) {
      return { success: false, reason: "unavailable" };
    }
    return { success: false, reason: "error", message: msg };
  }
}
