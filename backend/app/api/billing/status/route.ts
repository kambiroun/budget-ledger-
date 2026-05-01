/**
 * GET /api/billing/status
 * Returns the current user's subscription tier + period end.
 * Safe to call from the frontend.
 */
import { withAuth } from "@/lib/api";
import { getBillingProfile } from "@/lib/billing";

export async function GET() {
  return withAuth(async ({ supabase, user }) => {
    const profile = await getBillingProfile(supabase, user.id);
    return {
      subscription_status: profile.subscription_status,
      current_period_end: profile.current_period_end,
      has_byo_key: !!profile.anthropic_byo_key,
    };
  });
}
