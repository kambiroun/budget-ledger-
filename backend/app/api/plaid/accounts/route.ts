import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Returns the authenticated user's linked Plaid items and their accounts.
 * Never returns the plaid_access_token.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: items } = await admin
    .from("plaid_items")
    .select("id, institution_id, institution_name, last_synced_at, error_code, created_at")
    .eq("user_id", user.id)
    .order("created_at");

  if (!items?.length) {
    return NextResponse.json({ ok: true, data: { items: [] } });
  }

  const { data: accounts } = await admin
    .from("plaid_accounts")
    .select("id, item_id, plaid_account_id, name, official_name, mask, type, subtype, enabled")
    .eq("user_id", user.id)
    .in("item_id", items.map((i) => i.id))
    .order("name");

  const result = items.map((item) => ({
    ...item,
    accounts: (accounts ?? []).filter((a) => a.item_id === item.id),
  }));

  return NextResponse.json({ ok: true, data: { items: result } });
}
