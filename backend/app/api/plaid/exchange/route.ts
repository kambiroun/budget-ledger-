import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { plaidClient } from "@/lib/plaid/client";
import { syncItem } from "@/lib/plaid/sync";

const Body = z.object({
  public_token: z.string().min(1),
  institution_id: z.string().optional(),
  institution_name: z.string().optional(),
  accounts: z.array(z.object({
    id: z.string(),
    name: z.string(),
    mask: z.string().nullable().optional(),
    type: z.string().optional(),
    subtype: z.string().nullable().optional(),
  })),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { public_token, institution_id, institution_name, accounts } = parsed.data;
  const admin = createAdminClient();

  try {
    const { data: exchangeData } = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeData;

    // Upsert item — handles re-linking the same institution
    const { data: item, error: itemError } = await admin
      .from("plaid_items")
      .upsert(
        {
          user_id: user.id,
          plaid_item_id: item_id,
          plaid_access_token: access_token,
          institution_id: institution_id ?? null,
          institution_name: institution_name ?? null,
        },
        { onConflict: "plaid_item_id" }
      )
      .select("id")
      .single();

    if (itemError || !item) throw new Error("Failed to store Plaid item");

    await admin.from("plaid_accounts").upsert(
      accounts.map((a) => ({
        user_id: user.id,
        item_id: item.id,
        plaid_account_id: a.id,
        name: a.name,
        mask: a.mask ?? null,
        type: a.type ?? null,
        subtype: a.subtype ?? null,
        enabled: true,
      })),
      { onConflict: "plaid_account_id" }
    );

    const syncResult = await syncItem(item.id, user.id);

    return NextResponse.json({
      ok: true,
      data: {
        item_id: item.id,
        transactions_imported: syncResult.added,
      },
    });
  } catch (err: any) {
    const msg = err?.response?.data?.error_message ?? err?.message ?? "plaid_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
