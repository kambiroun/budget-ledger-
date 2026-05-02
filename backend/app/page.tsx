import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Budget Ledger — A quiet personal finance app",
};

const FEATURES = [
  { label: "Unlimited transactions", detail: "No row limits, no storage caps." },
  { label: "Offline-first sync", detail: "Works without a connection. Syncs when you're back." },
  { label: "Import any bank", detail: "CSV, PDF, XLSX — or connect via Plaid (Plus)." },
  { label: "AI categorization", detail: "One-click to sort every transaction (Pro)." },
  { label: "Budgets & goals", detail: "Monthly budgets per category, savings goal tracker." },
  { label: "Rules engine", detail: "Auto-categorize recurring merchants." },
];

export default function HomePage() {
  const phUrl = process.env.NEXT_PUBLIC_PH_URL;

  return (
    <main style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "64px 24px 80px",
    }}>
      {/* Product Hunt badge — only when NEXT_PUBLIC_PH_URL is set */}
      {phUrl && (
        <a
          href={phUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginBottom: 32, display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 14px 6px 10px",
            border: "1px solid var(--rule)", background: "var(--bg-card)",
            textDecoration: "none", fontSize: 12, color: "var(--ink-muted)",
            fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.05em",
          }}
        >
          <span style={{ fontSize: 16 }}>🚀</span>
          Featured on Product Hunt
          <span style={{ color: "var(--ink-faint)" }}>↗</span>
        </a>
      )}

      <div style={{
        fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-faint)",
        textTransform: "uppercase", marginBottom: 18,
      }} className="mono">
        Est. 2026 · Vol. I
      </div>

      <h1 style={{
        fontFamily: '"Fraunces", Georgia, serif',
        fontSize: "clamp(48px, 8vw, 88px)",
        fontWeight: 400, letterSpacing: "-0.02em",
        margin: "0 0 8px", lineHeight: 1, textAlign: "center",
      }}>
        <span style={{ fontStyle: "italic" }}>The</span> Budget Ledger
      </h1>

      <p style={{
        fontFamily: '"Source Serif 4", Georgia, serif',
        fontSize: 17, color: "var(--ink-muted)",
        maxWidth: 520, margin: "14px 0 36px", textAlign: "center", lineHeight: 1.6,
      }}>
        A quiet place to watch your money. Multi-device, offline-first,
        no ads, no algorithms — just your ledger.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 64, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/sign-up" style={{
          padding: "12px 22px", background: "var(--ink)", color: "var(--bg)",
          textDecoration: "none", fontSize: 13, letterSpacing: "0.08em",
          textTransform: "uppercase", fontFamily: '"JetBrains Mono", monospace',
        }}>
          Create free account
        </Link>
        <Link href="/sign-in" style={{
          padding: "12px 22px", background: "transparent", color: "var(--ink)",
          border: "1px solid var(--rule)", textDecoration: "none",
          fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          Sign in
        </Link>
      </div>

      {/* Feature grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "1px", maxWidth: 720, width: "100%",
        border: "1px solid var(--rule)", marginBottom: 64,
        overflow: "hidden",
      }}>
        {FEATURES.map((f, i) => (
          <div key={f.label} style={{
            padding: "18px 20px",
            borderRight: i % 3 !== 2 ? "1px solid var(--rule)" : "none",
            borderBottom: i < 3 ? "1px solid var(--rule)" : "none",
            background: "var(--bg)",
          }}>
            <div style={{ fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>{f.detail}</div>
          </div>
        ))}
      </div>

      {/* Pricing hint */}
      <p style={{
        fontSize: 13, color: "var(--ink-faint)", textAlign: "center", marginBottom: 32,
      }}>
        Free forever · Pro $8/mo · Plus $15/mo ·{" "}
        <Link href="/pricing" style={{ color: "var(--ink-muted)", textDecoration: "underline" }}>
          See all plans
        </Link>
      </p>

      <div style={{
        fontSize: 12, color: "var(--ink-faint)",
        display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center",
      }} className="mono">
        <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</Link>
        <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms</Link>
        <a href="mailto:kamranbiroun@gmail.com" style={{ color: "inherit", textDecoration: "none" }}>Contact</a>
      </div>
    </main>
  );
}
