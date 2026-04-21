import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <main style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "48px 24px"
    }}>
      <div style={{
        fontFamily: '"Fraunces", Georgia, serif', fontSize: 42,
        fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 8
      }}>
        <span style={{ fontStyle: "italic" }}>New</span> reader
      </div>
      <p style={{ color: "var(--ink-muted)", marginBottom: 30, fontSize: 15 }}>
        Create an account — it's free.
      </p>
      <Suspense fallback={null}>
        <AuthForm kind="sign-up" />
      </Suspense>
    </main>
  );
}
