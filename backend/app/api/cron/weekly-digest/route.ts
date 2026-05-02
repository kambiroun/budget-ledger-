/**
 * POST /api/cron/weekly-digest
 *
 * Called weekly by Vercel Cron (schedule: "0 9 * * 1" — Monday 09:00 UTC).
 * For each user with notif_weekly_digest enabled, calculates last week's
 * spending and sends a digest email via Resend.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { buildWeeklyDigestEmail } from "@/lib/email/templates/weekly-digest";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Pro: up to 300s; Hobby: 10s — set conservatively

/** Returns the Monday and Sunday of the previous calendar week (UTC). */
function lastWeekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon…
  // Days since last Monday
  const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMon = new Date(now);
  lastMon.setUTCDate(now.getUTCDate() - daysToLastMon - 7);
  lastMon.setUTCHours(0, 0, 0, 0);

  const lastSun = new Date(lastMon);
  lastSun.setUTCDate(lastMon.getUTCDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  const start = lastMon.toISOString().slice(0, 10);
  // end is exclusive (next Monday)
  const nextMon = new Date(lastMon);
  nextMon.setUTCDate(lastMon.getUTCDate() + 7);
  const end = nextMon.toISOString().slice(0, 10);

  return { start, end, label: `${fmt(lastMon)} – ${fmt(lastSun)}` };
}

export async function POST(req: NextRequest) {
  // Verify cron secret
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== expectedAuth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://budget-ledger.vercel.app";

  // Fetch all profiles with weekly digest enabled
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, display_name, notif_weekly_digest")
    .eq("notif_weekly_digest", true);

  if (profilesError) {
    console.error("[cron/weekly-digest] profiles query error", profilesError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const { start, end, label } = lastWeekRange();
  let sent = 0;
  let skipped = 0;

  for (const profile of profiles ?? []) {
    try {
      // Get user email from auth
      const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
      const email = authUser?.user?.email;
      if (!email) { skipped++; continue; }

      // Fetch categories for this user
      const { data: cats } = await admin
        .from("categories")
        .select("id, name, color")
        .eq("user_id", profile.id)
        .is("deleted_at", null);

      // Fetch budgets
      const { data: budgets } = await admin
        .from("budgets")
        .select("category_id, amount")
        .eq("user_id", profile.id)
        .is("deleted_at", null);

      const budgetByCat: Record<string, number> = {};
      for (const b of budgets ?? []) budgetByCat[b.category_id] = Number(b.amount);

      // Fetch last week's expense transactions
      const { data: txns } = await admin
        .from("transactions")
        .select("category_id, amount")
        .eq("user_id", profile.id)
        .eq("is_income", false)
        .is("deleted_at", null)
        .gte("date", start)
        .lt("date", end);

      const spentByCat: Record<string, number> = {};
      let totalSpent = 0;
      for (const t of txns ?? []) {
        const cid = t.category_id ?? "__uncategorized__";
        spentByCat[cid] = (spentByCat[cid] ?? 0) + Number(t.amount);
        totalSpent += Number(t.amount);
      }

      if (totalSpent === 0) { skipped++; continue; } // Nothing to report

      const totalBudget = Object.values(budgetByCat).reduce((s, v) => s + v, 0);

      const categoryData = (cats ?? []).map((c) => ({
        name: c.name,
        color: c.color,
        spent: spentByCat[c.id] ?? 0,
        budget: budgetByCat[c.id] ?? 0,
      }));

      const { subject, html } = buildWeeklyDigestEmail({
        displayName: profile.display_name ?? null,
        weekLabel: label,
        totalSpent,
        totalBudget,
        categories: categoryData,
        appUrl,
      });

      const ok = await sendEmail({ to: email, subject, html });
      if (ok) sent++; else skipped++;
    } catch (e) {
      console.error("[cron/weekly-digest] error for user", profile.id, e);
      skipped++;
    }
  }

  console.log(`[cron/weekly-digest] done — sent=${sent} skipped=${skipped} week=${start}`);
  return NextResponse.json({ ok: true, sent, skipped, week: start });
}
