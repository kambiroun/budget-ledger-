"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";

type Mode = "magic" | "password" | "google";

export function AuthForm({ kind }: { kind: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [next, setNext] = useState("/app");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const n = params.get("next");
      if (n) setNext(n);
      // Persist referral code so ReferralCapture can claim it after login
      const ref = params.get("ref");
      if (ref) sessionStorage.setItem("referral_code", ref);
    }
  }, []);
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleMagic(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: kind === "sign-up",
      },
    });
    setLoading(false);
    if (error) setErr(error.message);
    else {
      track(kind === "sign-up" ? "signed_up" : "signed_in", { method: "magic" });
      setMsg("Check your email for a one-time link.");
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setLoading(true);
    if (kind === "sign-up") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      setLoading(false);
      if (error) setErr(error.message);
      else {
        track("signed_up", { method: "password" });
        setMsg("Check your email to confirm your account.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) setErr(error.message);
      else {
        track("signed_in", { method: "password" });
        router.push(next);
      }
    }
  }

  async function handleGoogle() {
    setErr(null); setLoading(true);
    track(kind === "sign-up" ? "signed_up" : "signed_in", { method: "google" });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) { setErr(error.message); setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: "var(--bg-card)", border: "1px solid var(--rule)",
    fontFamily: '"Source Serif 4", Georgia, serif', fontSize: 15,
    color: "var(--ink)", marginBottom: 10,
  };
  const btnPrimary: React.CSSProperties = {
    width: "100%", padding: "12px", background: "var(--ink)",
    color: "var(--bg)", border: "none", cursor: "pointer",
    fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
    letterSpacing: "0.12em", textTransform: "uppercase",
  };
  const btnGhost: React.CSSProperties = {
    padding: "8px 12px", background: "transparent",
    border: "none", cursor: "pointer", color: "var(--ink-muted)",
    fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
    letterSpacing: "0.12em", textTransform: "uppercase",
  };

  return (
    <div style={{ width: "100%", maxWidth: 380 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 22, borderBottom: "1px solid var(--rule)" }}>
        {(["password", "google", "magic"] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            ...btnGhost,
            color: mode === m ? "var(--ink)" : "var(--ink-faint)",
            borderBottom: mode === m ? "2px solid var(--ink)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {m === "password" ? "Password" : m === "google" ? "Google" : "Magic link"}
          </button>
        ))}
      </div>

      {mode === "magic" && (
        <form onSubmit={handleMagic}>
          <label style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-muted)" }} className="mono">EMAIL</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} placeholder="you@example.com" />
          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? "Sending…" : "Send me a link"}
          </button>
        </form>
      )}

      {mode === "password" && (
        <form onSubmit={handlePassword}>
          <label style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-muted)" }} className="mono">EMAIL</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
          <label style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-muted)" }} className="mono">PASSWORD</label>
          <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? "…" : kind === "sign-up" ? "Create account" : "Sign in"}
          </button>
        </form>
      )}

      {mode === "google" && (
        <button onClick={handleGoogle} style={{ ...btnPrimary, background: "var(--bg-card)", color: "var(--ink)", border: "1px solid var(--rule)" }} disabled={loading}>
          {loading ? "…" : "Continue with Google"}
        </button>
      )}

      {msg && <p style={{ marginTop: 14, fontSize: 13, color: "var(--good)" }}>{msg}</p>}
      {err && <p style={{ marginTop: 14, fontSize: 13, color: "var(--bad)" }}>{err}</p>}

      <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "var(--ink-muted)" }}>
        {kind === "sign-in" ? (
          <>New here? <Link href="/sign-up" style={{ color: "var(--ink)" }}>Create an account</Link></>
        ) : (
          <>Already have one? <Link href="/sign-in" style={{ color: "var(--ink)" }}>Sign in</Link></>
        )}
      </div>
    </div>
  );
}
