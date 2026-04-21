import { NextRequest } from "next/server";
import { withAuth, parseJSON } from "@/lib/api";
import { ProfileUpdate } from "@/lib/schemas";

/** GET /api/profile */
export async function GET() {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (error) throw new Error(error.message);
    return data;
  });
}

/** PATCH /api/profile */
export async function PATCH(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, ProfileUpdate);
    const { data, error } = await supabase
      .from("profiles")
      .update(body)
      .eq("id", user.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  });
}
