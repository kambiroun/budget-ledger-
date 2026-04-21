"use client";
import React, { useMemo, useState } from "react";
import { Masthead, Tabs, SectionHead, EmptyState, TabDef } from "@/components/budget/Primitives";
import { useCategories, useTransactions, useBudgets, useGoals, useRules } from "@/lib/hooks/useData";
import { monthKey, monthLabel, fmtMoney } from "@/lib/budget";

type TabKey = "dashboard" | "ledger" | "weekly" | "compare" | "rules" | "goals" | "setup";

const TABS: TabDef[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "ledger",    label: "Ledger" },
  { key: "weekly",    label: "Weekly" },
  { key: "compare",   label: "Compare" },
  { key: "rules",     label: "Rules" },
  { key: "goals",     label: "Goals" },
  { key: "setup",     label: "Setup" },
];

export function BudgetShell({ userEmail }: { userEmail: string }) {
  const [active, setActive] = useState<TabKey>("dashboard");

  // Pull the core datasets so the tab counts are real from the first paint.
  const cats    = useCategories();
  const txns    = useTransactions({ limit: 500 });
  const budgets = useBudgets();
  const goals   = useGoals();
  const rules   = useRules();

  const loading = cats.loading || txns.loading;
  const txList  = txns.data?.transactions ?? [];

  // Tab counts — live whenever data refreshes
  const tabs = useMemo<TabDef[]>(() => {
    const uncat = txList.filter((t: any) => !t.category_id && !t.is_income).length;
    return TABS.map(t => {
      if (t.key === "ledger") return { ...t, count: txList.length };
      if (t.key === "rules")  return { ...t, count: rules.data?.length ?? 0 };
      if (t.key === "goals")  return { ...t, count: goals.data?.length ?? 0 };
      if (t.key === "dashboard" && uncat > 0) return { ...t, count: uncat };
      return t;
    });
  }, [txList, rules.data, goals.data]);

  return (
    <div className="app">
      <Masthead txCount={txList.length} />
      <Tabs tabs={tabs} active={active} onChange={(k) => setActive(k as TabKey)} />

      {loading && (
        <div className="flash info" style={{ marginBottom: 20 }}>
          Loading…
        </div>
      )}

      {active === "dashboard" && <DashboardStub txns={txList} cats={cats.data ?? []} budgets={budgets.data ?? []} />}
      {active === "ledger"    && <LedgerStub    txns={txList} cats={cats.data ?? []} />}
      {active === "weekly"    && <PlaceholderPanel title="Weekly digest" note="Coming in M4c — week-over-week delta, biggest charges, per-category movement." />}
      {active === "compare"   && <PlaceholderPanel title="Compare periods" note="Coming in M4d — forecast, timeline, month-vs-month, stress-test." />}
      {active === "rules"     && <RulesStub      rules={rules.data ?? []} />}
      {active === "goals"     && <GoalsStub      goals={goals.data ?? []} />}
      {active === "setup"     && <SetupStub      userEmail={userEmail} />}
    </div>
  );
}

/* ============================================================
   Tab stubs — each just *reads* live data for now.
   Full interactivity lands in M4b → M4e.
   ============================================================ */

function DashboardStub({
  txns, cats, budgets,
}: { txns: any[]; cats: any[]; budgets: any[] }) {
  const now = new Date();
  const curMK = monthKey(now);
  const monthTxns = txns.filter(t => t.date?.startsWith(curMK));
  const charges = monthTxns.filter(t => !t.is_income);
  const income  = monthTxns.filter(t =>  t.is_income);
  const totalSpent = charges.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalIncome = income.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalBudget = budgets.reduce((s, b: any) => s + Number(b.amount || 0), 0);
  const net = totalIncome - totalSpent;

  return (
    <>
      <SectionHead title={monthLabel(curMK)} meta={`${cats.length} categories · ${monthTxns.length} entries`} />
      <div className="summary-grid">
        <div className="summary-cell">
          <div className="summary-label">Income</div>
          <div className="summary-value good">{fmtMoney(totalIncome)}</div>
          <div className="summary-sub">{income.length} deposits</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Budget</div>
          <div className="summary-value">{fmtMoney(totalBudget)}</div>
          <div className="summary-sub">across {budgets.length} envelopes</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Spent</div>
          <div className={"summary-value" + (totalSpent > totalBudget ? " bad" : "")}>{fmtMoney(totalSpent)}</div>
          <div className="summary-sub">{charges.length} charges</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Net</div>
          <div className={"summary-value " + (net >= 0 ? "good" : "bad")}>
            {net >= 0 ? "+" : "−"}{fmtMoney(Math.abs(net))}
          </div>
          <div className="summary-sub">this month</div>
        </div>
      </div>

      {monthTxns.length === 0 && (
        <EmptyState>
          Nothing yet this month. Head to <b>Setup</b> and either load the demo data or
          import a CSV, and the dashboard will fill in automatically.
        </EmptyState>
      )}

      <div className="insight-narrative">
        <div className="insight-narrative-head">
          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-muted)" }}>
            COMING SOON
          </div>
        </div>
        <p className="insight-narrative-text">
          Forecast, envelope rollovers, rhythm heatmap, anomaly flags, and AI narrative insight
          will land as we port the full Dashboard in the next milestone.
        </p>
      </div>
    </>
  );
}

