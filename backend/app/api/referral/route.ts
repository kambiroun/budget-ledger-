/**
 * GET /api/referral
 *
 * Returns the current user's referral code, their shareable link, and how
 * many people have signed up via their code. Generates the code lazily if
 * the profile row predates the referral migration.
 */
import { withAuth } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  return withAuth(async ({ user }) => {
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", user.id)
      .single();

    let code = profile?.referral_code as string | null;

    // Lazily generate code for profiles that predate migration 0009
    if (!code) {
      code = user.id.replace(/-/g, "").slice(0, 8);
      await admin
        .from("profiles")
        .update({ referral_code: code })
        .eq("id", user.id);
    }

    const { count } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("referred_by", user.id);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return {
      code,
      link: `${appUrl}/sign-up?ref=${code}`,
      referred_count: count ?? 0,
    };
  });
}
