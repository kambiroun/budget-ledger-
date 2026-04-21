/**
 * POST /api/ai/map-columns
 *
 * Input:  { headers: string[], rows_sample: string[][] } — up to 15 sample rows
 * Output: { mapping: ColumnMapping }
 *
 * The AI advisor proposes which column is date / description / amount / debit /
 * credit / category / notes. The client ALWAYS shows the user this mapping
 * before committing — the AI is advisory, not autopilot.
 *
 * We only sample rows to keep tokens bounded even on 50k-row imports.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseJSON } from "@/lib/api";
import { aiComplete, parseJsonLoose, AIProviderError } from "@/lib/ai/provider";
import { requireQuota, recordUsage } from "@/lib/ai/quota";

const Body = z.object({
  headers: z.array(z.string()).min(1).max(100),
  rows_sample: z.array(z.array(z.string())).max(25),
});

const ROLES = ["date", "description", "amount", "debit", "credit", "category", "notes", "ignore"] as const;

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { headers, rows_sample } = await parseJSON(req, Body);
    await requireQuota(supabase, user.id, 1);

    const system = [
      "You help import bank / credit card / financial transaction data from arbitrary CSVs and spreadsheets.",
      "Given a table's headers and a few sample rows, decide which role each COLUMN plays.",
      "",
      "Roles:",
      "  date         — posting or transaction date",
      "  description  — merchant / payee / memo (pick the most descriptive one if multiple)",
      "  amount       — single signed amount column",
      "  debit        — money OUT (outflow) in a two-column layout",
      "  credit       — money IN (inflow) in a two-column layout",
      "  category     — user-assigned category, if present",
      "  notes        — secondary memo / transaction id / reference",
      "  ignore       — everything else",
      "",
      "Conventions:",
      "  - Pick EITHER amount, OR debit+credit. Never both. If both shapes are present, prefer amount.",
      "  - amount_convention: 'negative_is_spending' (typical US banks) or 'positive_is_spending' (some credit card exports).",
      "    Use sample values to decide: if negatives look like purchases, it's negative_is_spending.",
      "  - date_format: 'iso' | 'us' | 'eu' | 'auto'. Pick the clearest; 'auto' is fine when unclear.",
      "  - Give a one-sentence rationale naming the key columns so a human can sanity-check fast.",
      "",
      "Every header MUST appear in columns; use 'ignore' for headers that don't match any role.",
    ].join("\n");

    const sampleStr = rows_sample
      .map((r, i) => `  ${i + 1}: ${JSON.stringify(r)}`)
      .join("\n");
    const userMsg = [
      `Headers: ${JSON.stringify(headers)}`,
      "",
      `Sample rows (${rows_sample.length}):`,
      sampleStr,
      "",
      "Return JSON in this exact shape:",
      `{`,
      `  "columns": { "<header>": "<role>", ... },  // one entry per header`,
      `  "amount_convention": "negative_is_spending" | "positive_is_spending",`,
      `  "date_format": "iso" | "us" | "eu" | "auto",`,
      `  "rationale": "<one short sentence>"`,
      `}`,
    ].join("\n");

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

    let parsed: any;
    try { parsed = parseJsonLoose(ai.text); }
    catch {
      console.warn("[ai/map-columns] unparseable JSON:", ai.text.slice(0, 200));
      throw Object.assign(new Error("ai_returned_invalid_json"), { __apiStatus: 502 });
    }

    // Validate + sanitize
    const cleanColumns: Record<string, typeof ROLES[number]> = {};
    for (const h of headers) {
      const proposed = parsed?.columns?.[h];
      cleanColumns[h] = ROLES.includes(proposed) ? proposed : "ignore";
    }
    const conv = parsed?.amount_convention === "positive_is_spending"
      ? "positive_is_spending" : "negative_is_spending";
    const dfmt = ["iso", "us", "eu", "auto"].includes(parsed?.date_format) ? parsed.date_format : "auto";

    return {
      mapping: {
        columns: cleanColumns,
        amount_convention: conv,
        date_format: dfmt,
        rationale: typeof parsed?.rationale === "string" ? parsed.rationale.slice(0, 300) : "",
      },
    };
  });
}
