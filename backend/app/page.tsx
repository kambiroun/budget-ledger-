import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "48px 24px",
      textAlign: "center"
    }}>
      <div style={{
        fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-faint)",
        textTransform: "uppercase", marginBottom: 18
      }} className="mono">
        Est. 2026 · Vol. I
      </div>
      <h1 style={{
        fontFamily: '"Fraunces", Georgia, serif',
        fontSize: "clamp(48px, 8vw, 88px)",
        fontWeight: 400, letterSpacing: "-0.02em",
        margin: "0 0 8px", lineHeight: 1
      }}>
        <span style={{ fontStyle: "italic" }}>The</span> Budget Ledger
      </h1>
      <p style={{
        fontFamily: '"Source Serif 4", Georgia, serif',
        fontSize: 17, color: "var(--ink-muted)",
        maxWidth: 520, margin: "14px 0 36px"
      }}>
        A quiet place to watch your money. Multi-device, offline-first,
        no one watching over your shoulder except you.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/sign-up" style={{
          padding: "12px 22px", background: "var(--ink)", color: "var(--bg)",
          textDecoration: "none", fontSize: 13, letterSpacing: "0.08em",
          textTransform: "uppercase", fontFamily: '"JetBrains Mono", monospace'
        }}>
          Create account
        </Link>
        <Link href="/sign-in" style={{
          padding: "12px 22px", background: "transparent", color: "var(--ink)",
          border: "1px solid var(--rule)", textDecoration: "none",
          fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
          fontFamily: '"JetBrains Mono", monospace'
        }}>
          Sign in
        </Link>
      </div>
      <div style={{
        marginTop: 48, fontSize: 12, color: "var(--ink-faint)",
        display: "flex", gap: 16
      }} className="mono">
        <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</Link>
        <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms</Link>
      </div>
    </main>
  );
}
