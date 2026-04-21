import { NextRequest } from "next/server";
import { withAuth, parseJSON } from "@/lib/api";
import { BudgetUpsert } from "@/lib/schemas";
import { z } from "zod";

/** GET /api/budgets */
export async function GET(_req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("budgets")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

/**
 * PUT /api/budgets
 * Upsert-many — single source of truth for setting monthly budgets.
 * Body: { budgets: [{ category_id, amount }, ...] }
 */
const PutBody = z.object({ budgets: z.array(BudgetUpsert) });

export async function PUT(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { budgets } = await parseJSON(req, PutBody);
    const rows = budgets.map(b => ({
      ...(b.id ? { id: b.id } : {}),
      user_id: user.id,
      category_id: b.category_id,
      amount: b.amount,
      deleted_at: null,
    }));
    const { data, error } = await supabase
      .from("budgets")
      .upsert(rows, { onConflict: "user_id,category_id" })
      .select();
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}
