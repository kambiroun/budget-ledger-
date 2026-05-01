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
import { ResetWidget } from "@/components/budget/ResetWidget";
import { UpgradeModal } from "@/components/budget/UpgradeModal";
import { MobileTabBar } from "@/components/budget/MobileTabBar";
import { useCategories, useTransactions, useGoals, useRules } from "@/lib/hooks/useData";
import { toLegacyTxns } from "@/lib/budget/adapter";
import { updateTransaction, deleteTransaction, createTransaction } from "@/lib/db/client";
import { aiParse } from "@/lib/ai/client";

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
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeTier, setUpgradeTier] = useState<"pro" | "plus">("pro");

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

  // Global entry point for command actions. Any component in the tree can
  // dispatch a CmdAction and have the shell route it (nav, filter, open drawer,
  // AI parse, etc.). Keeps child components decoupled from the shell's state.
  useEffect(() => {
    const onCmd = (e: Event) => {
      const action = (e as CustomEvent<CmdAction>).detail;
      if (action) handleCmd(action);
    };
    window.addEventListener("budget:cmd", onCmd as EventListener);
    return () => window.removeEventListener("budget:cmd", onCmd as EventListener);
    // handleCmd is recreated every render but closes over stable setters,
    // so the listener staying pinned to the first instance is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        try {
          const parsed = await aiParse(a.input);
          await createTransaction({
            date: parsed.date,
            description: parsed.description,
            amount: parsed.amount,
            is_income: parsed.is_income,
            category_id: parsed.category_id,
            source: "manual",
          });
          await txns.refresh();
        } catch (e: any) {
          const msg = e?.message ?? "";
          if (msg === "subscription_required" || e?.status === 402) {
            const tier = e?.details?.required_tier ?? "pro";
            setUpgradeTier(tier);
            setUpgradeOpen(true);
          } else if (msg === "ai_daily_limit_exceeded") {
            alert("You\u2019ve hit today\u2019s AI limit. Try again tomorrow.");
          } else if (msg === "could_not_extract_transaction") {
            alert("I couldn\u2019t parse that into a transaction \u2014 try something like \u201Ccoffee $5 yesterday.\u201D");
          } else if (msg === "ai_not_configured") {
            alert("AI isn\u2019t configured on this deployment (no API key).");
          } else {
            alert("AI parse failed: " + msg);
          }
        }
        break;
    }
  };

  return (
    <div className="app">
      <ResetWidget />
      <Masthead txCount={txList.length} />
      <Tabs tabs={tabs} active={active} onChange={(k) => setActive(k as TabKey)} />
      <MobileTabBar
        active={active}
        onChange={(k) => setActive(k)}
        onAdd={() => setPaletteOpen(true)}
      />

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

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        requiredTier={upgradeTier}
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
