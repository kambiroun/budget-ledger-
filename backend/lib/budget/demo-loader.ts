/**
 * Demo data loader — materializes demo transactions AND the default
 * category list into the user's database.
 *
 * We import from the existing legacy generator, then convert:
 *   category NAME  →  category_id (creating the category row if missing)
 *   amount (signed) →  positive amount + is_income flag
 */
"use client";
import { generateDemoData } from "@/lib/budget/demo";
import { DEFAULT_CATEGORIES, CAT_COLORS } from "@/lib/budget";
import {
  createCategory, createTransaction,
} from "@/lib/db/client";

const FALLBACK_PALETTE = [
  "#c8554b", "#d48a3c", "#c9a94a", "#7a9c5c", "#5a8a8a",
  "#6b8ab8", "#8b6fb3", "#b36f8f", "#8a6a4a", "#6a6a6a",
];

export async function loadDemoData(
  existingCategories: any[]
): Promise<{ catsCreated: number; txnsCreated: number }> {
  console.info("[ledger] demo: starting (existing cats:", existingCategories.length, ")");
  // 1) Ensure every category from DEFAULT_CATEGORIES + from the demo set exists.
  const nameToId = new Map<string, string>();
  existingCategories.forEach((c: any) => nameToId.set(c.name, c.id));

  const demo = generateDemoData();
  const wanted = new Set<string>(DEFAULT_CATEGORIES);
  demo.forEach((t) => t.category && wanted.add(t.category));

  // Also make sure we have an income bucket (demo payroll has category=null)
  let catsCreated = 0;
  let colorIdx = existingCategories.length;

  const incomeCatNeeded = demo.some((t) => t.isIncome);
  if (incomeCatNeeded && !existingCategories.some((c: any) => c.is_income)) {
    const row = await createCategory({
      name: "Income",
      color: "#5a8a55",
      is_income: true,
      sort_order: 100,
    });
    nameToId.set("Income", row.id);
    catsCreated++;
  }

  for (const name of wanted) {
    if (nameToId.has(name)) continue;
    const row = await createCategory({
      name,
      color: CAT_COLORS[name] || FALLBACK_PALETTE[colorIdx % FALLBACK_PALETTE.length],
      is_income: false,
      sort_order: colorIdx,
    });
    nameToId.set(name, row.id);
    colorIdx++;
    catsCreated++;
  }

  // 2) Create all transactions (small batches to keep UI responsive)
  const incomeCatId = Array.from(nameToId.entries())
    .find(([n]) => n === "Income")?.[1] ?? null;

  let txnsCreated = 0;
  const BATCH = 8;
  for (let i = 0; i < demo.length; i += BATCH) {
    const chunk = demo.slice(i, i + BATCH);
    await Promise.all(
      chunk.map((t) =>
        createTransaction({
          date: t.date.toISOString().slice(0, 10),
          description: t.description,
          amount: Math.abs(t.amount),
          is_income: !!t.isIncome,
          category_id: t.isIncome
            ? incomeCatId
            : (t.category ? (nameToId.get(t.category) ?? null) : null),
          source: "demo",
        })
      )
    );
    txnsCreated += chunk.length;
  }

  console.info(`[ledger] demo: done — ${catsCreated} categories, ${txnsCreated} transactions`);
  return { catsCreated, txnsCreated };
}
