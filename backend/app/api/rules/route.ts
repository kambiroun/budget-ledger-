import { NextRequest } from "next/server";
import { withAuth, parseJSON } from "@/lib/api";
import { RuleCreate } from "@/lib/schemas";

/** GET /api/rules */
export async function GET(_req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("rules")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("priority", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

/** POST /api/rules */
export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, RuleCreate);
    const { data, error } = await supabase
      .from("rules")
      .insert({
        ...(body.id ? { id: body.id } : {}),
        user_id: user.id,
        pattern: body.pattern,
        category_id: body.category_id,
        priority: body.priority ?? 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  });
}
