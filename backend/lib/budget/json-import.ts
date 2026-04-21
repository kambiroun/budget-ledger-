/**
 * One-time migration from the legacy standalone HTML to the DB-backed app.
 *
 * The old app's "Export JSON" button dumps:
 *   {
 *     categories:   [{ name, color?, budget? }, ...],
 *     budgets:      { [categoryName]: number, ... },
 *     transactions: [{ id, date, description, amount, category?, is_income?, source?, ... }, ...],
 *     merchantMap:  { [keyOrName]: categoryName, ... },      // optional
 *     rules:        [{ pattern, category, priority?, enabled?, ... }, ...], // optional
 *     goals:        [{ name, target, saved?, target_date?, ... }, ...],     // optional
 *   }
 *
 * This importer is permissive: missing keys are skipped, unknown keys are ignored,
 * name-based references get resolved to the newly created category IDs.
 *
 * Dedup policy:
 *  - Categories: match by `name` against existing rows — existing wins (no update).
 *  - Budgets: upserted via the bulk PUT — (user_id, category_id) unique key.
 *  - Transactions: sha-like hash of (date|amount|description). Skip if already seen
 *    in this run. We rely on the server's own constraints/caller discipline for
 *    cross-session duplicates (re-importing the same JSON twice will create dupes;
 *    that's the user's call).
 */

import {
  createCategory,
  upsertBudgets,
  createTransaction,
  createRule,
  createGoal,
} from "@/lib/db/client";

// Loosely-typed — the legacy schema isn't enforced.
type AnyObj = Record<string, any>;

export interface LegacyDump {
  categories?: AnyObj[];
  budgets?: Record<string, number> | AnyObj[];
  transactions?: AnyObj[];
  merchantMap?: Record<string, string>;
  rules?: AnyObj[];
  goals?: AnyObj[];
}

export interface ImportResult {
  catsCreated: number;
  catsReused: number;
  budgetsUpserted: number;
  txnsCreated: number;
  txnsSkipped: number;
  rulesCreated: number;
  goalsCreated: number;
  warnings: string[];
}

export interface ExistingRefs {
  /** Existing category rows from the server, so we can match by name. */
  categories: { id: string; name: string }[];
}

/** Parse a JSON file the user uploaded. Rejects with a friendly message on bad input. */
export async function readLegacyJSON(file: File): Promise<LegacyDump> {
  const text = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON must be an object (categories/budgets/transactions/...)");
  }
  return parsed as LegacyDump;
}

