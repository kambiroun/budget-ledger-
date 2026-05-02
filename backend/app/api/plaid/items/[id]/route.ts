import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { plaidClient } from "@/lib/plaid/client";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: item } = await admin
    .from("plaid_items")
    .select("plaid_access_token")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort: remove the item from Plaid (revokes the access token)
  try {
    await plaidClient.itemRemove({ access_token: item.plaid_access_token });
  } catch (err) {
    // Non-fatal — proceed with local cleanup even if Plaid call fails
    console.warn("[plaid] itemRemove failed:", err);
  }

  // Delete from DB — cascades to plaid_accounts rows
  await admin
    .from("plaid_items")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
