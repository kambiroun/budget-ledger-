"use client";
import React from "react";
import {
  fmtMoney, monthKey, monthLabel,
} from "@/lib/budget";
import { toLegacyTxns, budgetMapForMonth, catNames } from "@/lib/budget/adapter";
import {
  useCategories, useTransactions, useBudgets,
} from "@/lib/hooks/useData";
import { SectionHead, EmptyState } from "./Primitives";
import { ForecastChart } from "./ForecastChart";
import { TimelineView } from "./TimelineView";
import { StressTest } from "./StressTest";

type SubTab = "forecast" | "compare" | "timeline" | "stress";

export function ComparePage() {
  const cats = useCategories();
  const txns = useTransactions({ limit: 2000 });
  const budgets = useBudgets();

  const catList = cats.data ?? [];
  const supaTxns = (txns.data?.transactions ?? []) as any[];
  const supaBudgets = (budgets.data ?? []) as any[];

  const legacy = React.useMemo(() => toLegacyTxns(supaTxns, catList), [supaTxns, catList]);
  const names = React.useMemo(() => catNames(catList), [catList]);

  const months = React.useMemo(
    () => Array.from(new Set(supaTxns.map((t: any) => t.date?.slice(0, 7))))
      .filter(Boolean).sort(),
    [supaTxns]
  );

  const latest = months[months.length - 1] ?? monthKey(new Date());
  const [selected, setSelected] = React.useState<string>(latest);
  React.useEffect(() => {
    if (months.length && !months.includes(selected)) setSelected(latest);
  }, [months.join("|")]);

  const [tab, setTab] = React.useState<SubTab>("forecast");

  const budgetMap = React.useMemo(
    () => budgetMapForMonth(supaBudgets, catList, selected),
    [supaBudgets, catList, selected]
  );

  const monthTxns = legacy.filter((t) => monthKey(t.date) === selected);
  const charges = monthTxns.filter((t) => !t.isIncome);
  const income = monthTxns.filter((t) => t.isIncome);
  const totalSpent = charges.reduce((s, t) => s + t.amount, 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);

  const spentByCategory: Record<string, number> = {};
  names.forEach((n) => (spentByCategory[n] = 0));
  charges.forEach((t) => {
    if (t.category) spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
  });

  const TABS: { k: SubTab; l: string }[] = [
    { k: "forecast", l: "Forecast" },
    { k: "compare", l: "Compare months" },
    { k: "timeline", l: "Timeline" },
    { k: "stress", l: "Stress test" },
  ];

  const hasData = months.length > 0;

  return (
    <div>
      <SectionHead title="Forecast & compare" meta="§06">
        {hasData && (
          <select className="sel" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m).toUpperCase()}</option>
            ))}
          </select>
        )}
      </SectionHead>

      {!hasData ? (
        <EmptyState>Add or import transactions to unlock forecasts and comparisons.</EmptyState>
      ) : (
        <>
          <div className="tabs" style={{ marginBottom: 20 }}>
            {TABS.map((t) => (
              <button key={t.k}
                className={"tab" + (tab === t.k ? " active" : "")}
                onClick={() => setTab(t.k)}
              >{t.l}</button>
            ))}
          </div>

          {tab === "forecast" && (
            <ForecastChart
              transactions={legacy}
              budgets={budgetMap}
              selectedMonth={selected}
            />
          )}

          {tab === "compare" && (
            <ComparePeriods
              transactions={legacy}
              months={months}
              categories={catList}
              names={names}
            />
          )}

          {tab === "timeline" && (
            <TimelineView
              transactions={legacy}
              categories={catList}
              selectedMonth={selected}
            />
          )}

          {tab === "stress" && (
            <StressTest
              categories={catList}
              spentByCategory={spentByCategory}
              totalSpent={totalSpent}
              totalIncome={totalIncome}
            />
          )}
        </>
      )}
    </div>
  );
}

