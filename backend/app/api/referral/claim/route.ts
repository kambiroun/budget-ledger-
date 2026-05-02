/**
 * POST /api/referral/claim
 * Body: { code: string }
 *
 * Links the current user to the owner of the referral code.
 * Idempotent — no-op if the user was already referred or if the code is
 * their own.
 */
import { NextRequest } from "next/server";
import { withAuth, parseJSON } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { track } from "@/lib/analytics";

const Body = z.object({ code: z.string().min(1).max(32) });

export async function POST(req: NextRequest) {
  return withAuth(async ({ user }) => {
    const { code } = await parseJSON(req, Body);

    const admin = createAdminClient();

    // Check current user's profile — skip if already referred
    const { data: myProfile } = await admin
      .from("profiles")
      .select("referred_by, referral_code")
      .eq("id", user.id)
      .single();

    if (myProfile?.referred_by) return { claimed: false, reason: "already_referred" };
    // Can't refer yourself
    if (myProfile?.referral_code === code) return { claimed: false, reason: "self_referral" };

    // Find the referrer by code
    const { data: referrer } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .single();

    if (!referrer) return { claimed: false, reason: "code_not_found" };

    await admin
      .from("profiles")
      .update({ referred_by: referrer.id })
      .eq("id", user.id);

    track("referral_claimed", { referrer_id: referrer.id });

    return { claimed: true };
  });
}
