"use client";
import { useEffect, useState } from "react";

/**
 * Read a PostHog feature flag value.
 *
 * Returns `null` while flags are loading (PostHog SDK not yet initialised or
 * flags not yet fetched). Returns `undefined` if the flag does not exist.
 * Returns a string variant or boolean when resolved.
 *
 * Usage:
 *   const variant = useFeatureFlag("onboarding_variant");
 *   if (variant === "B") { ... }
 */
export function useFeatureFlag(
  key: string,
): string | boolean | undefined | null {
  const [value, setValue] = useState<string | boolean | undefined | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function read() {
      try {
        const posthog = (await import("posthog-js")).default;
        const current = posthog.getFeatureFlag(key);
        if (!cancelled) setValue(current ?? undefined);

        posthog.onFeatureFlags(() => {
          if (!cancelled) setValue(posthog.getFeatureFlag(key) ?? undefined);
        });
      } catch {
        if (!cancelled) setValue(undefined);
      }
    }

    read();
    return () => { cancelled = true; };
  }, [key]);

  return value;
}
