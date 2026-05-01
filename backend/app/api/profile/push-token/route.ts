import { NextRequest } from "next/server";
import { withAuth, parseJSON } from "@/lib/api";
import { z } from "zod";

const PushTokenBody = z.object({
  token: z.string().min(1).max(512),
});

/** POST /api/profile/push-token — store device APNs/FCM token */
export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { token } = await parseJSON(req, PushTokenBody);
    const { error } = await supabase
      .from("profiles")
      .update({ push_token: token })
      .eq("id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
