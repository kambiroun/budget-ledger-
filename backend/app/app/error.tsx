"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

export default function AppError({
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
    <main style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "48px 24px",
      textAlign: "center",
    }}>
      <div style={{
        fontFamily: '"Fraunces", Georgia, serif', fontSize: 42,
        fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 16,
      }}>
        Something went wrong
      </div>
      <p style={{ color: "var(--ink-muted)", fontSize: 15, marginBottom: 32, maxWidth: 420 }}>
        An unexpected error occurred. It&rsquo;s been reported automatically.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={reset}
          style={{
            padding: "11px 22px", background: "var(--ink)", color: "var(--bg)",
            border: "none", cursor: "pointer", fontSize: 13, letterSpacing: "0.08em",
            textTransform: "uppercase", fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          Try again
        </button>
        <Link href="/app" style={{
          padding: "11px 22px", background: "transparent", color: "var(--ink)",
          border: "1px solid var(--rule)", textDecoration: "none",
          fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          Reload app
        </Link>
      </div>
    </main>
  );
}
