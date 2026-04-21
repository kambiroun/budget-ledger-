/**
 * Merchant-level rollup helpers — feed the receipt drawer.
 */
import type { LegacyTxn } from "./adapter";

function keyOf(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[#*]\w+/g, "") // strip ref codes
    .replace(/\b\d{3,}\b/g, "") // strip long numbers
    .trim();
}

export function merchantHistory(
  transactions: LegacyTxn[],
  description: string
): {
  count: number;
  total: number;
  avg: number;
  first: Date;
  last: Date;
  lastAmount: number;
  transactions: LegacyTxn[];
  monthly: { month: string; total: number; count: number }[];
} | null {
  const key = keyOf(description);
  if (!key) return null;
  const hits = transactions.filter(
    (t) => !t.isIncome && !t.isDupe && keyOf(t.description) === key
  );
  if (hits.length === 0) return null;

  const sorted = hits.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
  const total = hits.reduce((s, t) => s + t.amount, 0);

  const byMonth: Record<string, { total: number; count: number }> = {};
  hits.forEach((t) => {
    const mk = t.date.toISOString().slice(0, 7);
    if (!byMonth[mk]) byMonth[mk] = { total: 0, count: 0 };
    byMonth[mk].total += t.amount;
    byMonth[mk].count += 1;
  });

  return {
    count: hits.length,
    total,
    avg: total / hits.length,
    first: sorted[0].date,
    last: sorted[sorted.length - 1].date,
    lastAmount: sorted[sorted.length - 1].amount,
    transactions: hits,
    monthly: Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v })),
  };
}

export function suggestBudgetsFromHistory(
  transactions: LegacyTxn[],
  names: string[]
): Record<string, number> {
  const months = new Set(transactions.map((t) => t.date.toISOString().slice(0, 7)));
  const monthCount = Math.max(1, months.size);
  const byCat: Record<string, number> = {};
  transactions.forEach((t) => {
    if (t.isIncome || t.isDupe || !t.category) return;
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  const out: Record<string, number> = {};
  names.forEach((c) => {
    const avg = (byCat[c] || 0) / monthCount;
    if (avg <= 0) return;
    // round to nearest $10 with ~15% cushion
    out[c] = Math.max(10, Math.round((avg * 1.15) / 10) * 10);
  });
  return out;
}
