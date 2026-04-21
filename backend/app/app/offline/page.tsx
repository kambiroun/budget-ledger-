"use client";

import { useState } from "react";
import {
  useCategories, useTransactions, useGoals, useRules, useNetStatus, useDrainQueue,
} from "@/lib/hooks/useData";
import {
  createCategory, createTransaction, createGoal, createRule,
  deleteCategory, deleteTransaction, deleteGoal, deleteRule,
} from "@/lib/db/client";
import { db } from "@/lib/db/dexie";

function btn(variant: "primary" | "ghost" | "danger" = "ghost"): React.CSSProperties {
  const map = {
    primary: { bg: "var(--ink)", fg: "var(--bg)", border: "var(--ink)" },
    ghost:   { bg: "transparent", fg: "var(--ink)", border: "var(--rule)" },
    danger:  { bg: "transparent", fg: "var(--bad)", border: "var(--bad)" },
  };
  const c = map[variant];
  return {
    padding: "7px 14px", background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
    cursor: "pointer", fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5,
    letterSpacing: "0.1em", textTransform: "uppercase",
  };
}

function Section({ title, subtitle, kids }: { title: string; subtitle?: string; kids: React.ReactNode }) {
  return (
    <section style={{
      background: "var(--bg-card)", border: "1px solid var(--rule)",
      padding: "22px 24px", marginBottom: 20
    }}>
      <div className="mono" style={{
        fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-muted)",
        marginBottom: 4, textTransform: "uppercase"
      }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 14 }}>{subtitle}</div>}
      {kids}
    </section>
  );
}

