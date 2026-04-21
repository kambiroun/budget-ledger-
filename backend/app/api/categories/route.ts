import { NextRequest } from "next/server";
import { withAuth, parseJSON, parseQuery } from "@/lib/api";
import { CategoryCreate } from "@/lib/schemas";
import { z } from "zod";

/** GET /api/categories[?include_deleted=1] */
export async function GET(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { include_deleted } = parseQuery(req, z.object({ include_deleted: z.coerce.boolean().optional() }));
    let q = supabase.from("categories").select("*").eq("user_id", user.id).order("sort_order", { ascending: true });
    if (!include_deleted) q = q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

/** POST /api/categories  — create */
export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, CategoryCreate);
    const row = {
      ...(body.id ? { id: body.id } : {}),
      user_id: user.id,
      name: body.name,
      color: body.color ?? null,
      sort_order: body.sort_order ?? 0,
    };
    const { data, error } = await supabase.from("categories").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}
