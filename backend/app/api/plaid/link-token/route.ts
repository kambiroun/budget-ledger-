import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { plaidClient } from "@/lib/plaid/client";
import { requireTier } from "@/lib/billing";
import { CountryCode, Products } from "plaid";

const Body = z.object({
  // When item_id is provided, creates a link token in update mode (re-link flow)
  item_id: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bank sync is a Plus-tier feature
  try {
    await requireTier(supabase, user.id, "plus");
  } catch (err: any) {
    if (err.__apiStatus === 402) {
      return NextResponse.json(
        { error: "subscription_required", required_tier: "plus" },
        { status: 402 }
      );
    }
    throw err;
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const itemId = parsed.success ? parsed.data.item_id : undefined;

  // For update mode, look up the existing access token
  let accessToken: string | undefined;
  if (itemId) {
    const admin = createAdminClient();
    const { data: item } = await admin
      .from("plaid_items")
      .select("plaid_access_token")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    accessToken = item.plaid_access_token;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkParams: any = {
      user: { client_user_id: user.id },
      client_name: "Budget Ledger",
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
    };

    if (accessToken) {
      // Update mode — re-authenticates an existing item without a new exchange
      linkParams.access_token = accessToken;
    } else {
      linkParams.products = [Products.Transactions];
    }

    const { data } = await plaidClient.linkTokenCreate(linkParams);

    return NextResponse.json({
      ok: true,
      data: { link_token: data.link_token, update_mode: !!accessToken },
    });
  } catch (err: any) {
    const msg = err?.response?.data?.error_message ?? err?.message ?? "plaid_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
