import { NextRequest } from "next/server";
import { withAuth, parseJSON, ApiError } from "@/lib/api";
import { TransactionUpdate } from "@/lib/schemas";

/** PATCH /api/transactions/:id */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, TransactionUpdate);
    const { data, error } = await supabase
      .from("transactions")
      .update(body)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw new ApiError(error.code === "PGRST116" ? 404 : 400, error.message);
    return data;
  });
}

/** DELETE /api/transactions/:id — soft delete */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuth(async ({ supabase, user }) => {
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return { id: params.id };
  });
}