export default function OfflinePage() {
  const net = useNetStatus();
  const drain = useDrainQueue();
  const cats = useCategories();
  const txns = useTransactions({ limit: 15 });
  const goals = useGoals();
  const rules = useRules();
  const [log, setLog] = useState<string[]>([]);
  const [pendingOps, setPendingOps] = useState<any[]>([]);

  function logIt(s: string) {
    setLog(l => [new Date().toLocaleTimeString() + " · " + s, ...l].slice(0, 20));
  }

  async function refreshAll() {
    await Promise.all([cats.refresh(), txns.refresh(), goals.refresh(), rules.refresh()]);
    logIt("refreshed all");
  }

  async function seedCats() {
    for (const n of ["Groceries", "Eating Out", "Transport", "Households", "Income"]) {
      await createCategory({ name: n });
    }
    logIt("seeded 5 categories");
    await refreshAll();
  }

  async function randomTxn() {
    const c = cats.data ?? [];
    if (c.length === 0) { logIt("seed categories first"); return; }
    const merchants = ["Costco", "Whole Foods", "Blue Bottle", "Uber", "Netflix"];
    const cat = c[Math.floor(Math.random() * c.length)];
    await createTransaction({
      date: new Date().toISOString().slice(0, 10),
      description: merchants[Math.floor(Math.random() * merchants.length)],
      amount: +(Math.random() * 120 + 5).toFixed(2),
      category_id: cat.id,
    });
    logIt(`+ txn ${net.online ? "(online)" : "(queued)"}`);
    await txns.refresh();
  }

  async function showQueue() {
    const ops = await db.pending.orderBy("created_at").toArray();
    setPendingOps(ops);
    logIt(`queue has ${ops.length} op${ops.length === 1 ? "" : "s"}`);
  }

  async function clearLocal() {
    if (!confirm("Wipe ALL local cache + pending queue? (Server data untouched.)")) return;
    await Promise.all([
      db.categories.clear(), db.transactions.clear(), db.goals.clear(),
      db.rules.clear(), db.budgets.clear(), db.pending.clear(),
    ]);
    logIt("local cache wiped");
    await refreshAll();
    setPendingOps([]);
  }

  return (
    <main style={{ minHeight: "100vh", padding: "48px 32px 96px", maxWidth: 860, margin: "0 auto" }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-faint)", textTransform: "uppercase", marginBottom: 10 }}>
        Milestone 3 · offline engine
      </div>
      <h1 style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 38, fontWeight: 400, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
        <span style={{ fontStyle: "italic" }}>Offline</span> smoke test
      </h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 15, margin: "0 0 18px" }}>
        1. Click buttons to create data · 2. DevTools → Network → set <b>Offline</b> · 3. Click more buttons. The UI should stay responsive; badge goes amber; writes queue. 4. Re-enable network — queue drains automatically.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <button style={btn("primary")} onClick={seedCats}>seed categories</button>
        <button style={btn()} onClick={randomTxn}>+ random txn</button>
        <button style={btn()} onClick={() => createGoal({ name: `Goal ${(goals.data?.length ?? 0) + 1}`, target: 1000 }).then(() => { logIt("+ goal"); goals.refresh(); })}>+ goal</button>
        <button style={btn()} onClick={() => {
          const ec = cats.data?.find(c => c.name === "Eating Out") || cats.data?.[0];
          if (!ec) return logIt("seed categories first");
          createRule({ pattern: "blue bottle", category_id: ec.id, priority: 10 }).then(() => { logIt("+ rule"); rules.refresh(); });
        }}>+ rule</button>
        <button style={btn()} onClick={refreshAll}>refresh</button>
        <button style={btn()} onClick={showQueue}>show queue</button>
        <button style={btn()} onClick={drain}>drain queue</button>
        <button style={btn("danger")} onClick={clearLocal}>wipe local cache</button>
        <a href="/app" style={{ ...btn(), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>← back</a>
      </div>

      <Section title="Status" kids={
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 13 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-muted)", letterSpacing: "0.12em" }}>NETWORK</div>
            <div style={{ fontSize: 20, marginTop: 4, color: net.online ? "var(--good)" : "var(--bad)" }}>
              {net.online ? "online" : "offline"}
            </div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-muted)", letterSpacing: "0.12em" }}>SYNCING</div>
            <div style={{ fontSize: 20, marginTop: 4 }}>{net.syncing ? "yes" : "idle"}</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-muted)", letterSpacing: "0.12em" }}>PENDING</div>
            <div style={{ fontSize: 20, marginTop: 4, color: net.pending > 0 ? "var(--bad)" : "var(--ink)" }}>{net.pending}</div>
          </div>
        </div>
      } />

      <Section title={`Categories · ${cats.data?.length ?? 0}`} subtitle={cats.stale ? "showing cached (network down)" : undefined} kids={
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          {(cats.data ?? []).map((c: any) => (
            <li key={c.id} style={{
              padding: "6px 10px", border: "1px solid var(--rule)", fontSize: 13,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              opacity: c._dirty ? 0.6 : 1
            }}>
              <span>{c.name}{c._dirty ? " ·" : ""}</span>
              <button onClick={() => deleteCategory(c.id).then(() => cats.refresh())} style={{
                border: "none", background: "none", cursor: "pointer", color: "var(--ink-faint)", fontSize: 12
              }}>×</button>
            </li>
          ))}
          {(cats.data ?? []).length === 0 && <li style={{ color: "var(--ink-faint)", fontSize: 13 }}>— none —</li>}
        </ul>
      } />

      <Section title={`Transactions · ${txns.data?.transactions?.length ?? 0}`} kids={
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {(txns.data?.transactions ?? []).map((t: any) => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--rule)", opacity: t._dirty ? 0.6 : 1 }}>
                <td style={{ padding: 6, fontFamily: "monospace" }}>{t.date}</td>
                <td style={{ padding: 6 }}>{t.description}{t._dirty ? " ·" : ""}</td>
                <td style={{ padding: 6, textAlign: "right", fontFamily: "monospace" }}>${Number(t.amount).toFixed(2)}</td>
                <td style={{ padding: 6, textAlign: "right" }}>
                  <button onClick={() => deleteTransaction(t.id).then(() => txns.refresh())} style={{
                    border: "none", background: "none", cursor: "pointer", color: "var(--ink-faint)", fontSize: 12
                  }}>×</button>
                </td>
              </tr>
            ))}
            {(txns.data?.transactions ?? []).length === 0 && <tr><td colSpan={4} style={{ padding: 10, color: "var(--ink-faint)" }}>— none —</td></tr>}
          </tbody>
        </table>
      } />

      {pendingOps.length > 0 && (
        <Section title={`Pending queue · ${pendingOps.length}`} kids={
          <ul style={{ fontFamily: "monospace", fontSize: 12, margin: 0, padding: 0, listStyle: "none" }}>
            {pendingOps.map(op => (
              <li key={op.id} style={{ padding: "4px 0", borderBottom: "1px solid var(--rule)" }}>
                <span style={{ color: "var(--ink-muted)" }}>{op.op.toUpperCase().padEnd(7)}</span>
                <span style={{ marginLeft: 8 }}>{op.table}/{op.row_id.slice(0, 8)}</span>
                <span style={{ marginLeft: 12, color: "var(--ink-faint)" }}>attempts: {op.attempts}</span>
                {op.last_error && <span style={{ marginLeft: 12, color: "var(--bad)" }}>{op.last_error}</span>}
              </li>
            ))}
          </ul>
        } />
      )}

      <Section title="Log" kids={
        <div style={{ fontFamily: "monospace", fontSize: 11.5, maxHeight: 200, overflowY: "auto", color: "var(--ink-muted)", lineHeight: 1.7 }}>
          {log.length === 0 ? <div style={{ color: "var(--ink-faint)" }}>— nothing yet —</div> : log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      } />
    </main>
  );
}
