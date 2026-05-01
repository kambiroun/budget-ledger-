/**
 * POST /api/ai/extract-image
 *
 * Input:  { image_b64: string, media_type: "image/png"|"image/jpeg"|... }
 * Output: { headers: string[], rows: string[][], warnings: string[] }
 *
 * Uses Claude's vision to pull tabular transaction-like data out of a
 * screenshot / receipt / photo. We deliberately return the same RawTable
 * shape every other parser does, so the mapping + review UI is shared.
 *
 * The AI is told to return JSON with { headers, rows } so the user can
 * review the mapping and dedupe just like for any other file.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseJSON } from "@/lib/api";
import { aiComplete, parseJsonLoose, AIProviderError } from "@/lib/ai/provider";
import { requireQuota, recordUsage } from "@/lib/ai/quota";
import { requireTier } from "@/lib/billing";

const Body = z.object({
  image_b64: z.string().min(100).max(8_000_000),
  media_type: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
});

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { image_b64, media_type } = await parseJSON(req, Body);
    const byoKey = await requireTier(supabase, user.id, "pro");
    await requireQuota(supabase, user.id, 1);

    const system = [
      "You extract transaction-like rows from images of bank statements, credit card bills, receipts, or exported tables.",
      "Return a table: a list of column headers + a list of row arrays.",
      "",
      "Rules:",
      "  - Always include a 'date' column (YYYY-MM-DD when possible).",
      "  - Always include a 'description' column (merchant name / line item).",
      "  - Always include an 'amount' column (plain number, no currency symbol). Use negative for money spent, positive for money received, unless the image clearly shows the opposite — prefer negative-is-spending.",
      "  - Include a 'category' column only if the image already assigns one.",
      "  - Skip summary lines (subtotals, balance, etc).",
      "  - If the image isn't a transaction list at all, return empty rows + a warning.",
    ].join("\n");

    const userMsg = [
      "Extract transactions from this image. Return JSON:",
      `{`,
      `  "headers": ["date", "description", "amount", ...],`,
      `  "rows":    [[...], [...], ...],`,
      `  "warnings": ["any problems you noticed"]`,
      `}`,
    ].join("\n");

    let ai;
    try {
      ai = await aiComplete({
        system, user: userMsg, json: true, maxTokens: 2048,
        images: [{ media_type, data: image_b64 }],
        apiKey: byoKey ?? undefined,
      });
    } catch (e: any) {
      if (e instanceof AIProviderError) {
        throw Object.assign(new Error(e.message), { __apiStatus: e.status === 429 ? 429 : 502 });
      }
      throw e;
    }
    await recordUsage(supabase, 1, ai.usage.input_tokens, ai.usage.output_tokens);

    let parsed: any;
    try { parsed = parseJsonLoose(ai.text); }
    catch {
      throw Object.assign(new Error("ai_returned_invalid_json"), { __apiStatus: 502 });
    }

    const headers: string[] = Array.isArray(parsed?.headers)
      ? parsed.headers.map((h: any) => String(h))
      : [];
    const rows: string[][] = Array.isArray(parsed?.rows)
      ? parsed.rows.filter((r: any) => Array.isArray(r)).map((r: any[]) => r.map(v => v == null ? "" : String(v)))
      : [];
    const warnings: string[] = Array.isArray(parsed?.warnings)
      ? parsed.warnings.map((w: any) => String(w)).slice(0, 10)
      : [];

    return { headers, rows, warnings };
  });
}
