/**
 * POST /api/ai/parse
 *
 * Natural-language → structured transaction.
 *   "coffee 5 bucks yesterday"
 *     → { date: "2025-02-09", description: "Coffee", amount: 5, category: "Food" }
 *
 * Used by the command palette. Returns a fully-formed transaction that
 * the client can POST straight to /api/transactions (we don't insert it
 * here — keeps concerns clean and lets the client stay offline-first).
 *
 * Body:  { text: string }
 * Reply: { transaction: { date, description, amount, is_income?, category_id? } }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseJSON, ApiError } from "@/lib/api";
import { aiComplete, parseJsonLoose, AIProviderError } from "@/lib/ai/provider";
import { requireQuota, recordUsage } from "@/lib/ai/quota";
import { requireTier } from "@/lib/billing";

const Body = z.object({
  text: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { text } = await parseJSON(req, Body);

    // Categories (for the model to choose from)
    const { data: cats, error: catErr } = await supabase
      .from("categories").select("id, name, is_income")
      .eq("user_id", user.id).is("deleted_at", null);
    if (catErr) throw new Error("categories: " + catErr.message);
    const catNames = (cats ?? []).filter((c: any) => !c.is_income).map((c: any) => c.name);
    const byName: Record<string, string> = {};
    (cats ?? []).forEach((c: any) => { byName[c.name.toLowerCase()] = c.id; });

    const byoKey = await requireTier(supabase, user.id, "pro");
    await requireQuota(supabase, user.id, 1);

    const today = new Date().toISOString().slice(0, 10);
    const system =
      "You extract a single financial transaction from a short natural-language sentence. " +
      "Infer date relative to today. " +
      "Pick the most appropriate category from the provided list, or null if none fit. " +
      "Amount is always positive. is_income is true for salary/refunds/income, false otherwise.";
    const userMsg =
      `Today is ${today}.\n` +
      `Categories: ${JSON.stringify(catNames)}\n\n` +
      `Input: "${text}"\n\n` +
      `Return JSON: { "date": "YYYY-MM-DD", "description": "string", "amount": number, "is_income": boolean, "category": "name or null" }`;

    let ai;
    try {
      ai = await aiComplete({ system, user: userMsg, json: true, maxTokens: 200, apiKey: byoKey ?? undefined });
    } catch (e: any) {
      if (e instanceof AIProviderError) {
        throw new ApiError(e.status === 429 ? 429 : 502, e.message);
      }
      throw e;
    }
    await recordUsage(supabase, 1, ai.usage.input_tokens, ai.usage.output_tokens);

    let parsed: any;
    try { parsed = parseJsonLoose(ai.text); } catch {
      console.warn("[ai/parse] unparseable:", ai.text.slice(0, 200));
      throw new ApiError(502, "ai_bad_response");
    }

    // Validate + massage
    const dateOk = typeof parsed?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date);
    const amt = Number(parsed?.amount);
    if (!dateOk || !Number.isFinite(amt) || amt <= 0 || !parsed?.description) {
      throw new ApiError(422, "could_not_extract_transaction", parsed);
    }

    const catName: string | null = parsed?.category ?? null;
    const category_id = catName ? (byName[String(catName).toLowerCase()] ?? null) : null;

    return {
      transaction: {
        date: parsed.date,
        description: String(parsed.description).slice(0, 200),
        amount: amt,
        is_income: !!parsed?.is_income,
        category_id,
      },
    };
  });
}
