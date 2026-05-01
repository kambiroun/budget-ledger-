"use client";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initAnalytics } from "@/lib/analytics";
import posthog from "posthog-js";

function Pageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    posthog.capture("$pageview");
  }, [pathname, searchParams]);

  return null;
}

export function Analytics() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <Suspense fallback={null}>
      <Pageview />
    </Suspense>
  );
}
