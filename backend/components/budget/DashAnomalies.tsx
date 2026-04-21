"use client";
import React from "react";
import { detectAnomalies } from "@/lib/budget";

export function DashAnomalies({
  transactions, categories, month,
}: { transactions: any[]; categories: string[]; month: string }) {
  const anomalies = React.useMemo(
    () => detectAnomalies(transactions, categories, month),
    [transactions, categories, month]
  );
  if (anomalies.length === 0) return null;
  return (
    <div className="anomaly-strip">
      <span className="mono" style={{
        fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
        color: "var(--warn)", marginRight: 10,
      }}>Flags</span>
      {anomalies.slice(0, 3).map((a: any, i: number) => (
        <span key={i} className="anomaly-chip">{a.text}</span>
      ))}
    </div>
  );
}
