import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncItem } from "@/lib/plaid/sync";

/**
 * Plaid webhook receiver.
 *
 * For Sandbox the payload is not signed — signature verification is added
 * in Phase 7 when switching to production.
 *
 * Handled events:
 *   TRANSACTIONS / SYNC_UPDATES_AVAILABLE — kick off a background sync
 *   ITEM / ERROR                          — store the error on the item
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { webhook_type, webhook_code, item_id, error } = body;

  const admin = createAdminClient();

  if (webhook_type === "TRANSACTIONS" && webhook_code === "SYNC_UPDATES_AVAILABLE") {
    const { data: item } = await admin
      .from("plaid_items")
      .select("id, user_id")
      .eq("plaid_item_id", item_id)
      .single();

    if (item) {
      // Fire-and-forget — respond to Plaid immediately (< 10 s required)
      syncItem(item.id, item.user_id).catch(console.error);
    }
  }

  if (webhook_type === "ITEM" && webhook_code === "ERROR") {
    await admin
      .from("plaid_items")
      .update({
        error_code: error?.error_code ?? "UNKNOWN",
        error_message: error?.error_message ?? "unknown error",
      })
      .eq("plaid_item_id", item_id);
  }

  return NextResponse.json({ ok: true });
}
