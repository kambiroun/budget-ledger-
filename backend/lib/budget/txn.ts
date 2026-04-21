// Transaction utilities — direct port from src/lib.js
import { Transaction, MerchantMap, Rule } from "./types";
import { fmtDate, toCents, monthKey, fmtMoney } from "./format";

export function normalizeMerchant(desc: string): string {
  let s = String(desc || "").trim().toUpperCase();
  s = s.replace(/\s+\d{3,}$/, "");
  s = s.replace(/\s{2,}.*$/, "");
  s = s.replace(/\s+#\s*\d+/g, "");
  s = s.replace(/\s+\d{2}\/\d{2}.*$/, "");
  s = s.replace(/[*]+\d+/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 32);
}

export function txnKey(t: Transaction): string {
  return fmtDate(t.date) + "|" + t.description.toLowerCase().trim() + "|" + toCents(t.amount);
}

export function dedupeAndMerge(existing: Transaction[], incoming: Transaction[]) {
  const existingKeys: Record<string, number[]> = {};
  existing.forEach((t, idx) => {
    const k = txnKey(t);
    if (!existingKeys[k]) existingKeys[k] = [];
    existingKeys[k].push(idx);
  });
  const newTxns: Transaction[] = [];
  const dupes: { txn: Transaction; afterIndex: number }[] = [];
  let dupeCount = 0;
  incoming.forEach((t) => {
    const k = txnKey(t);
    if (existingKeys[k] && existingKeys[k].length > 0) {
      dupeCount++;
      dupes.push({
        txn: { ...t, category: null, isDupe: true },
        afterIndex: existingKeys[k][existingKeys[k].length - 1],
      });
    } else {
      newTxns.push(t);
      if (!existingKeys[k]) existingKeys[k] = [];
      existingKeys[k].push(existing.length + newTxns.length - 1);
    }
  });
  return { newTxns, dupes, dupeCount };
}

export function detectRecurring(transactions: Transaction[]) {
  const byMerchant: Record<string, Transaction[]> = {};
  transactions.forEach((t) => {
    if (t.isIncome || t.isDupe) return;
    const m = normalizeMerchant(t.description);
    if (!m) return;
    if (!byMerchant[m]) byMerchant[m] = [];
    byMerchant[m].push(t);
  });
  const recurring: any[] = [];
  Object.entries(byMerchant).forEach(([m, txns]) => {
    if (txns.length < 2) return;
    const months = new Set(txns.map((t) => t.date.getFullYear() + "-" + t.date.getMonth()));
    if (months.size < 2) return;
    const avg = txns.reduce((s, t) => s + t.amount, 0) / txns.length;
    const withinRange = txns.every((t) => avg === 0 || Math.abs(t.amount - avg) / avg < 0.15);
    if (!withinRange) return;
    recurring.push({
      merchant: m, avg, count: txns.length, months: months.size,
      lastCategory: txns[txns.length - 1].category,
      lastDate: txns[txns.length - 1].date,
    });
  });
  return recurring.sort((a, b) => b.avg - a.avg);
}

export function applyLearnedCategories(
  transactions: Transaction[],
  merchantMap: MerchantMap,
  rules: Rule[]
): Transaction[] {
  return transactions.map((t) => {
    if (t.category || t.isIncome || t.isDupe) return t;
    for (const rule of rules) {
      if (!rule.pattern || !rule.category) continue;
      const pat = rule.pattern.toLowerCase().trim();
      if (t.description.toLowerCase().includes(pat)) {
        return { ...t, category: rule.category, autoSource: "rule" };
      }
    }
    const m = normalizeMerchant(t.description);
    if (merchantMap[m]) return { ...t, category: merchantMap[m], autoSource: "memory" };
    return t;
  });
}

export function learnFromCategorization(
  merchantMap: MerchantMap,
  description: string,
  category: string
): MerchantMap {
  const m = normalizeMerchant(description);
  if (!m || !category) return merchantMap;
  return { ...merchantMap, [m]: category };
}

export function detectTransfersAndRefunds(
  transactions: Transaction[]
): Map<number, { type: "transfer" | "refund"; pairIdx: number }> {
  const flags = new Map<number, { type: "transfer" | "refund"; pairIdx: number }>();
  const used = new Set<number>();
  for (let i = 0; i < transactions.length; i++) {
    if (used.has(i)) continue;
    const a = transactions[i];
    if (a.isDupe) continue;
    for (let j = i + 1; j < transactions.length; j++) {
      if (used.has(j)) continue;
      const b = transactions[j];
      if (b.isDupe) continue;
      const daysDiff = Math.abs(a.date.getTime() - b.date.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 5) continue;
      if (Math.abs(a.amount - b.amount) > 0.01) continue;
      const txtA = (a.description || "").toLowerCase();
      const txtB = (b.description || "").toLowerCase();
      const transferWord = /transfer|xfer|online banking|zelle|venmo|paypal/;
      const isTransferLike = transferWord.test(txtA) || transferWord.test(txtB);
      if (a.isIncome !== b.isIncome && isTransferLike) {
        flags.set(i, { type: "transfer", pairIdx: j });
        flags.set(j, { type: "transfer", pairIdx: i });
        used.add(i); used.add(j);
        break;
      }
      if (
        a.isIncome !== b.isIncome &&
        a.description.slice(0, 10).toLowerCase() === b.description.slice(0, 10).toLowerCase()
      ) {
        flags.set(i, { type: "refund", pairIdx: j });
        flags.set(j, { type: "refund", pairIdx: i });
        used.add(i); used.add(j);
        break;
      }
    }
  }
  return flags;
}

export function splitTransaction(
  transaction: Transaction,
  parts: { amount: number | string; category?: string }[]
): Transaction[] | null {
  const total = parts.reduce((s, p) => s + (parseFloat(String(p.amount)) || 0), 0);
  if (Math.abs(total - transaction.amount) > 0.01) return null;
  return parts.map((p, i) => ({
    ...transaction,
    amount: parseFloat(String(p.amount)),
    category: p.category || null,
    description: transaction.description + " [split " + (i + 1) + "/" + parts.length + "]",
    splitFrom: transaction.description,
    isSplit: true,
  }));
}

export function computeEnvelopes(
  transactions: Transaction[],
  categories: string[],
  budgets: Record<string, string | number>,
  rollovers: { enabled?: boolean; startMonth?: string } | null | undefined,
  mk: string | null
): Record<string, any> | null {
  if (!rollovers?.enabled || !mk) return null;
  const allMonths = new Set<string>();
  transactions.forEach((t) => allMonths.add(monthKey(t.date)));
  const start = rollovers.startMonth || Array.from(allMonths).sort()[0];
  if (!start || mk < start) return null;
  const months: string[] = [];
  let [y, m] = start.split("-").map(Number);
  while (true) {
    const cur = y + "-" + String(m).padStart(2, "0");
    months.push(cur);
    if (cur === mk) break;
    m++;
    if (m > 12) { m = 1; y++; }
    if (months.length > 120) break;
  }
  const balances: Record<string, any> = {};
  categories.forEach((c) => (balances[c] = 0));
  months.forEach((cur) => {
    categories.forEach((c) => {
      const base = parseFloat(String(budgets[c])) || 0;
      const spent = transactions
        .filter((t) => !t.isIncome && !t.isDupe && t.category === c && monthKey(t.date) === cur)
        .reduce((s, t) => s + t.amount, 0);
      const available = (typeof balances[c] === "number" ? balances[c] : 0) + base;
      const leftover = available - spent;
      if (cur === mk) {
        balances[c] = { available, rolledIn: typeof balances[c] === "number" ? balances[c] : 0, spent, baseBudget: base, leftover };
      } else {
        balances[c] = leftover;
      }
    });
  });
  return balances;
}

export function forecastCategory(
  transactions: Transaction[],
  mk: string,
  category: string
) {
  const [y, m] = mk.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = new Date();
  const curMK = monthKey(today);
  const daysElapsed = curMK === mk ? today.getDate() : daysInMonth;
  const spent = transactions
    .filter((t) => !t.isIncome && !t.isDupe && t.category === category && monthKey(t.date) === mk)
    .reduce((s, t) => s + t.amount, 0);
  const paceDaily = daysElapsed > 0 ? spent / daysElapsed : 0;
  const projected = paceDaily * daysInMonth;
  return { projected, paceDaily, daysElapsed, daysInMonth, spent };
}

export function detectAnomalies(
  transactions: Transaction[],
  categories: string[],
  mk: string
) {
  const anomalies: any[] = [];
  const curTxns = transactions.filter((t) => !t.isIncome && !t.isDupe && monthKey(t.date) === mk);
  const prevTxns = transactions.filter((t) => !t.isIncome && !t.isDupe && monthKey(t.date) < mk);
  if (prevTxns.length < 5) return [];
  const prevMonths = new Set(prevTxns.map((t) => monthKey(t.date))).size || 1;
  categories.forEach((c) => {
    const cur = curTxns.filter((t) => t.category === c).reduce((s, t) => s + t.amount, 0);
    const prevTotal = prevTxns.filter((t) => t.category === c).reduce((s, t) => s + t.amount, 0);
    const avg = prevTotal / prevMonths;
    if (avg > 20 && cur > avg * 1.5) {
      anomalies.push({
        type: "category_high",
        category: c,
        current: cur,
        avg,
        ratio: cur / avg,
        text: c + " is " + (cur / avg).toFixed(1) + "× your usual (" + fmtMoney(cur) + " vs. " + fmtMoney(avg) + "/mo)",
      });
    }
  });
  const amounts = prevTxns.map((t) => t.amount).sort((a, b) => a - b);
  const p90 = amounts[Math.floor(amounts.length * 0.9)] || Infinity;
  curTxns.forEach((t) => {
    if (t.amount > p90 * 1.5 && t.amount > 100) {
      anomalies.push({
        type: "large_charge",
        text: "Unusual charge: " + t.description + " for " + fmtMoney(t.amount) + " (" + (t.amount / p90).toFixed(1) + "× your 90th-pct)",
        txn: t,
      });
    }
  });
  return anomalies.slice(0, 6);
}

export function computeWeeklyDigest(transactions: Transaction[], weeksBack = 0) {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() - weeksBack * 7);
  const startOfWeek = new Date(endOfWeek);
  startOfWeek.setDate(endOfWeek.getDate() - 7);
  const prevEnd = new Date(startOfWeek);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - 7);
  const inRange = (t: Transaction, s: Date, e: Date) =>
    t.date >= s && t.date < e && !t.isDupe;
  const thisWeek = transactions.filter((t) => inRange(t, startOfWeek, endOfWeek));
  const prevWeek = transactions.filter((t) => inRange(t, prevStart, prevEnd));
  const sumBy = (txs: Transaction[], pred: (t: Transaction) => boolean) =>
    txs.filter(pred).reduce((s, t) => s + t.amount, 0);
  const thisSpent = sumBy(thisWeek, (t) => !t.isIncome && !!t.category);
  const prevSpent = sumBy(prevWeek, (t) => !t.isIncome && !!t.category);
  const thisIncome = sumBy(thisWeek, (t) => !!t.isIncome);
  const catDiff: Record<string, { this: number; prev: number }> = {};
  thisWeek.forEach((t) => {
    if (!t.isIncome && t.category) {
      catDiff[t.category] = catDiff[t.category] || { this: 0, prev: 0 };
      catDiff[t.category].this += t.amount;
    }
  });
  prevWeek.forEach((t) => {
    if (!t.isIncome && t.category) {
      catDiff[t.category] = catDiff[t.category] || { this: 0, prev: 0 };
      catDiff[t.category].prev += t.amount;
    }
  });
  return {
    startOfWeek, endOfWeek, prevStart, prevEnd,
    thisWeek, prevWeek, thisSpent, prevSpent, thisIncome,
    delta: thisSpent - prevSpent,
    deltaPct: prevSpent > 0 ? ((thisSpent - prevSpent) / prevSpent) * 100 : 0,
    catDiff,
  };
}

