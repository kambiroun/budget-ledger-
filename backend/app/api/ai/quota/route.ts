/**
 * GET /api/ai/quota — the user's remaining AI calls for today.
 * Surfaces the number the UI can display next to ⌘K / insights buttons.
 */
import { withAuth } from "@/lib/api";
import { getQuota } from "@/lib/ai/quota";

export async function GET() {
  return withAuth(async ({ supabase, user }) => {
    return await getQuota(supabase, user.id);
  });
}
