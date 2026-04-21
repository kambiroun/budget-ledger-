import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseJSON } from "@/lib/api";

const Patch = z.object({
  mapping: z.any().optional(),
  status: z.enum(["pending", "committed", "failed", "undone"]).optional(),
  rows_total: z.number().int().nonnegative().optional(),
  rows_imported: z.number().int().nonnegative().optional(),
  rows_skipped: z.number().int().nonnegative().optional(),
  rows_duplicate: z.number().int().nonnegative().optional(),
  warnings: z.array(z.string()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("import_batches")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) { const e: any = new Error("not_found"); e.__apiStatus = 404; throw e; }
    return data;
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, Patch);
    const { data, error } = await supabase
      .from("import_batches")
      .update(body)
      .eq("user_id", user.id)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  });
}

/**
 * Undo an import: hard-delete every transaction created under this batch,
 * then mark the batch status = 'undone'. Transactions are deleted rather
 * than soft-deleted because a successful "undo" should leave no trace in
 * the ledger (the user explicitly asked to roll it back).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async ({ supabase, user }) => {
    const { count, error: delErr } = await supabase
      .from("transactions")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .eq("import_batch_id", params.id);
    if (delErr) throw new Error(delErr.message);

    const { error: upErr } = await supabase
      .from("import_batches")
      .update({ status: "undone" })
      .eq("user_id", user.id)
      .eq("id", params.id);
    if (upErr) throw new Error(upErr.message);

    return { deleted_transactions: count ?? 0 };
  });
}
