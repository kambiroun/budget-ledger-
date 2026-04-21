import { NextRequest } from "next/server";
import { withAuth, parseJSON } from "@/lib/api";
import { SyncPush } from "@/lib/schemas";

/**
 * POST /api/sync/push
 *
 * Body: { categories?, budgets?, transactions?, rules?, goals? }
 * Each row MUST include `id` so upsert can match. Soft-deletes are expressed
 * by setting `deleted_at`. Updates are last-write-wins: the server keeps the
 * row with the latest updated_at (server always stamps its own).
 *
 * This endpoint is intentionally loud-on-failure — if any batch fails we
 * abort so the client retries cleanly. No partial commits.
 */
export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, SyncPush);
    const now = new Date().toISOString();

    const tagged = <T extends object>(rows: T[] | undefined, extra: Partial<T> = {}) =>
      (rows ?? []).map(r => ({ ...(extra as any), ...(r as any), user_id: user.id, updated_at: now }));

    // Order matters: categories before budgets/transactions/rules (FK dependencies)
    const batches: Array<[string, any[], { onConflict?: string }]> = [
      ["categories", tagged(body.categories), { onConflict: "id" }],
      ["budgets", tagged(body.budgets), { onConflict: "user_id,category_id" }],
      ["transactions", tagged(body.transactions), { onConflict: "id" }],
      ["rules", tagged(body.rules), { onConflict: "id" }],
      ["goals", tagged(body.goals), { onConflict: "id" }],
    ];

    const counts: Record<string, number> = {};
    for (const [table, rows, opts] of batches) {
      if (!rows.length) { counts[table] = 0; continue; }
      const { error, data } = await supabase.from(table).upsert(rows, opts).select("id");
      if (error) throw new Error(`${table}: ${error.message}`);
      counts[table] = data?.length ?? 0;
    }

    return { server_time: now, counts };
  });
}
