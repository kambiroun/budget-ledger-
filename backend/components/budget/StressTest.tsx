"use client";
import React from "react";
import { fmtMoney } from "@/lib/budget";

export function StressTest({
  categories, spentByCategory, totalSpent, totalIncome,
}: {
  categories: any[];
  spentByCategory: Record<string, number>;
  totalSpent: number;
  totalIncome: number;
}) {
  const [adjust, setAdjust] = React.useState<Record<string, number>>({});
  const [incomeAdj, setIncomeAdj] = React.useState(0);

  const names = categories.filter((c: any) => !c.is_income).map((c: any) => c.name);
  const colorFor = (n: string) =>
    categories.find((c: any) => c.name === n)?.color ?? "var(--ink-muted)";

  const scenarios: { label: string; deltas?: Record<string, number>; all?: number }[] = [
    { label: "Status quo", deltas: {} },
    { label: "Cut Eating Out 30%", deltas: { "Eating Out": -30 } },
    { label: "Austere month (−20%)", all: -20 },
  ];

  const adjusted = React.useMemo(() => {
    const out: Record<string, number> = {};
    names.forEach((c: string) => {
      const base = spentByCategory[c] || 0;
      const pct = adjust[c] || 0;
      out[c] = Math.max(0, base * (1 + pct / 100));
    });
    const total = Object.values(out).reduce<number>((s, v) => s + v, 0);
    return { byCat: out, total };
  }, [adjust, spentByCategory, names]);

  const netNow = totalIncome - totalSpent;
  const netAfter = (totalIncome + incomeAdj) - adjusted.total;
  const deltaMonthly = netAfter - netNow;
  const delta12 = deltaMonthly * 12;

  const applyScenario = (sc: typeof scenarios[number]) => {
    const next: Record<string, number> = {};
    if (sc.all !== undefined) names.forEach((c: string) => (next[c] = sc.all!));
    else if (sc.deltas) Object.assign(next, sc.deltas);
    setAdjust(next);
  };

  return (
    <div className="stress">
      <div className="stress-head">
        <div>
          <div className="stress-head-kicker mono">WHAT-IF</div>
          <h4 className="stress-head-title">Budget stress test</h4>
          <p className="stress-head-body">
            Drag sliders to see how changes ripple into savings. Not saved — purely a scratchpad.
          </p>
        </div>
        <div className="stress-quickies">
          {scenarios.map((s) => (
            <button key={s.label} className="stress-quickie mono" onClick={() => applyScenario(s)}>
              {s.label}
            </button>
          ))}
          <button
            className="stress-quickie mono danger"
            onClick={() => { setAdjust({}); setIncomeAdj(0); }}
          >reset</button>
        </div>
      </div>

      <div className="stress-impact">
        <div>
          <div className="stress-impact-label mono">CURRENT MONTHLY NET</div>
          <div className="stress-impact-val num">
            {netNow >= 0 ? "+" : "−"}{fmtMoney(Math.abs(netNow))}
          </div>
        </div>
        <div className="stress-impact-arrow">→</div>
        <div>
          <div className="stress-impact-label mono">SIMULATED MONTHLY NET</div>
          <div className={"stress-impact-val num " + (netAfter > netNow ? "good" : netAfter < netNow ? "bad" : "")}>
            {netAfter >= 0 ? "+" : "−"}{fmtMoney(Math.abs(netAfter))}
          </div>
        </div>
        <div className="stress-impact-arrow">=</div>
        <div>
          <div className="stress-impact-label mono">ANNUAL DELTA</div>
          <div className={"stress-impact-val num " + (delta12 > 0 ? "good" : delta12 < 0 ? "bad" : "")}>
            {delta12 >= 0 ? "+" : "−"}{fmtMoney(Math.abs(delta12))}
          </div>
        </div>
      </div>

      <div className="stress-sliders">
        <div className="stress-slider-row">
          <label>
            <span style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 16 }}>Income</span>
            <span className="mono">
              {incomeAdj >= 0 ? "+" : "−"}{fmtMoney(Math.abs(incomeAdj))}
            </span>
          </label>
          <input type="range" min={-2000} max={3000} step={50}
            value={incomeAdj} onChange={(e) => setIncomeAdj(+e.target.value)} />
        </div>
        {names.filter((c: string) => (spentByCategory[c] || 0) > 0).map((c: string) => (
          <div key={c} className="stress-slider-row">
            <label>
              <span style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "Fraunces, Georgia, serif", fontSize: 16,
              }}>
                <span className="cat-swatch" style={{ background: colorFor(c) }} />
                {c}
              </span>
              <span className="mono">
                <span style={{
                  color: (adjust[c] || 0) > 0 ? "var(--bad)"
                    : (adjust[c] || 0) < 0 ? "var(--good)" : "var(--ink-muted)",
                }}>
                  {(adjust[c] || 0) >= 0 ? "+" : ""}{adjust[c] || 0}%
                </span>
                <span style={{ color: "var(--ink-muted)", marginLeft: 8 }}>
                  {fmtMoney(spentByCategory[c] || 0)} → {fmtMoney(adjusted.byCat[c])}
                </span>
              </span>
            </label>
            <input type="range" min={-60} max={100} step={5}
              value={adjust[c] || 0}
              onChange={(e) => setAdjust({ ...adjust, [c]: +e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}