/** Import everything in the dump. Call `refreshAll()` after to pull fresh from DB. */
export async function importLegacyDump(
  dump: LegacyDump,
  existing: ExistingRefs,
  onProgress?: (msg: string) => void,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const log = (m: string) => onProgress?.(m);

  // ---- Categories ----
  const nameToId = new Map<string, string>();
  for (const c of existing.categories) nameToId.set(c.name.toLowerCase(), c.id);

  const incomingCats = Array.isArray(dump.categories) ? dump.categories : [];
  let catsCreated = 0;
  let catsReused = 0;
  for (let i = 0; i < incomingCats.length; i++) {
    const c = incomingCats[i];
    const name = (c?.name ?? "").toString().trim();
    if (!name) continue;
    const existingId = nameToId.get(name.toLowerCase());
    if (existingId) { catsReused++; continue; }
    log(`Creating category ${i + 1}/${incomingCats.length}: ${name}`);
    try {
      const created = await createCategory({
        name,
        color: c.color ?? null,
        is_income: !!c.is_income,
        sort_order: i,
      });
      nameToId.set(name.toLowerCase(), created.id);
      catsCreated++;
    } catch (e: any) {
      warnings.push(`category "${name}": ${e?.message || "create failed"}`);
    }
  }

  // ---- Budgets ----
  // Accept either legacy shape: { [categoryName]: number } OR [{ category, amount }].
  const budgetEntries: { category_id: string; amount: number }[] = [];
  if (dump.budgets && !Array.isArray(dump.budgets)) {
    for (const [name, amt] of Object.entries(dump.budgets)) {
      const id = nameToId.get(name.toLowerCase());
      const n = Number(amt);
      if (id && !Number.isNaN(n) && n > 0) budgetEntries.push({ category_id: id, amount: n });
    }
  } else if (Array.isArray(dump.budgets)) {
    for (const b of dump.budgets) {
      const n = Number(b?.amount);
      const id =
        b?.category_id ??
        (b?.category ? nameToId.get(String(b.category).toLowerCase()) : undefined);
      if (id && !Number.isNaN(n) && n > 0) budgetEntries.push({ category_id: id, amount: n });
    }
  }
  let budgetsUpserted = 0;
  if (budgetEntries.length) {
    log(`Upserting ${budgetEntries.length} budgets…`);
    try {
      await upsertBudgets(budgetEntries);
      budgetsUpserted = budgetEntries.length;
    } catch (e: any) {
      warnings.push(`budgets: ${e?.message || "upsert failed"}`);
    }
  }

  // ---- Transactions ----
  const seen = new Set<string>();
  const txnList = Array.isArray(dump.transactions) ? dump.transactions : [];
  let txnsCreated = 0;
  let txnsSkipped = 0;
  const BATCH = 10;
  for (let i = 0; i < txnList.length; i += BATCH) {
    const slice = txnList.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (t) => {
        const date = normalizeDate(t?.date);
        const description = (t?.description ?? t?.merchant ?? "").toString().trim();
        const amount = Number(t?.amount);
        if (!date || !description || Number.isNaN(amount)) {
          txnsSkipped++;
          return;
        }
        const key = `${date}|${amount.toFixed(2)}|${description.toLowerCase()}`;
        if (seen.has(key)) { txnsSkipped++; return; }
        seen.add(key);
        const category_id = t?.category
          ? nameToId.get(String(t.category).toLowerCase()) ?? null
          : null;
        try {
          await createTransaction({
            date,
            description,
            amount,
            category_id,
            is_income: !!t?.is_income || amount > 0,
            source: t?.source ?? "json_import",
            source_file: t?.source_file ?? null,
          });
          txnsCreated++;
        } catch (e: any) {
          txnsSkipped++;
          warnings.push(`txn "${description}": ${e?.message || "create failed"}`);
        }
      }),
    );
    log(`Imported ${Math.min(i + BATCH, txnList.length)} / ${txnList.length} transactions…`);
  }

  // ---- Rules ----
  let rulesCreated = 0;
  const rulesList = Array.isArray(dump.rules) ? dump.rules : [];
  for (const r of rulesList) {
    const pattern = (r?.pattern ?? "").toString().trim();
    const catName = (r?.category ?? "").toString().trim();
    if (!pattern || !catName) continue;
    const category_id = nameToId.get(catName.toLowerCase());
    if (!category_id) { warnings.push(`rule "${pattern}" → unknown category "${catName}"`); continue; }
    try {
      await createRule({
        pattern,
        category_id,
        priority: Number(r?.priority) || 0,
        enabled: r?.enabled !== false,
      });
      rulesCreated++;
    } catch (e: any) {
      warnings.push(`rule "${pattern}": ${e?.message || "create failed"}`);
    }
  }

  // ---- Goals ----
  let goalsCreated = 0;
  const goalsList = Array.isArray(dump.goals) ? dump.goals : [];
  for (const g of goalsList) {
    const name = (g?.name ?? "").toString().trim();
    const target = Number(g?.target);
    if (!name || Number.isNaN(target) || target <= 0) continue;
    try {
      await createGoal({
        name,
        target,
        saved: Number(g?.saved) || 0,
        target_date: g?.target_date ?? null,
      });
      goalsCreated++;
    } catch (e: any) {
      warnings.push(`goal "${name}": ${e?.message || "create failed"}`);
    }
  }

  return {
    catsCreated, catsReused,
    budgetsUpserted,
    txnsCreated, txnsSkipped,
    rulesCreated, goalsCreated,
    warnings,
  };
}

/** Accept "YYYY-MM-DD", Date-ish strings, and ISO timestamps. Returns "YYYY-MM-DD" or null. */
function normalizeDate(d: any): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
  }
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return null;
}
