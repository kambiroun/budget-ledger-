"use client";
import React, { useState } from "react";
import {
  fmtMoney, monthKey, monthLabel, monthLabelShort,
} from "@/lib/budget";
import { toLegacyTxns, budgetMapForMonth, catNames } from "@/lib/budget/adapter";
import {
  useCategories, useTransactions, useBudgets,
} from "@/lib/hooks/useData";
import { SectionHead, Btn, EmptyState, MonthPicker } from "@/components/budget/Primitives";
import { DashBudgetTab } from "./DashBudgetTab";
import { DashHeatmap } from "./DashHeatmap";
import { DashAnomalies } from "./DashAnomalies";
import { DashInsights } from "./DashInsights";

type DashTab = "budget" | "heatmap" | "compare" | "insights";

export function DashboardPage() {
  const cats    = useCategories();
  const txns    = useTransactions({ limit: 2000 });
  const budgets = useBudgets();

  const now = new Date();
  const curMK = monthKey(now);
  const [month, setMonth] = useState<string>(curMK);
  const [tab, setTab] = useState<DashTab>("budget");

  const catList = cats.data ?? [];
  const supaTxns = (txns.data?.transactions ?? []) as any[];
  const supaBudgets = (budgets.data ?? []) as any[];

  // Derive month list from txns
  const months = Array.from(new Set(supaTxns.map((t: any) => t.date?.slice(0, 7))))
    .filter(Boolean).sort().reverse();

  // Legacy-shape convert once
  const legacy = React.useMemo(() => toLegacyTxns(supaTxns, catList), [supaTxns, catList]);
  const names  = React.useMemo(() => catNames(catList), [catList]);
  const budgetMap = React.useMemo(() => budgetMapForMonth(supaBudgets, catList, month), [supaBudgets, catList, month]);

  // Current-month summary
  const monthTxns = legacy.filter((t) => monthKey(t.date) === month);
  const charges = monthTxns.filter((t) => !t.isIncome);
  const income  = monthTxns.filter((t) =>  t.isIncome);
  const totalSpent  = charges.reduce((s, t) => s + t.amount, 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const totalBudget = Object.values(budgetMap).reduce((s, v) => s + Number(v || 0), 0);
  const net = totalIncome - totalSpent;

  // Category spent map
  const spentByCat: Record<string, number> = {};
  names.forEach((n) => (spentByCat[n] = 0));
  charges.forEach((t) => {
    if (t.category) spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount;
  });

  const TABS: { k: DashTab; l: string }[] = [
    { k: "budget", l: "By category" },
    { k: "heatmap", l: "Rhythm" },
    { k: "compare", l: "Compare" },
    { k: "insights", l: "Insights" },
  ];

  return (
    <div>
      <SectionHead title="Dashboard" meta={`§04 · ${monthLabel(month)}`}>
        <button
          className="month-nav"
          onClick={() => {
            const i = months.indexOf(month);
            if (i < months.length - 1) setMonth(months[i + 1]);
          }}
          disabled={months.indexOf(month) >= months.length - 1}
        >←</button>
        <MonthPicker
          months={months}
          value={month}
          onChange={setMonth}
          monthLabelShort={monthLabelShort}
        />
        <button
          className="month-nav"
          onClick={() => {
            const i = months.indexOf(month);
            if (i > 0) setMonth(months[i - 1]);
          }}
          disabled={months.indexOf(month) <= 0}
        >→</button>
      </SectionHead>

      {/* Hero */}
      <div className="dash-hero">
        <div>
          <div className="dash-hero-label">spent this month</div>
          <div className="dash-hero-amount num">{fmtMoney(totalSpent)}</div>
          <div className="dash-hero-sub">
            of {fmtMoney(totalBudget)} budget
            {totalBudget > 0 && (
              <span>
                {" "}·{" "}
                <b className={totalSpent > totalBudget ? "bad" : ""}>
                  {Math.round((totalSpent / totalBudget) * 100)}%
                </b>{" "}
                used
              </span>
            )}
          </div>
        </div>
        <div className="dash-hero-side">
          <div>
            <div className="dash-hero-mini-label">income</div>
            <div className="dash-hero-mini-val good num">{fmtMoney(totalIncome)}</div>
          </div>
          <div>
            <div className="dash-hero-mini-label">net</div>
            <div className={"dash-hero-mini-val num " + (net >= 0 ? "good" : "bad")}>
              {net >= 0 ? "+" : "−"}{fmtMoney(Math.abs(net))}
            </div>
          </div>
        </div>
      </div>

      {monthTxns.length === 0 && (
        <EmptyState>
          Nothing recorded for {monthLabel(month)}. Import transactions or load demo data from <b>Setup</b>.
        </EmptyState>
      )}

      <DashAnomalies transactions={legacy} categories={names} month={month} />

      <div className="tabs" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.k}
            className={"tab" + (tab === t.k ? " active" : "")}
            onClick={() => setTab(t.k)}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "budget" && (
        <DashBudgetTab
          categories={catList}
          names={names}
          spentByCat={spentByCat}
          budgetMap={budgetMap}
          transactions={legacy}
          monthTxns={monthTxns}
          month={month}
          isCurrentMonth={month === curMK}
        />
      )}

      {tab === "heatmap" && <DashHeatmap transactions={monthTxns} month={month} />}

      {tab === "compare" && (
        <CompareSimple
          transactions={legacy}
          months={months}
          current={month}
          names={names}
          categories={catList}
        />
      )}

      {tab === "insights" && (
        <DashInsights
          transactions={legacy}
          categories={catList}
          names={names}
          spentByCat={spentByCat}
          budgetMap={budgetMap}
          month={month}
        />
      )}
    </div>
  );
}

