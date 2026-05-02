"use client";
/**
 * Dismissable Product Hunt launch banner.
 * Only renders when NEXT_PUBLIC_PH_URL is set.
 * Dismissed state persists in localStorage for 7 days.
 */
import { useEffect, useState } from "react";

const DISMISS_KEY = "ph_banner_dismissed_until";

export function LaunchBanner() {
  const [visible, setVisible] = useState(false);
  const phUrl = process.env.NEXT_PUBLIC_PH_URL;

  useEffect(() => {
    if (!phUrl) return;
    const until = localStorage.getItem(DISMISS_KEY);
    if (until && Date.now() < Number(until)) return;
    setVisible(true);
  }, [phUrl]);

  if (!visible || !phUrl) return null;

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 3600 * 1000));
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "var(--ink)", color: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 16, padding: "10px 16px", fontSize: 13,
      fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.04em",
    }}>
      <span>We&apos;re live on Product Hunt today!</span>
      <a
        href={phUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "var(--bg)", textDecoration: "underline",
          fontWeight: "bold",
        }}
      >
        Support us ↗
      </a>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute", right: 12,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--bg)", fontSize: 18, lineHeight: 1, padding: "0 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}
