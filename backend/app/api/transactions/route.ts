import { NextRequest } from "next/server";
import { withAuth, parseJSON, parseQuery } from "@/lib/api";
import { TransactionCreate, TransactionListQuery } from "@/lib/schemas";
import { z } from "zod";

/** GET /api/transactions?from=&to=&category_id=&q=&limit=&offset= */
export async function GET(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const q = parseQuery(req, TransactionListQuery);
    let query = supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (!q.include_deleted) query = query.is("deleted_at", null);
    if (q.from) query = query.gte("date", q.from);
    if (q.to) query = query.lte("date", q.to);
    if (q.category_id) query = query.eq("category_id", q.category_id);
    if (q.q) query = query.ilike("description", `%${q.q}%`);

    const limit = q.limit ?? 500;
    const offset = q.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { transactions: data ?? [], total: count ?? 0, limit, offset };
  });
}

/**
 * POST /api/transactions
 * Body: single transaction OR { transactions: [...] } for bulk import.
 */
const BulkBody = z.union([
  TransactionCreate,
  z.object({ transactions: z.array(TransactionCreate).min(1).max(2000) }),
]);

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, BulkBody);
    const items = Array.isArray((body as any).transactions)
      ? (body as any).transactions
      : [body];
    const rows = items.map((t: any) => ({
      ...(t.id ? { id: t.id } : {}),
      user_id: user.id,
      category_id: t.category_id ?? null,
      date: t.date,
      description: t.description,
      amount: t.amount,
      is_income: t.is_income ?? false,
      is_dupe: t.is_dupe ?? false,
      is_transfer: t.is_transfer ?? false,
      is_refund: t.is_refund ?? false,
      split_of: t.split_of ?? null,
      ai_confidence: t.ai_confidence ?? null,
      source: t.source ?? "manual",
      source_file: t.source_file ?? null,
      raw: t.raw ?? null,
    }));
    const { data, error } = await supabase.from("transactions").insert(rows).select();
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}
