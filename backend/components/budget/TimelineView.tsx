"use client";
import React from "react";
import { fmtMoney, fmtDate, monthKey } from "@/lib/budget";

export function TimelineView({
  transactions, categories, selectedMonth,
}: {
  transactions: any[];
  categories: any[];
  selectedMonth: string;
}) {
  const data = React.useMemo(() => {
    if (!selectedMonth || selectedMonth === "all") return null;
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const txns = transactions.filter(
      (t: any) => !t.isDupe && monthKey(t.date) === selectedMonth
    );
    const days: any[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(year, month - 1, d);
      const dayTxns = txns.filter((t: any) => new Date(t.date).getDate() === d);
      const dow = ["S", "M", "T", "W", "T", "F", "S"][dayDate.getDay()];
      days.push({
        day: d, date: dayDate, dow,
        isWeekend: dayDate.getDay() === 0 || dayDate.getDay() === 6,
        spend: dayTxns.filter((t: any) => !t.isIncome && t.category)
          .reduce((s: number, t: any) => s + t.amount, 0),
        income: dayTxns.filter((t: any) => t.isIncome)
          .reduce((s: number, t: any) => s + t.amount, 0),
        events: dayTxns
          .filter((t: any) => t.amount > 50 || t.isIncome)
          .sort((a: any, b: any) => b.amount - a.amount),
      });
    }
    const maxSpend = Math.max(...days.map((d) => d.spend), 1);
    return { days, maxSpend, daysInMonth };
  }, [transactions, selectedMonth]);

  const colorFor = (name: string) =>
    categories.find((c: any) => c.name === name)?.color ?? "var(--ink-muted)";

  if (!data) {
    return <div className="empty-state"><p>Pick a specific month to see the timeline.</p></div>;
  }

  return (
    <div className="timeline">
      <div className="timeline-head mono">
        <span>the story of this month</span>
        <span style={{ marginLeft: "auto", color: "var(--ink-muted)" }}>
          {data.daysInMonth} days ·{" "}
          {data.days.reduce((s: number, d: any) => s + d.events.length, 0)} notable events
        </span>
      </div>
      <div className="timeline-track">
        <div className="timeline-baseline" />
        {data.days.map((d: any) => (
          <div key={d.day}
            className={"timeline-day" + (d.isWeekend ? " weekend" : "")}
            title={`${fmtDate(d.date)} · ${fmtMoney(d.spend)}`}>
            <div className="timeline-bar" style={{ height: (d.spend / data.maxSpend) * 60 + "px" }} />
            {d.events.slice(0, 2).map((e: any, i: number) => (
              <div key={i} className={"timeline-event" + (e.isIncome ? " income" : "")}
                style={{
                  bottom: (d.spend / data.maxSpend) * 60 + 8 + i * 14 + "px",
                  borderColor: e.isIncome
                    ? "var(--good)"
                    : e.category ? colorFor(e.category) : "var(--ink-muted)",
                  color: e.isIncome
                    ? "var(--good)"
                    : e.category ? colorFor(e.category) : "var(--ink)",
                }}>
                <span className="timeline-event-amt num">
                  {e.isIncome ? "+" : ""}{fmtMoney(e.amount)}
                </span>
                <span className="timeline-event-desc">
                  {e.description.length > 18 ? e.description.slice(0, 18) + "…" : e.description}
                </span>
              </div>
            ))}
            <div className="timeline-dow mono">{d.dow}</div>
            <div className="timeline-daynum mono">{d.day}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
