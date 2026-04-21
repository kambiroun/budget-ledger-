/**
 * Commit flow — turns a reviewed ImportPlan into actual transactions.
 *
 *   commitImport(plan, opts) {
 *     1. create an import_batches row on the server (status=pending)
 *     2. match every "import" row against the user's rules → assign category
 *     3. AI-categorize remaining uncategorized rows (in chunks)
 *     4. bulk-create transactions, tagged with import_batch_id
 *     5. patch the batch with final counts + mark status=committed
 *   }
 *
 * The batch_id is the anchor for undo: /api/imports/[id] DELETE hard-deletes
 * every transaction referencing this batch and marks status=undone.
 */
import type { ImportPlan, ReviewRow } from "./types";
import { createTransaction } from "@/lib/db/client";
import { aiCategorize } from "@/lib/ai/client";

export interface CommitOptions {
  /** Called with progress updates so the wizard can show a live status line. */
  onProgress?: (msg: string) => void;
  /** If false, skip the AI categorize step (rules only). Defaults to true. */
  useAI?: boolean;
}

export interface CommitResult {
  batch_id: string;
  total: number;       // rows marked import
  imported: number;
  skipped: number;
  duplicate: number;
  categorized_by_rule: number;
  categorized_by_ai: number;
  warnings: string[];
}

/** Create a batch row on the server. Returns the new id. */
async function createBatch(plan: ImportPlan, raw_text: string | null): Promise<string> {
  const res = await fetch("/api/imports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: plan.filename,
      file_kind: plan.kind,
      raw_text: raw_text ? raw_text.slice(0, 500_000) : null,
      mapping: plan.mapping,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) throw new Error(json?.error || `create_batch_${res.status}`);
  return json.data.id as string;
}

/** Patch the batch with final stats. Non-fatal on error — just log. */
async function finalizeBatch(id: string, patch: Record<string, unknown>) {
  try {
    await fetch(`/api/imports/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch (e) {
    console.warn("[ledger] finalize batch failed:", e);
  }
}

/**
 * Match a description against the user's rules. Returns the category_id of
 * the highest-priority matching rule, or null.
 */
function matchRule(desc: string, rules: any[], categories: any[]): string | null {
  const lower = desc.toLowerCase();
  const valid = rules
    .filter(r => !r.deleted_at && r.pattern && r.category_id)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const existingCatIds = new Set(categories.filter(c => !c.deleted_at).map(c => c.id));
  for (const r of valid) {
    if (!existingCatIds.has(r.category_id)) continue; // rule points at a deleted cat
    if (lower.includes(String(r.pattern).toLowerCase())) return r.category_id;
  }
  return null;
}

export async function commitImport(
  plan: ImportPlan,
  context: { rules: any[]; categories: any[] },
  opts: CommitOptions = {}
): Promise<CommitResult> {
  const { onProgress, useAI = true } = opts;
  const log = (m: string) => { onProgress?.(m); console.info(`[ledger] import: ${m}`); };

  const warnings = [...plan.warnings];
  const importing = plan.rows.filter(r => r.decision === "import");
  const skipping  = plan.rows.filter(r => r.decision === "skip");
  const dupeCount = plan.rows.filter(r =>
    r.decision === "skip" &&
    (r.dedupe.kind === "exact" || r.dedupe.kind === "fuzzy")
  ).length;

  if (!importing.length) {
    return {
      batch_id: "",
      total: 0, imported: 0,
      skipped: skipping.length, duplicate: dupeCount,
      categorized_by_rule: 0, categorized_by_ai: 0,
      warnings: ["no rows selected for import"],
    };
  }

  // 1) Create batch
  log("Creating import batch…");
  // Store a small preview of the raw text (first ~80 rows) so users can see
  // what they imported. Full file is too big.
  const rawPreview = [
    plan.rows.slice(0, 80).map(r => JSON.stringify(r.raw)).join("\n"),
  ].join("\n");
  const batch_id = await createBatch(plan, rawPreview);
  log(`Batch ${batch_id.slice(0, 8)}… created`);

  // 2) Apply rules first (free, deterministic, local).
  //    `override_category_id` wins over rules — user's explicit choice.
  let byRule = 0;
  const needsAI: ReviewRow[] = [];
  const finalCats = new Map<number, string | null>(); // row.idx → category_id
  for (const r of importing) {
    if (r.override_category_id) {
      finalCats.set(r.idx, r.override_category_id);
      continue;
    }
    const hit = matchRule(r.description, context.rules, context.categories);
    if (hit) { finalCats.set(r.idx, hit); byRule++; continue; }
    // Income rows don't need a spending category; leave null.
    if (r.is_income) { finalCats.set(r.idx, null); continue; }
    needsAI.push(r);
  }
  log(`${byRule} matched by rule, ${needsAI.length} pending AI`);

  // 3) AI categorize the rest (if enabled + categories exist).
  let byAI = 0;
  if (useAI && needsAI.length && context.categories.some(c => !c.is_income && !c.deleted_at)) {
    try {
      log(`Calling AI for ${needsAI.length} rows…`);
      const out = await aiCategorize(needsAI.map(r => ({
        id: String(r.idx),
        description: r.description,
        amount: r.amount,
        is_income: r.is_income,
      })));
      for (const res of out) {
        const idx = parseInt(res.id, 10);
        if (!Number.isNaN(idx)) {
          finalCats.set(idx, res.category_id);
          if (res.category_id && res.source !== "none") byAI++;
        }
      }
      log(`AI categorized ${byAI} rows`);
    } catch (e: any) {
      warnings.push("AI categorize failed: " + (e?.message || e));
      // Leave uncategorized — user can fix in the ledger.
      for (const r of needsAI) if (!finalCats.has(r.idx)) finalCats.set(r.idx, null);
    }
  } else {
    for (const r of needsAI) finalCats.set(r.idx, null);
  }

  // 4) Bulk create transactions. Tagged with import_batch_id for undo.
  //    Chunk to avoid stacking too many parallel requests at once.
  let imported = 0;
  const CHUNK = 8;
  for (let i = 0; i < importing.length; i += CHUNK) {
    const chunk = importing.slice(i, i + CHUNK);
    await Promise.all(chunk.map(r =>
      createTransaction({
        date: r.date,
        description: r.description,
        amount: r.amount,
        is_income: r.is_income,
        category_id: finalCats.get(r.idx) ?? null,
        source: "import",
        source_file: plan.filename,
        import_batch_id: batch_id,
        raw: r.raw,
      }).then(() => { imported++; })
        .catch(e => {
          warnings.push(`Row ${r.idx + 1} failed: ${e?.message ?? e}`);
        })
    ));
    log(`Imported ${imported} / ${importing.length}…`);
  }

  // 5) Finalize batch
  await finalizeBatch(batch_id, {
    status: imported === importing.length ? "committed" : "failed",
    rows_total: plan.rows.length,
    rows_imported: imported,
    rows_skipped: skipping.length,
    rows_duplicate: dupeCount,
    warnings,
  });

  return {
    batch_id,
    total: importing.length,
    imported,
    skipped: skipping.length,
    duplicate: dupeCount,
    categorized_by_rule: byRule,
    categorized_by_ai: byAI,
    warnings,
  };
}
