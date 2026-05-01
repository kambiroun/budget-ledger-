/**
 * POST /api/billing/webhook
 *
 * Handles Stripe webhook events. Stripe calls this; it is NOT called by our
 * frontend. Must be reachable without authentication.
 *
 * Handled events:
 *   checkout.session.completed         → activate subscription
 *   customer.subscription.updated      → sync status + period_end
 *   customer.subscription.deleted      → downgrade to free
 *   invoice.payment_failed             → mark past_due
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeClient } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function syncSubscription(
  supabase: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
  overrideTier?: string,
) {
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) {
    console.warn("[billing/webhook] subscription missing supabase_user_id metadata", sub.id);
    return;
  }

  const rawStatus = sub.status; // active | past_due | canceled | etc.
  let subscriptionStatus: string;

  if (overrideTier === "free" || rawStatus === "canceled") {
    subscriptionStatus = "free";
  } else if (rawStatus === "past_due") {
    subscriptionStatus = "past_due";
  } else if (rawStatus === "active" || rawStatus === "trialing") {
    subscriptionStatus = (sub.metadata?.tier as string) ?? "pro";
  } else {
    subscriptionStatus = "free";
  }

  const rawSub = sub as any;
  const periodEnd = rawSub.current_period_end
    ? new Date(rawSub.current_period_end * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_status: subscriptionStatus,
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer as string,
      current_period_end: periodEnd,
    })
    .eq("id", userId);

  if (error) console.error("[billing/webhook] profiles update failed", error.message);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: Stripe.Event;
  try {
    const stripe = stripeClient();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e: any) {
    console.error("[billing/webhook] signature verification failed", e.message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const supabase = createClient();

  // Idempotency — skip if we've already processed this event
  const { data: existing } = await supabase
    .from("billing_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const stripe = stripeClient();
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          // Copy tier from session metadata to subscription metadata if missing
          if (!sub.metadata?.tier && session.metadata?.tier) {
            await stripe.subscriptions.update(sub.id, {
              metadata: { ...sub.metadata, tier: session.metadata.tier, supabase_user_id: session.metadata.supabase_user_id },
            });
            sub.metadata = { ...sub.metadata, tier: session.metadata.tier, supabase_user_id: session.metadata.supabase_user_id };
          }
          await syncSubscription(supabase, sub);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(supabase, sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(supabase, sub, "free");
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const subId = invoice.subscription ?? invoice.subscription_id ?? null;
        if (subId) {
          const stripe = stripeClient();
          const sub = await stripe.subscriptions.retrieve(subId as string);
          await syncSubscription(supabase, sub);
        }
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }

    // Record event for idempotency / audit
    const userId = (event.data.object as any)?.metadata?.supabase_user_id ?? null;
    await supabase.from("billing_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      user_id: userId,
      payload: event.data.object as any,
    });
  } catch (e: any) {
    console.error("[billing/webhook] handler error", e.message);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
