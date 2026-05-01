import posthog from "posthog-js";

let initialised = false;

export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (initialised) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: false,
    persistence: "localStorage",
    disable_session_recording: true,
  });
  initialised = true;
}

export function identifyUser(userId: string, email?: string) {
  if (typeof window === "undefined") return;
  try {
    posthog.identify(userId, email ? { email } : undefined);
  } catch {}
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    posthog.capture(event, properties);
  } catch {}
}

export function resetAnalytics() {
  if (typeof window === "undefined") return;
  try {
    posthog.reset();
  } catch {}
}
