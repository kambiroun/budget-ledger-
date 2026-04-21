import { NextRequest } from "next/server";
import { withAuth, parseJSON } from "@/lib/api";
import { GoalCreate } from "@/lib/schemas";

export async function GET(_req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, GoalCreate);
    const { data, error } = await supabase
      .from("goals")
      .insert({
        ...(body.id ? { id: body.id } : {}),
        user_id: user.id,
        name: body.name,
        target: body.target,
        saved: body.saved ?? 0,
        target_date: body.target_date ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  });
}
