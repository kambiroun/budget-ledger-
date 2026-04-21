"use client";
import React from "react";
import { fmtMoney, fmtDate } from "@/lib/budget";

export function DashHeatmap({
  transactions, month,
}: { transactions: any[]; month: string }) {
  const data = React.useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.category && !t.isIncome && !t.isDupe)
      .forEach((t) => {
        const k = fmtDate(t.date);
        map[k] = (map[k] || 0) + t.amount;
      });
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const days: { date: Date; key: string; amount: number }[] = [];
    const cur = new Date(start);
    let max = 0;
    while (cur <= end) {
      const k = fmtDate(cur);
      const v = map[k] || 0;
      if (v > max) max = v;
      days.push({ date: new Date(cur), key: k, amount: v });
      cur.setDate(cur.getDate() + 1);
    }
    return { days, max, start, end };
  }, [transactions, month]);

  if (!data.days.length) {
    return <div className="empty-state"><p>No daily data yet.</p></div>;
  }
  const { days, max } = data;
  const startOffset = days[0].date.getDay();
  const cells: Array<typeof days[number] | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  days.forEach((d) => cells.push(d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<typeof days[number] | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const intensity = (v: number) => {
    if (v <= 0) return 0.03;
    return 0.15 + (v / max) * 0.75;
  };

  return (
    <div className="chart-card">
      <h3>Daily rhythm</h3>
      <p style={{ color: "var(--ink-muted)", fontSize: 13, marginTop: -6, marginBottom: 14 }}>
        One square per day. Darker = more spent.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 22 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="mono" style={{
              height: 18, fontSize: 9, color: "var(--ink-faint)",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>{d}</div>
          ))}
        </div>
        <div style={{ flex: 1, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 2 }}>
            {weeks.map((w, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div className="mono" style={{ height: 20, fontSize: 9, color: "var(--ink-faint)" }} />
                {w.map((c, ci) => (
                  <div
                    key={ci}
                    title={c ? `${c.key} · ${fmtMoney(c.amount)}` : ""}
                    style={{
                      width: 18, height: 18,
                      background: c ? `rgba(107, 68, 35, ${intensity(c.amount)})` : "transparent",
                      border: "1px solid var(--rule-soft)",
                      cursor: c ? "help" : "default",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{
        marginTop: 14, display: "flex", alignItems: "center", gap: 8,
        fontSize: 11, fontFamily: "JetBrains Mono, monospace",
        color: "var(--ink-muted)", letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        <span>Less</span>
        {[0.1, 0.3, 0.5, 0.7, 0.9].map((i) => (
          <div key={i} style={{
            width: 14, height: 14,
            background: `rgba(107, 68, 35, ${i})`,
            border: "1px solid var(--rule-soft)",
          }} />
        ))}
        <span>More · max {fmtMoney(max)}</span>
      </div>
    </div>
  );
}
