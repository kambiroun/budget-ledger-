"use client";
import React from "react";
import { fmtMoney, monthKey } from "@/lib/budget";

function fmtShort(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + Math.round(n);
}

type ForecastData = {
  cumActual: number[];
  projected: number[];
  mean: number[];
  stddev: number[];
  daysInMonth: number;
  todayDay: number;
  isCurrentMonth: boolean;
  pastCount: number;
  totalBudget: number;
  noHistory: false;
};
type ForecastEmpty = {
  cumActual: number[];
  daysInMonth: number;
  todayDay: number;
  noHistory: true;
};
type ForecastResult = ForecastData | ForecastEmpty | null;

export function ForecastChart({
  transactions, budgets, selectedMonth,
}: {
  transactions: any[];
  budgets: Record<string, string | number>;
  selectedMonth: string;
}) {
  const forecast = React.useMemo<ForecastResult>(() => {
    if (!selectedMonth || selectedMonth === "all") return null;
    const today = new Date();
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const isCurrent = monthKey(today) === selectedMonth;
    const todayDay = isCurrent ? today.getDate() : daysInMonth;

    const curTxns = transactions.filter((t) =>
      !t.isIncome && !t.isDupe && monthKey(t.date) === selectedMonth && t.category
    );
    const dailyActual = Array(daysInMonth + 1).fill(0);
    curTxns.forEach((t: any) => {
      const d = new Date(t.date).getDate();
      if (d <= daysInMonth) dailyActual[d] += t.amount;
    });
    const cumActual: number[] = [0];
    for (let i = 1; i <= daysInMonth; i++) cumActual.push(cumActual[i - 1] + dailyActual[i]);

    const pastMonths = Array.from(new Set(transactions.map((t: any) => monthKey(t.date))))
      .filter((m: any) => m < selectedMonth)
      .sort();

    if (pastMonths.length === 0) {
      return { cumActual, daysInMonth, todayDay, noHistory: true };
    }

    const cumByMonth = pastMonths.map((mk) => {
      const daily = Array(32).fill(0);
      transactions
        .filter((t: any) =>
          !t.isIncome && !t.isDupe && t.category && monthKey(t.date) === mk
        )
        .forEach((t: any) => {
          const d = new Date(t.date).getDate();
          if (d < 32) daily[d] += t.amount;
        });
      const cum: number[] = [0];
      for (let i = 1; i <= 31; i++) cum.push(cum[i - 1] + daily[i]);
      return cum;
    });

    const mean = Array(daysInMonth + 1).fill(0);
    const stddev = Array(daysInMonth + 1).fill(0);
    for (let d = 1; d <= daysInMonth; d++) {
      const vals = cumByMonth.map((c) => c[d] ?? c[c.length - 1]);
      const m = vals.reduce((s, v) => s + v, 0) / vals.length;
      mean[d] = m;
      const variance = vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length;
      stddev[d] = Math.sqrt(variance);
    }

    const projected = [...cumActual];
    if (isCurrent && todayDay < daysInMonth) {
      const perDay = mean[daysInMonth] / daysInMonth;
      for (let d = todayDay + 1; d <= daysInMonth; d++) {
        projected[d] = projected[d - 1] + perDay;
      }
    }

    const totalBudget = Object.values(budgets).reduce<number>(
      (s, v) => s + (parseFloat(String(v)) || 0),
      0
    );

    return {
      cumActual, projected, mean, stddev, daysInMonth, todayDay,
      isCurrentMonth: isCurrent, pastCount: pastMonths.length, totalBudget,
      noHistory: false,
    };
  }, [transactions, budgets, selectedMonth]);

  if (!forecast) {
    return (
      <div className="empty-state">
        <p>Pick a specific month to see the forecast.</p>
      </div>
    );
  }
  if (forecast.noHistory) {
    return (
      <div className="empty-state">
        <p>Forecasts appear after you have history from prior months.</p>
      </div>
    );
  }
  const f = forecast as ForecastData;

  const W = 720, H = 260, P = { top: 20, right: 20, bottom: 30, left: 50 };
  const innerW = W - P.left - P.right, innerH = H - P.top - P.bottom;
  const maxY = Math.max(
    f.mean[f.daysInMonth] + f.stddev[f.daysInMonth] * 1.5,
    f.projected[f.daysInMonth],
    f.totalBudget || 0
  ) * 1.05;
  const x = (d: number) => P.left + (d / f.daysInMonth) * innerW;
  const y = (v: number) => P.top + innerH - (v / maxY) * innerH;

  const bandHi: string[] = [], bandLo: string[] = [];
  for (let d = 0; d <= f.daysInMonth; d++) {
    bandHi.push(`${x(d)},${y(f.mean[d] + f.stddev[d])}`);
    bandLo.push(`${x(d)},${y(Math.max(0, f.mean[d] - f.stddev[d]))}`);
  }
  const bandPath = "M" + bandHi.join(" L") + " L" + bandLo.reverse().join(" L") + " Z";

  const meanPath = f.mean
    .map((v, d) => (d === 0 ? "M" : "L") + x(d) + "," + y(v))
    .join(" ");
  const actualPath = f.cumActual
    .slice(0, f.todayDay + 1)
    .map((v, d) => (d === 0 ? "M" : "L") + x(d) + "," + y(v))
    .join(" ");
  const projPath =
    f.isCurrentMonth && f.todayDay < f.daysInMonth
      ? f.projected
          .slice(f.todayDay)
          .map((v, i) => (i === 0 ? "M" : "L") + x(f.todayDay + i) + "," + y(v))
          .join(" ")
      : null;

  const yTicks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];
  const endActual = f.cumActual[f.todayDay];
  const endProj = f.projected[f.daysInMonth];
  const endMean = f.mean[f.daysInMonth];
  const pctVsMean = endMean > 0 ? ((endProj - endMean) / endMean) * 100 : 0;

  return (
    <div>
      <div className="forecast-callouts">
        <div>
          <div className="forecast-callout-label mono">so far</div>
          <div className="forecast-callout-val num">{fmtMoney(endActual)}</div>
        </div>
        <div>
          <div className="forecast-callout-label mono">projected end-of-month</div>
          <div className="forecast-callout-val num">{fmtMoney(endProj)}</div>
        </div>
        <div>
          <div className="forecast-callout-label mono">historical avg</div>
          <div className="forecast-callout-val num">{fmtMoney(endMean)}</div>
        </div>
        <div>
          <div className="forecast-callout-label mono">vs typical</div>
          <div className={"forecast-callout-val num " + (pctVsMean > 8 ? "bad" : pctVsMean < -8 ? "good" : "")}>
            {pctVsMean >= 0 ? "+" : ""}{Math.round(pctVsMean)}%
          </div>
        </div>
      </div>

      <div className="forecast-chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="forecast-stripe" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--accent-soft, #e8d5b7)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent, #6b4423)" strokeOpacity="0.15" strokeWidth="1.5" />
            </pattern>
          </defs>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={P.left} x2={W - P.right} y1={y(v)} y2={y(v)}
                stroke="var(--rule)" strokeDasharray={i === 0 ? "0" : "2,3"} />
              <text x={P.left - 8} y={y(v) + 4} textAnchor="end"
                fontSize="10" fill="var(--ink-muted)" fontFamily="JetBrains Mono, monospace">
                {fmtShort(v)}
              </text>
            </g>
          ))}
          {[1, 5, 10, 15, 20, 25, f.daysInMonth].map((d) => (
            <g key={d}>
              <line x1={x(d)} x2={x(d)} y1={y(0)} y2={y(0) + 4} stroke="var(--ink-muted)" />
              <text x={x(d)} y={y(0) + 16} textAnchor="middle"
                fontSize="10" fill="var(--ink-muted)" fontFamily="JetBrains Mono, monospace">
                {d}
              </text>
            </g>
          ))}
          <path d={bandPath} fill="url(#forecast-stripe)" opacity="0.9" />
          <path d={meanPath} fill="none" stroke="var(--accent, #6b4423)"
            strokeWidth="1.5" strokeDasharray="4,3" opacity="0.65" />
          {f.totalBudget > 0 && (
            <g>
              <line x1={P.left} x2={W - P.right}
                y1={y(f.totalBudget)} y2={y(f.totalBudget)}
                stroke="var(--bad)" strokeWidth="1" strokeDasharray="2,3" opacity="0.6" />
              <text x={W - P.right - 2} y={y(f.totalBudget) - 4} textAnchor="end"
                fontSize="10" fill="var(--bad)" fontFamily="JetBrains Mono, monospace">
                budget {fmtShort(f.totalBudget)}
              </text>
            </g>
          )}
          <path d={actualPath} fill="none" stroke="var(--ink)" strokeWidth="2.5" />
          {projPath && (
            <path d={projPath} fill="none" stroke="var(--ink)" strokeWidth="2"
              strokeDasharray="5,4" opacity="0.7" />
          )}
          {f.isCurrentMonth && f.todayDay > 0 && (
            <g>
              <line x1={x(f.todayDay)} x2={x(f.todayDay)}
                y1={P.top} y2={y(0)}
                stroke="var(--ink)" strokeDasharray="1,3" opacity="0.4" />
              <circle cx={x(f.todayDay)} cy={y(endActual)} r="4" fill="var(--ink)" />
            </g>
          )}
        </svg>
      </div>
      <div className="forecast-legend mono">
        <span className="legend-dot" style={{ background: "var(--ink)" }} /> actual
        <span className="legend-dot dashed" style={{ borderColor: "var(--ink)" }} /> projection
        <span className="legend-dot" style={{ background: "var(--accent, #6b4423)" }} />
        typical range (±1σ across {f.pastCount} prior months)
      </div>
    </div>
  );
}
