import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function SignInPage() {
  return (
    <main style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "48px 24px"
    }}>
      <div style={{
        fontFamily: '"Fraunces", Georgia, serif', fontSize: 42,
        fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 8
      }}>
        <span style={{ fontStyle: "italic" }}>Sign</span> in
      </div>
      <p style={{ color: "var(--ink-muted)", marginBottom: 30, fontSize: 15 }}>
        Welcome back.
      </p>
      <AuthForm kind="sign-in" />
      <div style={{
        marginTop: 32, fontSize: 12, color: "var(--ink-faint)",
        display: "flex", gap: 16
      }} className="mono">
        <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</Link>
        <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms</Link>
      </div>
    </main>
  );
}
