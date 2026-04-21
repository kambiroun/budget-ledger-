"use client";
import React, { useMemo, useState } from "react";
import { Masthead, Tabs, TabDef } from "@/components/budget/Primitives";
import { LedgerPage } from "@/components/budget/LedgerPage";
import { DashboardPage } from "@/components/budget/DashboardPage";
import { WeeklyPage } from "@/components/budget/WeeklyPage";
import { RulesPage } from "@/components/budget/RulesPage";
import { GoalsPage } from "@/components/budget/GoalsPage";
import { SetupPage } from "@/components/budget/SetupPage";
import { ComparePage } from "@/components/budget/ComparePage";
import { useCategories, useTransactions, useGoals, useRules } from "@/lib/hooks/useData";

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
      {active === "rules"     && <RulesPage />}
      {active === "goals"     && <GoalsPage />}
      {active === "setup"     && <SetupPage userEmail={userEmail} />}
    </div>
  );
}

/* ============================================================
   All page components live in their own files now.
   ============================================================ */
