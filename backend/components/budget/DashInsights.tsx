"use client";
import React from "react";
import { fmtMoney, detectAnomalies, detectRecurring } from "@/lib/budget";

export function DashInsights({
  transactions, categories, names, spentByCat, budgetMap, month,
}: {
  transactions: any[];
  categories: any[];
  names: string[];
  spentByCat: Record<string, number>;
  budgetMap: Record<string, string | number>;
  month: string;
}) {
  const anomalies = React.useMemo(
    () => detectAnomalies(transactions, names, month),
    [transactions, names, month]
  );
  const recurring = React.useMemo(() => detectRecurring(transactions), [transactions]);

  const catsOnTrack = names.filter((n) => {
    const b = Number(budgetMap[n]) || 0;
    return b > 0 && (spentByCat[n] || 0) <= b;
  }).length;
  const catsWithBudget = names.filter((n) => (Number(budgetMap[n]) || 0) > 0).length;
  const healthPct = catsWithBudget > 0 ? Math.round((catsOnTrack / catsWithBudget) * 100) : 0;
  const healthLbl = healthPct >= 80 ? "Excellent" : healthPct >= 50 ? "Watchful" : "Needs attention";
  const healthColor = healthPct >= 80 ? "var(--good)" : healthPct >= 50 ? "var(--warn)" : "var(--bad)";

  const colorFor = (name: string) =>
    categories.find((c: any) => c.name === name)?.color ?? "var(--ink-muted)";

  return (
    <div>
      <div className="chart-card">
        <h3>Budget health</h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <div className="mono" style={{
            fontSize: 72, fontWeight: 500, letterSpacing: "-0.03em",
            color: healthColor, lineHeight: 1,
          }}>
            {healthPct}%
          </div>
          <div>
            <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 26, fontStyle: "italic" }}>
              {healthLbl}
            </div>
            <div className="mono" style={{
              fontSize: 11, color: "var(--ink-muted)",
              letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4,
            }}>
              {catsOnTrack} of {catsWithBudget} on track
            </div>
          </div>
        </div>
      </div>

      {anomalies.length > 0 && (
        <>
          <h3 style={{
            fontFamily: "Fraunces, Georgia, serif", fontWeight: 500,
            fontSize: 18, margin: "24px 0 10px",
          }}>Flags</h3>
          {anomalies.map((a: any, i: number) => (
            <div key={i} className="insight warn">
              <div>
                <div className="insight-label">
                  {a.type === "large_charge" ? "Unusual charge" : "Above baseline"}
                </div>
                <div className="insight-text">{a.text}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {recurring.length > 0 && (
        <div className="chart-card" style={{ marginTop: 20 }}>
          <h3>Recurring charges ({recurring.length})</h3>
          <div className="mono" style={{
            fontSize: 11, color: "var(--ink-muted)", marginBottom: 10,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            Estimated {fmtMoney(recurring.reduce((s: number, r: any) => s + r.avg, 0))}/mo
          </div>
          {recurring.slice(0, 8).map((r: any) => (
            <div key={r.merchant} style={{
              display: "flex", justifyContent: "space-between",
              padding: "6px 0", borderBottom: "1px solid var(--rule-soft)",
              fontSize: 13,
            }}>
              <span style={{
                flex: 1, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontFamily: "Source Serif 4, Georgia, serif",
              }}>{r.merchant}</span>
              {r.lastCategory && (
                <span className="pill" style={{
                  color: colorFor(r.lastCategory),
                  marginRight: 10,
                }}>
                  <span className="dot" />
                  {r.lastCategory}
                </span>
              )}
              <span className="mono" style={{ fontWeight: 600, minWidth: 80, textAlign: "right" }}>
                {fmtMoney(r.avg)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
