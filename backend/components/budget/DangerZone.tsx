"use client";
import React from "react";
import { Btn } from "./Primitives";
import { wipeUserData, type WipeScope } from "@/lib/db/client";
import { useCategories, useBudgets, useTransactions, useGoals, useRules } from "@/lib/hooks/useData";

/**
 * DangerZone — destructive operations surface. Lives at the bottom of Setup.
 *
 * Each action requires the user to type the literal word shown in the button
 * label. We never silently nuke data; the server endpoint also requires
 * `confirm: "WIPE"` as a second guard.
 */

const SCOPES: { id: WipeScope; label: string; blurb: string }[] = [
  { id: "transactions", label: "transactions",
    blurb: "Remove every transaction. Categories, budgets, goals, and rules are kept." },
  { id: "categories_and_budgets", label: "categories",
    blurb: "Remove categories + their budgets. Existing transactions are kept but uncategorized." },
  { id: "goals", label: "goals", blurb: "Remove all savings goals." },
  { id: "rules", label: "rules", blurb: "Remove all auto-categorization rules." },
  { id: "all", label: "everything",
    blurb: "Wipe all transactions, categories, budgets, goals, and rules. Starts fresh." },
];

export function DangerZone() {
  const cats = useCategories();
  const budgets = useBudgets();
  const txns = useTransactions();
  const goals = useGoals();
  const rules = useRules();

  const [active, setActive] = React.useState<WipeScope | null>(null);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const cur = SCOPES.find((s) => s.id === active);

  const refreshAll = () =>
    Promise.all([cats.refresh(), budgets.refresh(), txns.refresh(), goals.refresh(), rules.refresh()]);

  const run = async () => {
    if (!cur) return;
    setBusy(true);
    setResult(null);
    try {
      const { deleted } = await wipeUserData(cur.id);
      const parts = Object.entries(deleted)
        .filter(([, n]) => (n as number) > 0)
        .map(([k, n]) => `${n} ${k}`);
      setResult(parts.length ? `Wiped ${parts.join(", ")}.` : "Nothing to wipe.");
      setActive(null);
      setTyped("");
      await refreshAll();
    } catch (e: any) {
      setResult("Wipe failed: " + (e?.message || "unknown error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginTop: 40 }}>
      <h3 className="section-sub-h" style={{ color: "var(--danger, #b44b44)" }}>
        Danger zone
      </h3>
      <div
        style={{
          border: "1px solid color-mix(in oklab, var(--danger, #b44b44) 35%, transparent)",
          borderRadius: 10,
          background: "color-mix(in oklab, var(--danger, #b44b44) 6%, transparent)",
          padding: 16,
        }}
      >
        <p style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 0, maxWidth: 640 }}>
          These actions delete data permanently — on the server AND in your local cache
          (including any queued writes). Use this to start over after a bad import or demo
          load. You&apos;ll be asked to type the action word to confirm.
        </p>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {SCOPES.map((s) => {
            const isActive = active === s.id;
            return (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: isActive ? "var(--surface, #fff)" : "transparent",
                  border: isActive ? "1px solid var(--danger, #b44b44)" : "1px solid transparent",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Wipe {s.label}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>{s.blurb}</div>
                </div>
                {!isActive ? (
                  <Btn small danger onClick={() => { setActive(s.id); setTyped(""); setResult(null); }}>
                    Wipe…
                  </Btn>
                ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      autoFocus
                      placeholder={`type "${s.label}"`}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setActive(null); setTyped(""); }
                        if (e.key === "Enter" && typed === s.label && !busy) run();
                      }}
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12,
                        padding: "6px 8px",
                        border: "1px solid var(--rule, #ccc)",
                        borderRadius: 6,
                        width: 180,
                      }}
                    />
                    <Btn
                      small danger
                      onClick={run}
                      disabled={busy || typed !== s.label}
                    >
                      {busy ? "Wiping…" : "Confirm"}
                    </Btn>
                    <Btn small ghost onClick={() => { setActive(null); setTyped(""); }} disabled={busy}>
                      Cancel
                    </Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {result && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              color: result.startsWith("Wipe failed") ? "var(--danger, #b44b44)" : "var(--ink-muted)",
            }}
          >
            {result}
          </div>
        )}
      </div>
    </section>
  );
}