export function suggestBudgetsFromHistory(
  transactions: Transaction[],
  categories: string[]
): Record<string, string> {
  const byCatMonth: Record<string, Record<string, number>> = {};
  transactions
    .filter((t) => !t.isIncome && !t.isDupe && t.category)
    .forEach((t) => {
      const k = monthKey(t.date);
      if (!byCatMonth[t.category!]) byCatMonth[t.category!] = {};
      byCatMonth[t.category!][k] = (byCatMonth[t.category!][k] || 0) + t.amount;
    });
  const suggestions: Record<string, string> = {};
  categories.forEach((c) => {
    const months = Object.values(byCatMonth[c] || {});
    if (months.length === 0) {
      suggestions[c] = "";
      return;
    }
    const avg = months.reduce((s, v) => s + v, 0) / months.length;
    const sorted = [...months].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const suggested = Math.max(avg * 1.1, median * 1.15);
    suggestions[c] = String(Math.ceil(suggested / 10) * 10);
  });
  return suggestions;
}

export function merchantHistory(transactions: Transaction[], description: string) {
  const target = normalizeMerchant(description);
  const matches = transactions.filter((t) => !t.isDupe && normalizeMerchant(t.description) === target);
  if (matches.length === 0) return null;
  const byMonth: Record<string, { total: number; count: number; month: string }> = {};
  matches.forEach((t) => {
    const k = monthKey(t.date);
    if (!byMonth[k]) byMonth[k] = { total: 0, count: 0, month: k };
    byMonth[k].total += t.amount;
    byMonth[k].count++;
  });
  const monthly = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  const total = matches.reduce((s, t) => s + t.amount, 0);
  const avg = total / matches.length;
  const sorted = [...matches].sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    merchant: target,
    transactions: matches,
    monthly, total, count: matches.length, avg,
    first: sorted[0].date,
    last: sorted[sorted.length - 1].date,
    lastAmount: sorted[sorted.length - 1].amount,
  };
}
