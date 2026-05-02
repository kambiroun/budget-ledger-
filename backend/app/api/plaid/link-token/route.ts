import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient } from "@/lib/plaid/client";
import { CountryCode, Products } from "plaid";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "Budget Ledger",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
    });

    return NextResponse.json({ ok: true, data: { link_token: data.link_token } });
  } catch (err: any) {
    const msg = err?.response?.data?.error_message ?? err?.message ?? "plaid_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
