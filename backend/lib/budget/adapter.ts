/**
 * Adapter — convert Supabase row shape into the legacy Transaction shape
 * used by the budget helpers (forecastCategory, detectAnomalies, etc.).
 *
 * Supabase columns:                Legacy field:
 *   date (ISO string)        →     date (Date)
 *   category_id (uuid|null)  →     category (string|null)   ← category NAME
 *   is_income (bool)         →     isIncome
 *   is_transfer/is_refund    →     (folded into "transfer/refund" via a Map later)
 *   is_dupe (bool)           →     isDupe
 *   split_of (uuid|null)     →     isSplit (bool)
 */

import type { Transaction } from "@/lib/budget";

/** Re-export the legacy txn shape so other files can import `LegacyTxn`. */
export type LegacyTxn = Transaction;

export type SupaTxn = {
  id: string;
  date: string;                     // "YYYY-MM-DD"
  description: string;
  amount: number | string;
  category_id: string | null;
  is_income: boolean;
  is_transfer?: boolean;
  is_refund?: boolean;
  is_dupe?: boolean;
  split_of?: string | null;
  source?: string;
  ai_confidence?: number | null;
};

export type SupaCat = {
  id: string;
  name: string;
  color: string | null;
  is_income?: boolean;
};

export type SupaBudget = {
  category_id: string;
  amount: number | string;
  month: string;                    // "YYYY-MM-01"
};

/** Build a name-keyed budget map for the given month. */
export function budgetMapForMonth(
  budgets: SupaBudget[],
  cats: SupaCat[],
  mk: string                         // "YYYY-MM"
): Record<string, string | number> {
  const idToName: Record<string, string> = {};
  cats.forEach((c) => (idToName[c.id] = c.name));
  const out: Record<string, string | number> = {};
  budgets.forEach((b) => {
    if (!b.month.startsWith(mk)) return;
    const name = idToName[b.category_id];
    if (name) out[name] = Number(b.amount);
  });
  return out;
}

/** Convert Supabase transactions → legacy Transaction[]. */
export function toLegacyTxns(
  txns: SupaTxn[],
  cats: SupaCat[]
): Transaction[] {
  const idToName: Record<string, string> = {};
  cats.forEach((c) => (idToName[c.id] = c.name));
  return txns.map((t) => ({
    id: t.id,
    date: new Date(t.date + "T00:00:00"),
    description: t.description,
    amount: Number(t.amount),
    category: t.category_id ? idToName[t.category_id] ?? null : null,
    isIncome: !!t.is_income,
    isDupe: !!t.is_dupe,
    isSplit: !!t.split_of,
    source: t.source,
    autoSource: t.ai_confidence != null ? "ai" : null,
  }));
}

/** Convert Supabase categories → name list. */
export function catNames(cats: SupaCat[]): string[] {
  return cats.filter((c) => !c.is_income).map((c) => c.name);
}
