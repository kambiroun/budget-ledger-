"use client";
import React from "react";
import { track } from "@/lib/analytics";

interface ReferralData {
  code: string;
  link: string;
  referred_count: number;
}

export function ReferralPanel() {
  const [data, setData] = React.useState<ReferralData | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/referral")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j.data); })
      .catch(() => {});
  }, []);

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      track("referral_link_copied", { code: data.code });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input
    }
  }

  if (!data) return null;

  return (
    <div style={{
      padding: 18, border: "1px solid var(--rule-soft)",
      background: "var(--panel-soft, rgba(0,0,0,0.02))",
      marginBottom: 16,
    }}>
      <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ink-muted)" }}>
        Share Budget Ledger with a friend. When they sign up via your link, you
        both show up in your referral count — and it helps this project grow.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          readOnly
          value={data.link}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          style={{
            flex: 1, fontFamily: '"JetBrains Mono", monospace',
            fontSize: 12, padding: "8px 10px",
            background: "var(--bg)", border: "1px solid var(--rule)",
            color: "var(--ink)",
          }}
        />
        <button
          onClick={copy}
          style={{
            padding: "8px 16px",
            background: copied ? "var(--good, #5a8a5a)" : "var(--ink)",
            color: "var(--bg)", border: "none", cursor: "pointer",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
            transition: "background 0.15s",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {data.referred_count > 0 && (
        <p style={{
          margin: 0, fontSize: 12, color: "var(--ink-muted)",
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          {data.referred_count} friend{data.referred_count !== 1 ? "s" : ""} signed up via your link
        </p>
      )}
    </div>
  );
}
