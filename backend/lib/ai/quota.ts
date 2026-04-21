/**
 * Per-user daily AI call quota.
 *
 * We pre-check the current usage (so we can 429 before burning tokens), run
 * the call, then increment counters atomically via an RPC.
 *
 * Limits are loose guardrails, not billing — a user can overshoot slightly
 * because check-then-call isn't atomic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";

export const AI_DAILY_CALL_LIMIT = parseInt(process.env.AI_DAILY_CALL_LIMIT ?? "1000", 10);

export interface AIQuota {
  calls_today: number;
  limit: number;
  remaining: number;
}

/** Today in UTC as YYYY-MM-DD. Single source of truth for the "day" bucket. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getQuota(supabase: SupabaseClient, userId: string): Promise<AIQuota> {
  const { data, error } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("user_id", userId)
    .eq("day", utcToday())
    .maybeSingle();
  if (error) throw new Error("quota_read_failed: " + error.message);
  const calls = data?.calls ?? 0;
  return {
    calls_today: calls,
    limit: AI_DAILY_CALL_LIMIT,
    remaining: Math.max(0, AI_DAILY_CALL_LIMIT - calls),
  };
}

/** Throw 429 if over. Call this before the LLM request. */
export async function requireQuota(
  supabase: SupabaseClient, userId: string, needed = 1
) {
  const q = await getQuota(supabase, userId);
  if (q.remaining < needed) {
    throw new ApiError(429, "ai_daily_limit_exceeded", {
      calls_today: q.calls_today, limit: q.limit,
    });
  }
  return q;
}

/**
 * Record usage. Best-effort — we never fail an API response because the
 * counter write failed.
 */
export async function recordUsage(
  supabase: SupabaseClient,
  calls: number,
  inputTokens: number,
  outputTokens: number,
) {
  try {
    await supabase.rpc("ai_usage_increment", {
      p_calls: calls,
      p_in_tokens: inputTokens,
      p_out_tokens: outputTokens,
    });
  } catch (e) {
    console.warn("[ai] recordUsage failed (non-fatal)", e);
  }
}
