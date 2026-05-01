"use client";
import React, { useEffect } from "react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  requiredTier?: "pro" | "plus";
}

export function UpgradeModal({ open, onClose, requiredTier = "pro" }: UpgradeModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  async function upgrade(interval: "month" | "year") {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier: requiredTier, interval }),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.data?.url) {
      window.location.href = json.data.url;
    } else if (res.status === 401) {
      window.location.href = "/sign-in";
    }
  }

  const price = requiredTier === "plus" ? 15 : 8;
  const annualPrice = requiredTier === "plus" ? 144 : 72;
  const tierLabel = requiredTier === "plus" ? "Plus" : "Pro";

  const features = requiredTier === "plus"
    ? ["Everything in Pro", "Bank sync via Plaid", "Up to 4 connected accounts", "Auto-import transactions"]
    : ["AI categorization", "AI receipt extraction", "Natural-language entry", "Dashboard narrative insights"];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 900, backdropFilter: "blur(2px)",
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 901,
        background: "var(--bg-card)", border: "1px solid var(--rule)",
        padding: "36px 32px 28px", maxWidth: 420, width: "calc(100vw - 48px)",
      }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 16,
            background: "none", border: "none", cursor: "pointer",
            fontSize: 18, color: "var(--ink-faint)", lineHeight: 1,
          }}
        >
          ×
        </button>

        <div style={{
          fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
          fontFamily: '"JetBrains Mono", monospace', color: "var(--ink-faint)",
          marginBottom: 10,
        }}>
          Budget Ledger {tierLabel}
        </div>

        <h2 style={{
          fontFamily: '"Fraunces", Georgia, serif',
          fontSize: 28, fontWeight: 400, margin: "0 0 8px",
          letterSpacing: "-0.01em",
        }}>
          Unlock AI features
        </h2>

        <p style={{ color: "var(--ink-muted)", fontSize: 14, margin: "0 0 20px" }}>
          {requiredTier === "plus"
            ? "Connect your bank and let your ledger update itself."
            : "Let the AI handle categorization, insights, and natural-language entry."}
        </p>

        <ul style={{
          listStyle: "none", padding: 0, margin: "0 0 24px",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {features.map((f) => (
            <li key={f} style={{ fontSize: 14, display: "flex", gap: 10 }}>
              <span style={{
                color: "var(--good)", fontFamily: '"JetBrains Mono", monospace',
                fontSize: 12, paddingTop: 2,
              }}>✓</span>
              {f}
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => upgrade("month")}
            style={{
              padding: "12px 20px", background: "var(--ink)", color: "var(--bg)",
              border: "none", cursor: "pointer", fontSize: 13,
              letterSpacing: "0.08em", textTransform: "uppercase",
              fontFamily: '"JetBrains Mono", monospace', width: "100%",
            }}
          >
            ${price}/month
          </button>
          <button
            onClick={() => upgrade("year")}
            style={{
              padding: "12px 20px", background: "transparent", color: "var(--ink)",
              border: "1px solid var(--rule)", cursor: "pointer", fontSize: 13,
              letterSpacing: "0.08em", textTransform: "uppercase",
              fontFamily: '"JetBrains Mono", monospace', width: "100%",
            }}
          >
            ${annualPrice}/year <span style={{ color: "var(--good)", fontSize: 11 }}>save 25%</span>
          </button>
        </div>

        <p style={{
          fontSize: 11, color: "var(--ink-faint)", textAlign: "center",
          marginTop: 16, marginBottom: 0,
        }}>
          Cancel any time · Secure checkout via Stripe
        </p>
      </div>
    </>
  );
}
