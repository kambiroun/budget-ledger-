"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once on client mount.
 * No-op in dev or when service workers aren't supported.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (location.hostname === "localhost") return; // skip in dev
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
