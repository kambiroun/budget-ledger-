import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncItem } from "@/lib/plaid/sync";

/**
 * Plaid webhook receiver.
 *
 * In production, the `Plaid-Verification` JWT header is verified before
 * processing any event. Sandbox and Development skip verification so
 * local testing isn't blocked by signature checks.
 *
 * Handled events:
 *   TRANSACTIONS / SYNC_UPDATES_AVAILABLE — triggers a background sync
 *   ITEM / ERROR                          — stores the error on the item
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  let body: Record<string, unknown>;

  if (process.env.PLAID_ENV === "production") {
    const signatureJwt = req.headers.get("Plaid-Verification");
    const { verifyPlaidWebhook } = await import("@/lib/plaid/verify");
    const valid = await verifyPlaidWebhook(rawBody, signatureJwt);
    if (!valid) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
  }

  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { webhook_type, webhook_code, item_id, error } = body as Record<string, any>;
  const admin = createAdminClient();

  if (webhook_type === "TRANSACTIONS" && webhook_code === "SYNC_UPDATES_AVAILABLE") {
    const { data: item } = await admin
      .from("plaid_items")
      .select("id, user_id")
      .eq("plaid_item_id", item_id)
      .single();

    if (item) {
      // Fire-and-forget — Plaid requires a response within 10 seconds
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
