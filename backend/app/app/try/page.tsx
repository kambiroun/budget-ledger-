"use client";

import { useEffect, useState } from "react";

type AnyRow = Record<string, any>;

const DEFAULT_CATS = ["Groceries", "Eating Out", "Transport", "Households", "Income"];

function Section({ title, kids }: { title: string; kids: React.ReactNode }) {
  return (
    <section style={{
      background: "var(--bg-card)", border: "1px solid var(--rule)",
      padding: "22px 24px", marginBottom: 20
    }}>
      <div className="mono" style={{
        fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-muted)",
        marginBottom: 14, textTransform: "uppercase"
      }}>{title}</div>
      {kids}
    </section>
  );
}

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

export default function TryItOut() {
  const [categories, setCategories] = useState<AnyRow[]>([]);
  const [txns, setTxns] = useState<AnyRow[]>([]);
  const [goals, setGoals] = useState<AnyRow[]>([]);
  const [rules, setRules] = useState<AnyRow[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function logIt(msg: string) {
    setLog(l => [new Date().toLocaleTimeString() + " · " + msg, ...l].slice(0, 30));
  }

  async function call(method: string, url: string, body?: any) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method, headers: { "content-type": "application/json" },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.ok) {
        logIt(`✗ ${method} ${url} → ${json.error || res.status}`);
        throw new Error(json.error);
      }
      logIt(`✓ ${method} ${url}`);
      return json.data;
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const [c, t, g, r] = await Promise.all([
      call("GET", "/api/categories"),
      call("GET", "/api/transactions?limit=10"),
      call("GET", "/api/goals"),
      call("GET", "/api/rules"),
    ]);
    setCategories(c); setTxns(t.transactions); setGoals(g); setRules(r);
  }
  useEffect(() => { refresh().catch(() => {}); /* eslint-disable-next-line */ }, []);

  async function seedCategories() {
    if (categories.length > 0) { logIt("categories already exist — skipping"); return; }
    for (const name of DEFAULT_CATS) await call("POST", "/api/categories", { name });
    await refresh();
  }

  async function addRandomTxn() {
    if (categories.length === 0) { logIt("seed categories first"); return; }
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const merchants = ["Costco", "Whole Foods", "Blue Bottle", "Uber", "Netflix", "Rogers", "Shell"];
    await call("POST", "/api/transactions", {
      date: new Date().toISOString().slice(0, 10),
      description: merchants[Math.floor(Math.random() * merchants.length)],
      amount: +(Math.random() * 120 + 5).toFixed(2),
      category_id: cat.id,
      source: "manual",
    });
    await refresh();
  }

  async function addGoal() {
    const n = goals.length + 1;
    await call("POST", "/api/goals", {
      name: `Goal #${n}`,
      target: 1000 * n,
      saved: 0,
    });
    await refresh();
  }

  async function addRule() {
    if (categories.length === 0) { logIt("seed categories first"); return; }
    const cat = categories.find(c => c.name === "Eating Out") || categories[0];
    await call("POST", "/api/rules", {
      pattern: "blue bottle",
      category_id: cat.id,
      priority: 10,
    });
    await refresh();
  }

  async function wipe() {
    if (!confirm("Soft-delete ALL your data? (You can still see deleted rows via the DB.)")) return;
    for (const t of txns) await call("DELETE", `/api/transactions/${t.id}`);
    for (const g of goals) await call("DELETE", `/api/goals/${g.id}`);
    for (const r of rules) await call("DELETE", `/api/rules/${r.id}`);
    for (const c of categories) await call("DELETE", `/api/categories/${c.id}`);
    await refresh();
  }

  return (
    <main style={{ minHeight: "100vh", padding: "48px 32px 96px", maxWidth: 860, margin: "0 auto" }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-faint)", textTransform: "uppercase", marginBottom: 10 }}>
        Milestone 2 · API smoke test
      </div>
      <h1 style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 38, fontWeight: 400, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
        <span style={{ fontStyle: "italic" }}>Try</span> the backend
      </h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 15, margin: "0 0 32px" }}>
        Click buttons → watch the log → confirm row-level security keeps your data yours. Full UI lands in M4.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <button style={btn("primary")} onClick={seedCategories} disabled={busy}>seed categories</button>
        <button style={btn()} onClick={addRandomTxn} disabled={busy}>+ random transaction</button>
        <button style={btn()} onClick={addGoal} disabled={busy}>+ goal</button>
        <button style={btn()} onClick={addRule} disabled={busy}>+ rule</button>
        <button style={btn()} onClick={refresh} disabled={busy}>refresh</button>
        <button style={btn("danger")} onClick={wipe} disabled={busy}>wipe all</button>
        <a href="/app" style={{ ...btn(), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>← back</a>
      </div>

      <Section title={`Categories · ${categories.length}`} kids={
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          {categories.map(c => (
            <li key={c.id} style={{ padding: "6px 10px", border: "1px solid var(--rule)", fontSize: 13 }}>{c.name}</li>
          ))}
          {categories.length === 0 && <li style={{ color: "var(--ink-faint)", fontSize: 13 }}>— none yet —</li>}
        </ul>
      } />

      <Section title={`Transactions · ${txns.length}`} kids={
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--rule)", textAlign: "left" }}>
              <th style={{ padding: 6, fontWeight: 500, fontSize: 10, letterSpacing: "0.12em", color: "var(--ink-muted)" }} className="mono">DATE</th>
              <th style={{ padding: 6, fontWeight: 500, fontSize: 10, letterSpacing: "0.12em", color: "var(--ink-muted)" }} className="mono">DESCRIPTION</th>
              <th style={{ padding: 6, fontWeight: 500, fontSize: 10, letterSpacing: "0.12em", color: "var(--ink-muted)", textAlign: "right" }} className="mono">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {txns.map(t => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                <td style={{ padding: 6 }} className="mono">{t.date}</td>
                <td style={{ padding: 6 }}>{t.description}</td>
                <td style={{ padding: 6, textAlign: "right" }} className="mono">${Number(t.amount).toFixed(2)}</td>
              </tr>
            ))}
            {txns.length === 0 && <tr><td colSpan={3} style={{ padding: 10, color: "var(--ink-faint)", fontSize: 13 }}>— none yet —</td></tr>}
          </tbody>
        </table>
      } />

      <Section title={`Goals · ${goals.length}`} kids={
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {goals.map(g => (
            <li key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
              <span>{g.name}</span>
              <span className="mono">${Number(g.saved).toFixed(0)} / ${Number(g.target).toFixed(0)}</span>
            </li>
          ))}
          {goals.length === 0 && <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>— none yet —</div>}
        </ul>
      } />

      <Section title={`Rules · ${rules.length}`} kids={
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {rules.map(r => {
            const cat = categories.find(c => c.id === r.category_id);
            return (
              <li key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
                <span className="mono">"{r.pattern}"</span>
                <span>→ {cat?.name || "—"}</span>
              </li>
            );
          })}
          {rules.length === 0 && <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>— none yet —</div>}
        </ul>
      } />

      <Section title="Log" kids={
        <div style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5,
          maxHeight: 240, overflowY: "auto", color: "var(--ink-muted)",
          lineHeight: 1.7
        }}>
          {log.length === 0 && <div style={{ color: "var(--ink-faint)" }}>— nothing yet —</div>}
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      } />
    </main>
  );
}
