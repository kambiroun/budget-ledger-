"use client";
import React from "react";
import { fmtMoney, detectAnomalies, detectRecurring } from "@/lib/budget";
import { aiInsights } from "@/lib/ai/client";

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

  /* --------- AI narrative (on-demand, cached per month in memory) --------- */
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiOut, setAiOut] = React.useState<{ narrative: string; findings: string[] } | null>(null);
  const [aiErr, setAiErr] = React.useState<string | null>(null);
  // Reset cache when month changes so the paragraph matches what you're viewing.
  React.useEffect(() => { setAiOut(null); setAiErr(null); }, [month]);

  const runInsights = async () => {
    if (aiBusy) return;
    setAiBusy(true); setAiErr(null);
    try {
      // Build a compact aggregate — don't ship individual transactions.
      const totalSpent = names.reduce((s, n) => s + (spentByCat[n] || 0), 0);
      const totalIncome = transactions
        .filter((t) => t.isIncome)
        .filter((t) => {
          const d = new Date(t.date); if (isNaN(d.getTime())) return false;
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return mk === month;
        })
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const by_category = names
        .map((n) => ({
          name: n,
          amount: Math.round(spentByCat[n] || 0),
          budget: Number(budgetMap[n]) || undefined,
        }))
        .filter((c) => c.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 15);
      const out = await aiInsights({
        month,
        total_spent: Math.round(totalSpent),
        total_income: Math.round(totalIncome),
        net: Math.round(totalIncome - totalSpent),
        by_category,
        anomalies: anomalies.slice(0, 5).map((a: any) => a.text),
      });
      setAiOut(out);
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg === "ai_daily_limit_exceeded") setAiErr("Daily AI limit reached.");
      else if (msg === "ai_not_configured") setAiErr("AI not configured on this deployment.");
      else setAiErr("AI failed: " + msg);
    } finally {
      setAiBusy(false);
    }
  };

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
      {/* AI narrative block */}
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>This month, in a paragraph</h3>
          {!aiOut && (
            <button
              onClick={runInsights} disabled={aiBusy}
              className="filter-pill"
              style={{ fontSize: 12 }}
            >
              {aiBusy ? "thinking\u2026" : "\u2728 generate"}
            </button>
          )}
        </div>
        {aiErr && (
          <div style={{
            marginTop: 10, fontSize: 13, color: "var(--bad)",
            fontFamily: "JetBrains Mono, monospace",
          }}>{aiErr}</div>
        )}
        {!aiOut && !aiErr && !aiBusy && (
          <p style={{
            marginTop: 10, fontFamily: "Source Serif 4, Georgia, serif",
            fontSize: 15, color: "var(--ink-faint)", fontStyle: "italic",
          }}>
            Click generate for a short AI read of your month \u2014 what stood out, where
            the money went, what\u2019s drifting.
          </p>
        )}
        {aiOut && (
          <>
            <p style={{
              marginTop: 10, fontFamily: "Source Serif 4, Georgia, serif",
              fontSize: 17, lineHeight: 1.55, color: "var(--ink)",
              textWrap: "pretty" as any,
            }}>
              {aiOut.narrative}
            </p>
            {aiOut.findings?.length > 0 && (
              <ul style={{
                marginTop: 14, paddingLeft: 18, fontSize: 14,
                color: "var(--ink-muted)", lineHeight: 1.5,
              }}>
                {aiOut.findings.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
          </>
        )}
      </div>

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