function LedgerStub({ txns, cats }: { txns: any[]; cats: any[] }) {
  const catById: Record<string, any> = {};
  cats.forEach(c => (catById[c.id] = c));

  return (
    <>
      <SectionHead title="Ledger" meta={`${txns.length} transactions`} />
      {txns.length === 0 ? (
        <EmptyState>
          No transactions yet. Open <b>Setup</b> to import a CSV or load demo data.
        </EmptyState>
      ) : (
        <div className="ledger">
          {txns.slice(0, 100).map((t: any) => {
            const c = t.category_id ? catById[t.category_id] : null;
            return (
              <div key={t.id} className="ledger-row">
                <div className="ledger-date">{t.date}</div>
                <div className="ledger-desc">{t.description}</div>
                <div>
                  {c ? (
                    <span className="pill" style={{ color: c.color || "var(--ink-muted)" }}>
                      <span className="dot" />
                      {c.name}
                    </span>
                  ) : (
                    <span className="mono" style={{ fontSize: 10, color: "var(--warn)" }}>
                      UNCAT
                    </span>
                  )}
                </div>
                <div className={"ledger-amt" + (t.is_income ? " income" : "")}>
                  {t.is_income ? "+" : ""}{fmtMoney(Number(t.amount))}
                </div>
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-faint)" }}>
                  {t.source?.toUpperCase()}
                </div>
              </div>
            );
          })}
          {txns.length > 100 && (
            <div style={{ padding: "16px 4px", fontSize: 12, color: "var(--ink-muted)", fontStyle: "italic" }}>
              {txns.length - 100} more — full ledger with keyboard nav + bulk ops lands in M4b.
            </div>
          )}
        </div>
      )}
    </>
  );
}

function RulesStub({ rules }: { rules: any[] }) {
  return (
    <>
      <SectionHead title="Auto-categorize rules" meta={`${rules.length} rules`} />
      {rules.length === 0 ? (
        <EmptyState>
          No rules yet. Full editor (pattern tester, priority, batch-apply) lands in M4e.
        </EmptyState>
      ) : (
        <table className="report">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>→ Category</th>
              <th className="num">Priority</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r: any) => (
              <tr key={r.id}>
                <td className="cat">{r.pattern}</td>
                <td>{r.category_id}</td>
                <td className="num">{r.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function GoalsStub({ goals }: { goals: any[] }) {
  return (
    <>
      <SectionHead title="Savings goals" meta={`${goals.length} goals`} />
      {goals.length === 0 ? (
        <EmptyState>No goals yet. Full editor with progress bars and forecast lands in M4e.</EmptyState>
      ) : (
        goals.map((g: any) => {
          const pct = Math.min(100, (Number(g.saved) / Math.max(1, Number(g.target))) * 100);
          return (
            <div key={g.id} className="goal">
              <div className="goal-head">
                <div className="goal-name">{g.name}</div>
                <div className="goal-nums">
                  {fmtMoney(Number(g.saved))} / {fmtMoney(Number(g.target))}
                </div>
              </div>
              <div className="goal-bar-track">
                <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

function SetupStub({ userEmail }: { userEmail: string }) {
  return (
    <>
      <SectionHead title="Setup" meta={userEmail} />
      <div className="flash info">
        Authentication works — you're signed in as <b>{userEmail}</b>. Demo-data loader,
        CSV import, category editor, and profile settings land in M4e.
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <a href="/app/try" className="btn">Try the raw backend →</a>
        <a href="/app/offline" className="btn ghost">Offline test →</a>
      </div>
    </>
  );
}

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <>
      <SectionHead title={title} />
      <EmptyState>{note}</EmptyState>
    </>
  );
}
