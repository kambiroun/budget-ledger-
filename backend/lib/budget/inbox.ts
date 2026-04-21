// Smart inbox — direct port from src/lib.js
import { Transaction, Rule, MerchantMap, InboxItem } from "./types";
import { monthKey, fmtMoney } from "./format";
import {
  normalizeMerchant,
  detectAnomalies,
  detectRecurring,
  forecastCategory,
} from "./txn";

export function computeInbox(
  transactions: Transaction[],
  categories: string[],
  budgets: Record<string, string | number>,
  _rules: Rule[],
  _merchantMap: MerchantMap,
  selectedMonth: string
): InboxItem[] {
  const items: InboxItem[] = [];
  const curMK = selectedMonth === "all" ? monthKey(new Date()) : selectedMonth;

  const uncatM = transactions.filter(
    (t) => !t.category && !t.isIncome && !t.isDupe && monthKey(t.date) === curMK
  );
  if (uncatM.length > 0) {
    items.push({
      id: "uncat",
      priority: 1,
      icon: "tag",
      title: uncatM.length + " uncategorized transaction" + (uncatM.length === 1 ? "" : "s"),
      sub: "Tap to open the ledger filtered to them.",
      action: { type: "goto", tab: "ledger", filter: "uncategorized" },
    });
  }

  const anomalies = detectAnomalies(transactions, categories, curMK);
  anomalies.slice(0, 3).forEach((a) =>
    items.push({
      id: "anom-" + (a.category || a.txn?.description || Math.random()),
      priority: 2,
      icon: "alert",
      title: a.text,
      sub: a.type === "category_high" ? "Review in dashboard" : "Review in ledger",
      action:
        a.type === "category_high"
          ? { type: "focus-cat", cat: a.category }
          : { type: "focus-txn", txn: a.txn },
    })
  );

  const subsByMerchant: Record<string, Transaction[]> = {};
  transactions
    .filter((t) => !t.isIncome && !t.isDupe)
    .forEach((t) => {
      const m = normalizeMerchant(t.description);
      if (!subsByMerchant[m]) subsByMerchant[m] = [];
      subsByMerchant[m].push(t);
    });
  Object.entries(subsByMerchant).forEach(([m, txns]) => {
    if (txns.length < 3) return;
    const months = new Set(txns.map((t) => monthKey(t.date)));
    if (months.size < 3) return;
    const sorted = [...txns].sort((a, b) => a.date.getTime() - b.date.getTime());
    const prev = sorted.slice(0, -1);
    const last = sorted[sorted.length - 1];
    const prevAvg = prev.reduce((s, t) => s + t.amount, 0) / prev.length;
    if (prevAvg > 3 && last.amount > prevAvg * 1.15 && Math.abs(last.amount - prevAvg) > 1.5) {
      items.push({
        id: "price-" + m,
        priority: 3,
        icon: "trending-up",
        title: m + " went up",
        sub:
          fmtMoney(prevAvg) +
          " → " +
          fmtMoney(last.amount) +
          " (was stable for " +
          prev.length +
          " months)",
        action: { type: "focus-txn", txn: last },
      });
    }
  });

  if (selectedMonth !== "all") {
    categories.forEach((c) => {
      const b = parseFloat(String(budgets[c])) || 0;
      if (b <= 0) return;
      const fc = forecastCategory(transactions, curMK, c);
      if (fc.projected > b * 1.1 && fc.daysElapsed >= 5) {
        const overBy = fc.projected - b;
        items.push({
          id: "forecast-" + c,
          priority: 3,
          icon: "compass",
          title: c + " on pace for " + fmtMoney(fc.projected),
          sub: "Budget is " + fmtMoney(b) + " — projected " + fmtMoney(overBy) + " over",
          action: { type: "focus-cat", cat: c },
        });
      }
    });
  }

  const dupes = transactions.filter((t) => t.isDupe);
  if (dupes.length > 0) {
    items.push({
      id: "dupes",
      priority: 4,
      icon: "copy",
      title: dupes.length + " possible duplicate" + (dupes.length === 1 ? "" : "s"),
      sub: "Flagged during import — confirm or delete.",
      action: { type: "goto", tab: "ledger", filter: "dupes" },
    });
  }

  const recurring = detectRecurring(transactions);
  const uncatRecurring = recurring.filter((r) => !r.lastCategory);
  if (uncatRecurring.length > 0) {
    items.push({
      id: "recur-uncat",
      priority: 4,
      icon: "repeat",
      title:
        uncatRecurring.length +
        " recurring charge" +
        (uncatRecurring.length === 1 ? "" : "s") +
        " need categories",
      sub:
        uncatRecurring
          .slice(0, 2)
          .map((r) => r.merchant)
          .join(", ") + (uncatRecurring.length > 2 ? "…" : ""),
      action: { type: "goto", tab: "ledger", filter: "uncategorized" },
    });
  }

  return items.sort((a, b) => a.priority - b.priority);
}
