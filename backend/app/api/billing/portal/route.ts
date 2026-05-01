/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session so the user can manage their
 * subscription (cancel, update payment method, view invoices).
 *
 * Returns { url } — redirect the browser there.
 */
import { withAuth } from "@/lib/api";
import { stripeClient, getBillingProfile } from "@/lib/billing";
import { ApiError } from "@/lib/api";

export async function POST() {
  return withAuth(async ({ supabase, user }) => {
    const profile = await getBillingProfile(supabase, user.id);
    if (!profile.stripe_customer_id) {
      throw new ApiError(400, "no_stripe_customer", {
        message: "You don't have an active subscription to manage.",
      });
    }

    const stripe = stripeClient();
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/app`,
    });

    return { url: session.url };
  });
}
