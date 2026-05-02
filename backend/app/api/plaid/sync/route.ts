import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncItem } from "@/lib/plaid/sync";

const Body = z.object({
  item_id: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  let query = admin
    .from("plaid_items")
    .select("id")
    .eq("user_id", user.id);

  if (parsed.data.item_id) {
    query = query.eq("id", parsed.data.item_id) as typeof query;
  }

  const { data: items } = await query;
  if (!items?.length) {
    return NextResponse.json({ ok: true, data: { transactions_added: 0 } });
  }

  let totalAdded = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const result = await syncItem(item.id, user.id);
      totalAdded += result.added;
    } catch (err: any) {
      const msg = err?.message ?? "sync_failed";
      errors.push(msg);
      await admin
        .from("plaid_items")
        .update({ error_code: "SYNC_FAILED", error_message: msg })
        .eq("id", item.id);
    }
  }

  return NextResponse.json({
    ok: true,
    data: { transactions_added: totalAdded, errors },
  });
}
