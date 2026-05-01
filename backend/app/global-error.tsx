"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: "sans-serif", textAlign: "center", padding: "80px 24px" }}>
        <h2>Something went wrong</h2>
        <p style={{ color: "#666", marginBottom: 24 }}>
          A critical error occurred. It&rsquo;s been reported automatically.
        </p>
        <button onClick={reset} style={{ padding: "10px 20px", cursor: "pointer" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