/* ----------------- Compare tab (inline — it's short) ----------------- */
function CompareSimple({
  transactions, months, current, names, categories,
}: {
  transactions: any[];
  months: string[];
  current: string;
  names: string[];
  categories: any[];
}) {
  const idx = months.indexOf(current);
  if (idx < 0 || idx >= months.length - 1) {
    return <EmptyState>Need at least two months of data to compare.</EmptyState>;
  }
  const prev = months[idx + 1];
  const sumFor = (mk: string) => {
    const m: Record<string, number> = {};
    names.forEach((n) => (m[n] = 0));
    transactions.forEach((t: any) => {
      if (monthKey(t.date) === mk && t.category && !t.isIncome) {
        m[t.category] = (m[t.category] || 0) + t.amount;
      }
    });
    return m;
  };
  const c = sumFor(current);
  const p = sumFor(prev);
  const rows = names
    .map((n) => ({ cat: n, c: c[n], p: p[n], d: (c[n] || 0) - (p[n] || 0) }))
    .filter((r) => r.c > 0 || r.p > 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const colorFor = (name: string) =>
    categories.find((c: any) => c.name === name)?.color ?? "var(--ink-muted)";
  const totalC = Object.values(c).reduce((s, v) => s + v, 0);
  const totalP = Object.values(p).reduce((s, v) => s + v, 0);
  return (
    <table className="report">
      <thead>
        <tr>
          <th>Category</th>
          <th className="num">{monthLabel(prev)}</th>
          <th className="num">{monthLabel(current)}</th>
          <th className="num">Δ</th>
          <th className="num">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = r.p > 0 ? Math.round((r.d / r.p) * 100) : r.c > 0 ? 100 : 0;
          return (
            <tr key={r.cat}>
              <td className="cat" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="cat-swatch" style={{ background: colorFor(r.cat) }} />
                {r.cat}
              </td>
              <td className="num">{fmtMoney(r.p)}</td>
              <td className="num">{fmtMoney(r.c)}</td>
              <td className={"num " + (r.d > 0 ? "delta-up" : r.d < 0 ? "delta-down" : "")}>
                {r.d === 0 ? "—" : (r.d > 0 ? "+" : "−") + fmtMoney(Math.abs(r.d))}
              </td>
              <td className={"num " + (r.d > 0 ? "delta-up" : r.d < 0 ? "delta-down" : "")}>
                {r.d === 0 ? "—" : (pct > 0 ? "+" : "") + pct + "%"}
              </td>
            </tr>
          );
        })}
        <tr style={{ borderTop: "2px solid var(--ink)", fontWeight: 700 }}>
          <td className="cat">TOTAL</td>
          <td className="num">{fmtMoney(totalP)}</td>
          <td className="num">{fmtMoney(totalC)}</td>
          <td className={"num " + (totalC - totalP > 0 ? "delta-up" : "delta-down")}>
            {totalC - totalP > 0 ? "+" : "−"}{fmtMoney(Math.abs(totalC - totalP))}
          </td>
          <td className="num">
            {totalP > 0 ? Math.round(((totalC - totalP) / totalP) * 100) + "%" : "—"}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
