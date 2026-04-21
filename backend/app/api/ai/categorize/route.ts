/**
 * POST /api/ai/categorize
 *
 * Given a batch of transaction descriptions + available category names,
 * returns a category (+ confidence) for each.
 *
 * Cache strategy:
 *   1. Normalize each description to a merchant_key (first few tokens, lowercase).
 *   2. Look up merchant_key in public.merchant_map — hit = skip the LLM.
 *   3. LLM-categorize the misses in one call.
 *   4. Write successes back to merchant_map so future matches are instant + free.
 *
 * Quota is counted per LLM call, not per row — so a 20-row batch with 18
 * cache hits costs 1 call, not 20.
 *
 * Body:  { items: [{ id, description, amount, is_income? }] }
 * Reply: { results: [{ id, category_id, category_name, confidence, source }] }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseJSON } from "@/lib/api";
import { uuid } from "@/lib/schemas";
import { aiComplete, parseJsonLoose, AIProviderError } from "@/lib/ai/provider";
import { requireQuota, recordUsage } from "@/lib/ai/quota";

const Body = z.object({
  items: z.array(z.object({
    id: uuid,
    description: z.string().min(1).max(500),
    amount: z.number().optional(),
    is_income: z.boolean().optional(),
  })).min(1).max(50),
});

/** Normalize a description to a stable cache key. */
function merchantKey(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")       // strip symbols
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)                          // first 3 words — "STARBUCKS STORE 1234" → "starbucks store 1234"
    .join(" ")
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { items } = await parseJSON(req, Body);

    // Load categories (non-income, available for assignment)
    const { data: cats, error: catErr } = await supabase
      .from("categories").select("id, name, is_income")
      .eq("user_id", user.id).is("deleted_at", null);
    if (catErr) throw new Error("categories: " + catErr.message);
    if (!cats || cats.length === 0) {
      throw new Error("no_categories — create some categories first");
    }
    const byName: Record<string, { id: string; is_income: boolean }> = {};
    cats.forEach((c: any) => { byName[c.name.toLowerCase()] = { id: c.id, is_income: !!c.is_income }; });

    // 1) Cache lookup
    const keys = Array.from(new Set(items.map((i) => merchantKey(i.description))));
    const { data: cached, error: mmErr } = await supabase
      .from("merchant_map").select("merchant_key, category_id")
      .eq("user_id", user.id).is("deleted_at", null)
      .in("merchant_key", keys);
    if (mmErr) throw new Error("merchant_map: " + mmErr.message);
    const cache = new Map<string, string>();
    (cached ?? []).forEach((m: any) => cache.set(m.merchant_key, m.category_id));

    type Result = {
      id: string;
      category_id: string | null;
      category_name: string | null;
      confidence: number;
      source: "cache" | "llm" | "none";
    };
    const results: Result[] = [];
    const misses: typeof items = [];

    for (const it of items) {
      if (it.is_income) {
        results.push({ id: it.id, category_id: null, category_name: null, confidence: 0, source: "none" });
        continue;
      }
      const k = merchantKey(it.description);
      const hit = cache.get(k);
      if (hit) {
        const cat = cats.find((c: any) => c.id === hit);
        results.push({
          id: it.id,
          category_id: hit,
          category_name: cat?.name ?? null,
          confidence: 0.95,
          source: "cache",
        });
      } else {
        misses.push(it);
      }
    }

    // 2) LLM for misses
    if (misses.length > 0) {
      await requireQuota(supabase, user.id, 1);

      const catNames = cats.filter((c: any) => !c.is_income).map((c: any) => c.name);
      const system =
        "You are a transaction categorizer. For each input transaction, pick the BEST matching category name from the provided list. " +
        "If nothing fits, return null for category. Give a confidence score from 0 to 1.";
      const userMsg =
        `Categories: ${JSON.stringify(catNames)}\n\n` +
        `Transactions:\n${misses.map((m, i) => `${i + 1}. "${m.description}"${m.amount ? ` ($${m.amount})` : ""}`).join("\n")}\n\n` +
        `Return JSON array in the SAME ORDER: [{ "category": "<name or null>", "confidence": 0.0 }]`;

      let ai;
      try {
        ai = await aiComplete({ system, user: userMsg, json: true, maxTokens: 800 });
      } catch (e: any) {
        if (e instanceof AIProviderError) {
          throw Object.assign(new Error(e.message), { __apiStatus: e.status === 429 ? 429 : 502 });
        }
        throw e;
      }
      await recordUsage(supabase, 1, ai.usage.input_tokens, ai.usage.output_tokens);

      let parsed: { category: string | null; confidence: number }[] = [];
      try { parsed = parseJsonLoose(ai.text); } catch {
        console.warn("[ai/categorize] LLM returned unparseable JSON:", ai.text.slice(0, 200));
        parsed = [];
      }

      // Backfill cache + results
      const toCache: { merchant_key: string; category_id: string }[] = [];
      for (let i = 0; i < misses.length; i++) {
        const it = misses[i];
        const p = parsed[i];
        const name = p?.category?.toLowerCase();
        const cat = name ? byName[name] : null;
        results.push({
          id: it.id,
          category_id: cat?.id ?? null,
          category_name: cat ? (cats.find((c: any) => c.id === cat.id) as any)?.name : null,
          confidence: Math.max(0, Math.min(1, p?.confidence ?? 0)),
          source: cat ? "llm" : "none",
        });
        if (cat && (p?.confidence ?? 0) >= 0.65) {
          toCache.push({ merchant_key: merchantKey(it.description), category_id: cat.id });
        }
      }
      if (toCache.length) {
        // dedupe by merchant_key
        const seen = new Set<string>();
        const rows = toCache.filter((r) => seen.has(r.merchant_key) ? false : (seen.add(r.merchant_key), true))
          .map((r) => ({ ...r, user_id: user.id }));
        // Upsert on (user_id, merchant_key)
        const { error } = await supabase
          .from("merchant_map")
          .upsert(rows, { onConflict: "user_id,merchant_key" });
        if (error) console.warn("[ai/categorize] merchant_map upsert failed:", error.message);
      }
    }

    // Preserve input order
    const byId = new Map(results.map((r) => [r.id, r]));
    const ordered = items.map((it) => byId.get(it.id)!);
    return { results: ordered };
  });
}
