import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";

export type SubscriptionTier = "free" | "pro" | "plus" | "past_due" | "canceled";

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  canceled: 0,
  past_due: 1,
  pro: 2,
  plus: 3,
};

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

export interface ProfileBilling {
  subscription_status: SubscriptionTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  anthropic_byo_key: string | null;
}

export async function getBillingProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileBilling> {
  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, anthropic_byo_key")
    .eq("id", userId)
    .single();
  if (error) throw new Error("billing_profile_read_failed: " + error.message);
  return data as ProfileBilling;
}

/**
 * Enforce a minimum subscription tier.
 * BYO Anthropic key holders are always treated as Pro (they pay their own usage).
 * Throws 402 with an upgrade_url if the user doesn't qualify.
 *
 * Returns the user's BYO key if they have one (so AI routes can pass it to aiComplete),
 * or null if they're using the server's key.
 */
export async function requireTier(
  supabase: SupabaseClient,
  userId: string,
  minTier: "pro" | "plus",
): Promise<string | null> {
  const profile = await getBillingProfile(supabase, userId);

  // BYO key bypasses the tier check for pro-level features
  if (profile.anthropic_byo_key && minTier === "pro") {
    return profile.anthropic_byo_key;
  }

  const current = (profile.subscription_status ?? "free") as SubscriptionTier;
  if (TIER_RANK[current] >= TIER_RANK[minTier]) return null;

  throw new ApiError(402, "subscription_required", {
    current_tier: current,
    required_tier: minTier,
    upgrade_url: "/pricing",
  });
}

/**
 * Find or create a Stripe customer for this user.
 * Idempotent — if stripe_customer_id already exists on the profile, reuses it.
 */
export async function getOrCreateStripeCustomer(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<string> {
  const profile = await getBillingProfile(supabase, userId);
  if (profile.stripe_customer_id) return profile.stripe_customer_id;

  const stripe = stripeClient();
  const customer = await stripe.customers.create({ email, metadata: { supabase_user_id: userId } });

  await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}