/* --------- Compare periods side-by-side --------- */
function ComparePeriods({
  transactions, months, categories, names,
}: {
  transactions: any[];
  months: string[];
  categories: any[];
  names: string[];
}) {
  const defaultRight = months[months.length - 1];
  const defaultLeft = months.length >= 2 ? months[months.length - 2] : months[0];
  const [left, setLeft] = React.useState(defaultLeft);
  const [right, setRight] = React.useState(defaultRight);

  const colorFor = (n: string) =>
    categories.find((c: any) => c.name === n)?.color ?? "var(--ink-muted)";

  const computeMonth = (mk: string) => {
    const t = transactions.filter(
      (x: any) => !x.isDupe && !x.isIncome && x.category && monthKey(x.date) === mk
    );
    const byCat: Record<string, number> = {};
    names.forEach((c) => (byCat[c] = 0));
    t.forEach((x: any) => (byCat[x.category] = (byCat[x.category] || 0) + x.amount));
    const total = Object.values(byCat).reduce<number>((s, v) => s + v, 0);
    const income = transactions
      .filter((x: any) => x.isIncome && !x.isDupe && monthKey(x.date) === mk)
      .reduce((s: number, x: any) => s + x.amount, 0);
    return { byCat, total, income, net: income - total };
  };

  const L = React.useMemo(() => (left ? computeMonth(left) : null), [left, transactions, names]);
  const R = React.useMemo(() => (right ? computeMonth(right) : null), [right, transactions, names]);

  if (!L || !R) {
    return <EmptyState>Need at least 2 months of data to compare.</EmptyState>;
  }

  const rows = names
    .map((c) => ({
      cat: c,
      left: L.byCat[c] || 0,
      right: R.byCat[c] || 0,
      delta: (R.byCat[c] || 0) - (L.byCat[c] || 0),
    }))
    .filter((r) => r.left > 0 || r.right > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const maxAmt = Math.max(...rows.map((r) => Math.max(r.left, r.right)), 1);
  const deltaTotal = R.total - L.total;

  return (
    <div className="compare">
      <div className="compare-pickers">
        <select className="sel" value={left} onChange={(e) => setLeft(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <span className="mono" style={{ color: "var(--ink-muted)", fontSize: 11, letterSpacing: "0.12em" }}>VS</span>
        <select className="sel" value={right} onChange={(e) => setRight(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div className="compare-summary">
        <div>
          <div className="compare-sum-label mono">{monthLabel(left)}</div>
          <div className="compare-sum-val num">{fmtMoney(L.total)}</div>
          <div className="compare-sum-sub mono">
            net {L.net >= 0 ? "+" : "−"}{fmtMoney(Math.abs(L.net))}
          </div>
        </div>
        <div className="compare-delta">
          <div className={"compare-delta-val num " + (deltaTotal > 0 ? "bad" : "good")}>
            {deltaTotal > 0 ? "+" : ""}{fmtMoney(deltaTotal)}
          </div>
          <div className="compare-delta-label mono">
            {L.total > 0
              ? (deltaTotal > 0 ? "+" : "") + Math.round((deltaTotal / L.total) * 100) + "%"
              : ""}
          </div>
        </div>
        <div>
          <div className="compare-sum-label mono">{monthLabel(right)}</div>
          <div className="compare-sum-val num">{fmtMoney(R.total)}</div>
          <div className="compare-sum-sub mono">
            net {R.net >= 0 ? "+" : "−"}{fmtMoney(Math.abs(R.net))}
          </div>
        </div>
      </div>

      <div className="compare-rows">
        {rows.map((r) => {
          const leftPct = (r.left / maxAmt) * 100;
          const rightPct = (r.right / maxAmt) * 100;
          return (
            <div key={r.cat} className="compare-row">
              <div className="compare-row-left">
                <div className="compare-row-bar-wrap" style={{ justifyContent: "flex-end" }}>
                  <span className="compare-row-amt num">{r.left ? fmtMoney(r.left) : "—"}</span>
                  <div className="compare-row-bar left"
                    style={{ width: leftPct + "%", background: colorFor(r.cat) }} />
                </div>
              </div>
              <div className="compare-row-cat">
                <span className="cat-swatch" style={{ background: colorFor(r.cat) }} />
                <span>{r.cat}</span>
                {r.delta !== 0 && (
                  <span className={"compare-row-delta mono " + (r.delta > 0 ? "bad" : "good")}>
                    {r.delta > 0 ? "▲" : "▼"}{fmtMoney(Math.abs(r.delta))}
                  </span>
                )}
              </div>
              <div className="compare-row-right">
                <div className="compare-row-bar-wrap">
                  <div className="compare-row-bar right"
                    style={{ width: rightPct + "%", background: colorFor(r.cat) }} />
                  <span className="compare-row-amt num">{r.right ? fmtMoney(r.right) : "—"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
