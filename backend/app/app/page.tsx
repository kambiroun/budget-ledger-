import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";

export default async function AppHome() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  return (
    <main style={{ minHeight: "100vh", padding: "60px 32px", maxWidth: 720, margin: "0 auto" }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-faint)", textTransform: "uppercase", marginBottom: 12 }}>
        Signed in
      </div>
      <h1 style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 44, fontWeight: 400, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
        Hello, <span style={{ fontStyle: "italic" }}>{profile?.display_name || "reader"}</span>.
      </h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 16, marginBottom: 32 }}>
        Authentication works. The full app (ledger, dashboard, compare, rules, goals) will land in the next milestones.
      </p>

      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--rule)",
        padding: "22px 24px", marginBottom: 28,
      }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-muted)", marginBottom: 10 }}>
          SESSION
        </div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: "var(--ink)" }}>
          <div><span style={{ color: "var(--ink-muted)" }}>user_id </span>{user.id}</div>
          <div><span style={{ color: "var(--ink-muted)" }}>email   </span>{user.email}</div>
          <div><span style={{ color: "var(--ink-muted)" }}>method  </span>{user.app_metadata?.provider || "email"}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <a href="/app/try" style={{
          padding: "10px 18px", background: "var(--ink)", color: "var(--bg)",
          textDecoration: "none",
          fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          Try the backend →
        </a>
        <a href="/app/offline" style={{
          padding: "10px 18px", background: "var(--bg-card)", color: "var(--ink)",
          border: "1px solid var(--rule)", textDecoration: "none",
          fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          Offline test →
        </a>
        <SignOutButton />
      </div>
    </main>
  );
}
