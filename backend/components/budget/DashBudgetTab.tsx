"use client";
import React from "react";
import { fmtMoney } from "@/lib/budget";
import { forecastCategory } from "@/lib/budget";

export function DashBudgetTab({
  categories, names, spentByCat, budgetMap, transactions, monthTxns,
  month, isCurrentMonth,
}: {
  categories: any[];
  names: string[];
  spentByCat: Record<string, number>;
  budgetMap: Record<string, string | number>;
  transactions: any[];
  monthTxns: any[];
  month: string;
  isCurrentMonth: boolean;
}) {
  const colorFor = (name: string) =>
    categories.find((c) => c.name === name)?.color ?? "var(--ink-muted)";

  return (
    <div>
      {names.map((c) => {
        const sp = spentByCat[c] || 0;
        const bg = Number(budgetMap[c]) || 0;
        const rm = bg - sp;
        const over = sp > bg && bg > 0;
        const pct = bg > 0 ? Math.min((sp / bg) * 100, 100) : 0;
        const fc = isCurrentMonth && bg > 0 ? forecastCategory(transactions, month, c) : null;
        const projPct = fc && bg > 0 ? Math.min((fc.projected / bg) * 100, 100) : 0;
        const projOver = fc && fc.projected > bg && bg > 0;
        const txCount = monthTxns.filter((t) => t.category === c).length;

        return (
          <div key={c}>
            <div className="cat-row">
              <div className="cat-row-top">
                <span className="cat-swatch" style={{ background: colorFor(c) }} />
                <span className="cat-name">{c}</span>
                <span className="mono" style={{ color: "var(--ink-faint)", fontSize: 11 }}>
                  {txCount} txns
                </span>
                <span className="cat-amounts">
                  <span className={"spent" + (over ? " over" : "")}>{fmtMoney(sp)}</span>
                  {bg > 0 && <span className="budget"> / {fmtMoney(bg)}</span>}
                </span>
              </div>
              {bg > 0 ? (
                <>
                  <div className="bar-track" style={{ position: "relative" }}>
                    <div className="bar-fill" style={{
                      width: pct + "%",
                      background: over ? "var(--bad)" : colorFor(c),
                    }} />
                    {fc && projPct > pct && (
                      <div style={{
                        position: "absolute", top: 0, left: pct + "%",
                        width: (projPct - pct) + "%", height: "100%",
                        background: projOver ? "var(--bad)" : colorFor(c), opacity: 0.35,
                      }} />
                    )}
                  </div>
                  <div className="mono" style={{
                    marginTop: 6, fontSize: 11,
                    color: over ? "var(--bad)" : "var(--ink-muted)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <span>{over ? `Over by ${fmtMoney(Math.abs(rm))}` : `${fmtMoney(rm)} left · ${Math.round(pct)}%`}</span>
                    {fc && fc.daysElapsed > 2 && (
                      <span style={{ color: projOver ? "var(--bad)" : "var(--ink-faint)" }}>
                        pace → {fmtMoney(fc.projected)} by EOM
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="mono" style={{
                  marginTop: 6, fontSize: 11, color: "var(--ink-faint)",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>No budget set</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
