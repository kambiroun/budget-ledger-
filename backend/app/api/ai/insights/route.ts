/**
 * POST /api/ai/insights
 *
 * Given aggregated numbers the client already computed, return a short
 * narrative paragraph + a couple of bullet findings for the dashboard.
 *
 * We do NOT send individual transactions — only per-category totals + a
 * handful of anomaly flags. Keeps the prompt small + privacy tidy.
 *
 * Body: {
 *   month: "2025-02",
 *   total_spent, total_income, net,
 *   by_category: [{ name, amount, budget?, delta_vs_prev_month? }],
 *   anomalies?: [string]
 * }
 * Reply: { narrative: string, findings: string[] }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseJSON, ApiError } from "@/lib/api";
import { aiComplete, parseJsonLoose, AIProviderError } from "@/lib/ai/provider";
import { requireQuota, recordUsage } from "@/lib/ai/quota";

const Body = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  total_spent: z.number(),
  total_income: z.number().optional(),
  net: z.number().optional(),
  by_category: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    budget: z.number().optional(),
    delta_vs_prev_month: z.number().optional(),
  })).max(30),
  anomalies: z.array(z.string().max(300)).max(10).optional(),
});

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, Body);
    await requireQuota(supabase, user.id, 1);

    const system =
      "You are a personal finance coach writing a one-paragraph monthly summary. " +
      "Tone: calm, observant, a little wry — never scolding, never breathless. " +
      "Mention specific categories and numbers. Round to whole dollars. " +
      "Avoid generic advice ('make a budget'); focus on what the numbers show. " +
      "Then list 2-3 concrete findings as short fragments (no leading bullets).";

    const userMsg = JSON.stringify(body);
    const instruction =
      userMsg +
      `\n\nReturn JSON: { "narrative": "<2-4 sentence paragraph>", "findings": ["...", "...", "..."] }`;

    let ai;
    try {
      ai = await aiComplete({
        system, user: instruction, json: true, maxTokens: 600,
      });
    } catch (e: any) {
      if (e instanceof AIProviderError) {
        throw new ApiError(e.status === 429 ? 429 : 502, e.message);
      }
      throw e;
    }
    await recordUsage(supabase, 1, ai.usage.input_tokens, ai.usage.output_tokens);

    let parsed: any;
    try { parsed = parseJsonLoose(ai.text); } catch {
      console.warn("[ai/insights] unparseable:", ai.text.slice(0, 200));
      throw new ApiError(502, "ai_bad_response");
    }
    return {
      narrative: String(parsed?.narrative ?? "").slice(0, 2000),
      findings: Array.isArray(parsed?.findings)
        ? parsed.findings.slice(0, 5).map((s: any) => String(s).slice(0, 300))
        : [],
    };
  });
}
