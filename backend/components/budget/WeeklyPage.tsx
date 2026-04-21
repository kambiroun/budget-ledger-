"use client";
import React from "react";
import { fmtMoney, fmtDate, computeWeeklyDigest } from "@/lib/budget";
import { toLegacyTxns } from "@/lib/budget/adapter";
import { useCategories, useTransactions } from "@/lib/hooks/useData";
import { SectionHead, EmptyState } from "./Primitives";

export function WeeklyPage() {
  const cats = useCategories();
  const txns = useTransactions({ limit: 2000 });
  const [weeksBack, setWeeksBack] = React.useState(0);

  const catList = cats.data ?? [];
  const supaTxns = (txns.data?.transactions ?? []) as any[];
  const legacy = React.useMemo(() => toLegacyTxns(supaTxns, catList), [supaTxns, catList]);
  const digest = React.useMemo(() => computeWeeklyDigest(legacy, weeksBack), [legacy, weeksBack]);

  const colorFor = (name: string) =>
    catList.find((c: any) => c.name === name)?.color ?? "var(--ink-muted)";

  const catRows = Object.entries(digest.catDiff || {})
    .map(([cat, v]: any) => ({ cat, ...v, delta: (v.this || 0) - (v.prev || 0) }))
    .sort((a: any, b: any) => Math.abs(b.delta) - Math.abs(a.delta));

  const topThis = [...digest.thisWeek]
    .filter((t: any) => !t.isIncome && t.category)
    .sort((a: any, b: any) => b.amount - a.amount)
    .slice(0, 5);

  return (
    <div>
      <SectionHead title="Weekly digest" meta="§05">
        <button className="month-nav" onClick={() => setWeeksBack((w) => w + 1)}>← earlier</button>
        <button
          className="month-nav"
          onClick={() => setWeeksBack((w) => Math.max(0, w - 1))}
          disabled={weeksBack === 0}
        >later →</button>
      </SectionHead>

      {legacy.length === 0 ? (
        <EmptyState>Import or add transactions to see your weekly digest.</EmptyState>
      ) : (
        <>
          <div className="weekly-card">
            <div className="weekly-card-head">
              <div className="mono" style={{
                fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-muted)",
              }}>
                Week of {fmtDate(digest.startOfWeek)} — {fmtDate(digest.endOfWeek)}
              </div>
              {weeksBack === 0 && (
                <span className="mono" style={{
                  fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)",
                }}>This week</span>
              )}
            </div>
            <div className="weekly-metrics">
              <div>
                <div className="weekly-metric-val num">{fmtMoney(digest.thisSpent)}</div>
                <div className="mono metric-sub">spent</div>
              </div>
              <div>
                <div className={"num metric-delta " + (digest.delta > 0 ? "bad" : "good")}>
                  {digest.delta > 0 ? "+" : "−"}{fmtMoney(Math.abs(digest.delta))}
                </div>
                <div className="mono metric-sub">
                  vs prior week{" "}
                  {digest.prevSpent > 0 && `(${digest.delta > 0 ? "+" : ""}${Math.round(digest.deltaPct)}%)`}
                </div>
              </div>
              {digest.thisIncome > 0 && (
                <div>
                  <div className="num metric-delta good">+{fmtMoney(digest.thisIncome)}</div>
                  <div className="mono metric-sub">income</div>
                </div>
              )}
            </div>
          </div>

          <h3 className="section-sub-h">By category</h3>
          <table className="report" style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Prior week</th>
                <th className="num">This week</th>
                <th className="num">Δ</th>
              </tr>
            </thead>
            <tbody>
              {catRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: "var(--ink-faint)", fontStyle: "italic", padding: 20 }}>
                    No categorized spending this week or prior.
                  </td>
                </tr>
              ) : (
                catRows.map((r: any) => (
                  <tr key={r.cat}>
                    <td className="cat" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="cat-swatch" style={{ background: colorFor(r.cat) }} />
                      {r.cat}
                    </td>
                    <td className="num">{fmtMoney(r.prev || 0)}</td>
                    <td className="num">{fmtMoney(r.this || 0)}</td>
                    <td className={"num " + (r.delta > 0 ? "delta-up" : r.delta < 0 ? "delta-down" : "")}>
                      {r.delta === 0
                        ? "—"
                        : (r.delta > 0 ? "+" : "−") + fmtMoney(Math.abs(r.delta))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {topThis.length > 0 && (
            <>
              <h3 className="section-sub-h">Biggest charges this week</h3>
              <div className="chart-card">
                {topThis.map((t: any, i: number) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 0",
                    borderBottom: i < topThis.length - 1 ? "1px solid var(--rule-soft)" : "none",
                  }}>
                    <span className="cat-swatch" style={{ background: colorFor(t.category) }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "Source Serif 4, Georgia, serif", fontSize: 15 }}>
                        {t.description}
                      </div>
                      <div className="mono" style={{
                        fontSize: 10, color: "var(--ink-muted)",
                        letterSpacing: "0.08em", textTransform: "uppercase",
                      }}>
                        {fmtDate(t.date)} · {t.category}
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                      {fmtMoney(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
