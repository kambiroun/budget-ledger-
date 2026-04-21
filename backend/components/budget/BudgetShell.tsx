"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Masthead, Tabs, TabDef } from "@/components/budget/Primitives";
import { LedgerPage } from "@/components/budget/LedgerPage";
import { DashboardPage } from "@/components/budget/DashboardPage";
import { WeeklyPage } from "@/components/budget/WeeklyPage";
import { RulesPage } from "@/components/budget/RulesPage";
import { GoalsPage } from "@/components/budget/GoalsPage";
import { SetupPage } from "@/components/budget/SetupPage";
import { ComparePage } from "@/components/budget/ComparePage";
import { CommandPalette, CmdAction } from "@/components/budget/CommandPalette";
import { ReceiptDrawer } from "@/components/budget/ReceiptDrawer";
import { useCategories, useTransactions, useGoals, useRules } from "@/lib/hooks/useData";
import { toLegacyTxns } from "@/lib/budget/adapter";
import { updateTransaction, deleteTransaction } from "@/lib/db/client";

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerTxnId, setDrawerTxnId] = useState<string | null>(null);

  const cats    = useCategories();
  const txns    = useTransactions({ limit: 500 });
  const goals   = useGoals();
  const rules   = useRules();

  const loading = cats.loading || txns.loading;
  const txList  = txns.data?.transactions ?? [];
  const catList = cats.data ?? [];

  // Legacy txns — used by command palette (search) + drawer (merchant history)
  const legacyTxns = useMemo(
    () => toLegacyTxns(txList as any, catList as any),
    [txList, catList]
  );

  // ⌘K / Ctrl-K to open palette; ESC closes handled inside the palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Listen for double-click → open drawer (dispatched by LedgerPage rows)
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) setDrawerTxnId(id);
    };
    window.addEventListener("budget:open-receipt", handler as EventListener);
    return () => window.removeEventListener("budget:open-receipt", handler as EventListener);
  }, []);

  // Tab counts
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

  // Drawer subject
  const drawerLegacy = drawerTxnId
    ? legacyTxns.find((t: any) => t.id === drawerTxnId) ?? null
    : null;

  const handleCmd = async (a: CmdAction) => {
    switch (a.kind) {
      case "nav":
        setActive(a.target);
        break;
      case "filter-category":
      case "filter-uncategorized":
      case "filter-search":
        setActive("ledger");
        // TODO: deep-link filter into ledger via another custom event
        window.dispatchEvent(new CustomEvent("budget:ledger-filter", { detail: a }));
        break;
      case "open-txn":
        setDrawerTxnId(a.txn.id);
        break;
      case "ai-parse":
        // Call the AI endpoint; fall back to a no-op if the route isn't wired yet
        try {
          const res = await fetch("/api/ai/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: a.input }),
          });
          if (res.ok) await txns.refresh();
          else alert("AI parse isn't available yet.");
        } catch {
          alert("AI parse failed.");
        }
        break;
    }
  };

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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        categories={catList}
        transactions={legacyTxns}
        onAction={handleCmd}
      />

      <ReceiptDrawer
        txn={drawerLegacy as any}
        transactions={legacyTxns as any}
        categories={catList}
        onClose={() => setDrawerTxnId(null)}
        onCategoryChange={async (catId) => {
          if (!drawerTxnId) return;
          await updateTransaction(drawerTxnId, { category_id: catId });
          await txns.refresh();
        }}
        onDelete={async () => {
          if (!drawerTxnId) return;
          await deleteTransaction(drawerTxnId);
          setDrawerTxnId(null);
          await txns.refresh();
        }}
      />
    </div>
  );
}
