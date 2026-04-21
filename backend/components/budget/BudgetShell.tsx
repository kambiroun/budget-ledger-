"use client";
import React, { useMemo, useState } from "react";
import { Masthead, Tabs, SectionHead, EmptyState, TabDef } from "@/components/budget/Primitives";
import { LedgerPage } from "@/components/budget/LedgerPage";
import { DashboardPage } from "@/components/budget/DashboardPage";
import { WeeklyPage } from "@/components/budget/WeeklyPage";
import { ComparePage } from "@/components/budget/ComparePage";
import { useCategories, useTransactions, useBudgets, useGoals, useRules } from "@/lib/hooks/useData";
import { fmtMoney } from "@/lib/budget";

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

      {active === "dashboard" && <DashboardPage />}
      {active === "ledger"    && <LedgerPage />}
      {active === "weekly"    && <WeeklyPage />}
      {active === "compare"   && <ComparePage />}
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
