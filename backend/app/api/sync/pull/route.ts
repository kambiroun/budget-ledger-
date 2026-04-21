import { NextRequest } from "next/server";
import { withAuth, parseQuery } from "@/lib/api";
import { z } from "zod";

/**
 * GET /api/sync/pull?since=<isoTimestamp>
 *
 * Returns everything the user owns that has been updated since the given
 * timestamp, across every syncable table. Used by the offline engine to
 * refresh its local cache.
 */
const Q = z.object({ since: z.string().datetime({ offset: true }).optional() });

export async function GET(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { since } = parseQuery(req, Q);
    const tables = ["categories", "budgets", "transactions", "rules", "goals", "merchant_map"] as const;

    const results = await Promise.all(
      tables.map(async (t) => {
        let q = supabase.from(t).select("*").eq("user_id", user.id);
        if (since) q = q.gt("updated_at", since);
        const { data, error } = await q;
        if (error) throw new Error(`${t}: ${error.message}`);
        return [t, data ?? []] as const;
      })
    );

    const out: Record<string, any[]> = {};
    for (const [t, rows] of results) out[t] = rows;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    out.profile = profile ? [profile] : [];

    return { server_time: new Date().toISOString(), ...out };
  });
}
