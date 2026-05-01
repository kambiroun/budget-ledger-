/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for upgrading to Pro or Plus.
 * Returns { url } — redirect the browser there.
 *
 * Body: { tier: 'pro' | 'plus', interval: 'month' | 'year' }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseJSON } from "@/lib/api";
import { stripeClient, getOrCreateStripeCustomer } from "@/lib/billing";

const PRICE_IDS: Record<"pro" | "plus", Record<"month" | "year", string>> = {
  pro: {
    month: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    year:  process.env.STRIPE_PRO_ANNUAL_PRICE_ID  ?? "",
  },
  plus: {
    month: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID ?? "",
    year:  process.env.STRIPE_PLUS_ANNUAL_PRICE_ID  ?? "",
  },
};

const Body = z.object({
  tier:     z.enum(["pro", "plus"]),
  interval: z.enum(["month", "year"]).default("month"),
});

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { tier, interval } = await parseJSON(req, Body);

    const tierPrices = PRICE_IDS[tier];
    const priceId = tierPrices[interval as "month" | "year"];
    if (!priceId) throw new Error(`price_id_not_configured for ${tier}/${interval}`);

    const customerId = await getOrCreateStripeCustomer(supabase, user.id, user.email!);
    const stripe = stripeClient();

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app?billing=success`,
      cancel_url:  `${origin}/pricing`,
      metadata: { supabase_user_id: user.id, tier },
      subscription_data: { metadata: { supabase_user_id: user.id, tier } },
      allow_promotion_codes: true,
    });

    return { url: session.url };
  });
}
