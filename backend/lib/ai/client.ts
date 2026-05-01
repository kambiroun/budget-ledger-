/**
 * Client-side wrappers around /api/ai/* endpoints.
 *
 * All calls go through the standard { ok: true, data: T } envelope. On
 * failure we throw an Error whose message carries the server error code
 * ('ai_daily_limit_exceeded', 'ai_not_configured', 'could_not_extract_transaction',
 *  etc.) so callers can branch on it.
 */

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) {
    throw Object.assign(new Error(json?.error || `http_${res.status}`), {
      status: res.status, details: json?.details,
    });
  }
  return json.data as T;
}

/* ============================================================================
 * Categorize
 * ==========================================================================*/

export interface CategorizeItem {
  id: string;
  description: string;
  amount?: number;
  is_income?: boolean;
}
export interface CategorizeResult {
  id: string;
  category_id: string | null;
  category_name: string | null;
  confidence: number;
  source: "cache" | "llm" | "none";
}

export async function aiCategorize(items: CategorizeItem[]): Promise<CategorizeResult[]> {
  if (!items.length) return [];
  // Chunk to stay under the 50-row server cap + keep individual requests snappy.
  const CHUNK = 30;
  const out: CategorizeResult[] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const { results } = await post<{ results: CategorizeResult[] }>(
      "/api/ai/categorize", { items: chunk }
    );
    out.push(...results);
  }
  return out;
}

/* ============================================================================
 * Parse (NL → transaction)
 * ==========================================================================*/

export interface ParsedTxn {
  date: string;
  description: string;
  amount: number;
  is_income: boolean;
  category_id: string | null;
}

export async function aiParse(text: string): Promise<ParsedTxn> {
  const { transaction } = await post<{ transaction: ParsedTxn }>(
    "/api/ai/parse", { text }
  );
  return transaction;
}

/* ============================================================================
 * Insights (dashboard narrative)
 * ==========================================================================*/

export interface InsightInput {
  month: string; // "YYYY-MM"
  total_spent: number;
  total_income?: number;
  net?: number;
  by_category: { name: string; amount: number; budget?: number; delta_vs_prev_month?: number }[];
  anomalies?: string[];
}
export interface InsightOutput {
  narrative: string;
  findings: string[];
}

export async function aiInsights(input: InsightInput): Promise<InsightOutput> {
  return await post<InsightOutput>("/api/ai/insights", input);
}

/* ============================================================================
 * Extract image (receipt OCR)
 * ==========================================================================*/

export interface ExtractImageResult {
  headers: string[];
  rows: string[][];
  warnings: string[];
}

export async function aiExtractImage(
  imageB64: string,
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"
): Promise<ExtractImageResult> {
  return await post<ExtractImageResult>("/api/ai/extract-image", {
    image_b64: imageB64,
    media_type: mediaType,
  });
}

/* ============================================================================
 * Quota
 * ==========================================================================*/

export interface AIQuota {
  calls_today: number;
  limit: number;
  remaining: number;
}

export async function aiQuota(): Promise<AIQuota> {
  const res = await fetch("/api/ai/quota");
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) throw new Error(json?.error || `http_${res.status}`);
  return json.data as AIQuota;
}
