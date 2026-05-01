/**
 * Camera abstraction — uses @capacitor/camera on native iOS/Android,
 * falls back to a hidden HTML <input capture="environment"> on web.
 *
 * Returns a base64-encoded image string and its MIME type, or null if
 * the user cancelled.
 */
import { Capacitor } from "@capacitor/core";

export interface CapturedPhoto {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export async function capturePhoto(): Promise<CapturedPhoto | null> {
  if (!Capacitor.isNativePlatform()) {
    // Web path — caller is responsible for triggering the file input
    return null;
  }

  const { Camera, CameraResultType, CameraSource } = await import(
    "@capacitor/camera"
  );

  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
    });

    if (!photo.base64String) return null;

    const format = photo.format as string;
    const mimeType: CapturedPhoto["mimeType"] =
      format === "png"
        ? "image/png"
        : format === "webp"
        ? "image/webp"
        : format === "gif"
        ? "image/gif"
        : "image/jpeg";

    return { base64: photo.base64String, mimeType };
  } catch (err: any) {
    // User cancelled — Camera.getPhoto rejects with "User cancelled photos app"
    if (err?.message?.toLowerCase().includes("cancel")) return null;
    throw err;
  }
}

export async function pickPhotoFromLibrary(): Promise<CapturedPhoto | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const { Camera, CameraResultType, CameraSource } = await import(
    "@capacitor/camera"
  );

  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos,
    });

    if (!photo.base64String) return null;

    const format = photo.format as string;
    const mimeType: CapturedPhoto["mimeType"] =
      format === "png" ? "image/png" : "image/jpeg";

    return { base64: photo.base64String, mimeType };
  } catch (err: any) {
    if (err?.message?.toLowerCase().includes("cancel")) return null;
    throw err;
  }
}
