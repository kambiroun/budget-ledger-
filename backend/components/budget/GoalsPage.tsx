"use client";
import React from "react";
import { useGoals } from "@/lib/hooks/useData";
import { createGoal, updateGoal, deleteGoal } from "@/lib/db/client";
import { fmtMoney } from "@/lib/budget";
import { SectionHead, EmptyState, Btn } from "./Primitives";

export function GoalsPage() {
  const goals = useGoals();
  const list = goals.data ?? [];
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [saved, setSaved] = React.useState("");
  const [deadline, setDeadline] = React.useState("");

  const add = async () => {
    if (!name.trim() || !target || busy) return;
    setBusy(true);
    try {
      await createGoal({
        name: name.trim(),
        target: parseFloat(target) || 0,
        saved: parseFloat(saved) || 0,
        target_date: deadline || null,
      });
      setName(""); setTarget(""); setSaved(""); setDeadline("");
      await goals.refresh();
    } finally { setBusy(false); }
  };

  const addSaved = async (g: any, amount: number) => {
    if (!amount || busy) return;
    setBusy(true);
    try {
      await updateGoal(g.id, { saved: Number(g.saved) + amount });
      await goals.refresh();
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteGoal(id);
      await goals.refresh();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <SectionHead title="Savings goals" meta={`§08 · ${list.length} goals`} />
      <p style={{
        color: "var(--ink-muted)", fontSize: 14,
        marginTop: -10, marginBottom: 20, maxWidth: 620,
      }}>
        Track what you're saving toward outside the monthly budget — a vacation, a down
        payment, an emergency fund.
      </p>

      <div style={{
        padding: 18, background: "var(--bg-card)",
        border: "1px solid var(--rule)", marginBottom: 24,
        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8,
      }}>
        <input className="inp" placeholder="Goal name (e.g. Japan trip)"
          value={name} onChange={(e) => setName(e.target.value)} />
        <input className="inp" type="number" placeholder="Target $"
          value={target} onChange={(e) => setTarget(e.target.value)} />
        <input className="inp" type="number" placeholder="Saved $"
          value={saved} onChange={(e) => setSaved(e.target.value)} />
        <input className="inp" type="date"
          value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <Btn primary onClick={add} disabled={busy}>Add</Btn>
      </div>

      {list.length === 0 ? (
        <EmptyState>
          <p>No goals yet. Add one above — a vacation, a down payment, an emergency fund.</p>
        </EmptyState>
      ) : (
        list.map((g: any) => {
          const tgt = Number(g.target) || 0;
          const sv  = Number(g.saved) || 0;
          const pct = tgt > 0 ? Math.min(100, (sv / tgt) * 100) : 0;
          const remaining = Math.max(tgt - sv, 0);
          return (
            <div key={g.id} className="goal">
              <div className="goal-head">
                <span className="goal-name">{g.name}</span>
                <span className="goal-nums">
                  {fmtMoney(sv)}{" "}
                  <span style={{ color: "var(--ink-faint)" }}>/ {fmtMoney(tgt)}</span>
                </span>
              </div>
              <div className="goal-bar-track">
                <div className="goal-bar-fill" style={{ width: pct + "%" }} />
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between",
                marginTop: 10, fontSize: 12, alignItems: "center",
              }}>
                <span style={{ color: "var(--ink-muted)" }} className="mono">
                  {Math.round(pct)}% · {fmtMoney(remaining)} to go
                  {g.target_date && ` · by ${g.target_date}`}
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  <input className="inp" type="number" style={{ width: 100 }}
                    placeholder="Add $"
                    onKeyDown={(e: any) => {
                      if (e.key === "Enter") {
                        addSaved(g, parseFloat(e.target.value) || 0);
                        e.target.value = "";
                      }
                    }} />
                  <Btn small danger onClick={() => remove(g.id)} disabled={busy}>
                    Delete
                  </Btn>
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
