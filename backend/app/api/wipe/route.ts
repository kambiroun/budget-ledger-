import { NextRequest } from "next/server";
import { withAuth, parseJSON } from "@/lib/api";
import { z } from "zod";

/**
 * POST /api/wipe — nuke all per-user data.
 *
 * Body: { scope: "all" | "transactions" | "categories_and_budgets" | "goals" | "rules",
 *         confirm: "WIPE" }
 *
 * "all" is the sledgehammer for when demo/CSV imports left garbage behind.
 * RLS ensures we can only ever touch the caller's rows, but we pass user_id
 * explicitly too (belt + suspenders).
 *
 * Returns { deleted: { transactions, categories, budgets, rules, goals } }.
 */

const WipeBody = z.object({
  scope: z.enum(["all", "transactions", "categories_and_budgets", "goals", "rules"]),
  confirm: z.literal("WIPE"),
});

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const { scope } = await parseJSON(req, WipeBody);

    const counts = { transactions: 0, categories: 0, budgets: 0, rules: 0, goals: 0 };
    const uid = user.id;

    const wipe = async (table: keyof typeof counts) => {
      // Use a hard delete — soft-delete would leave rows around that RLS still returns.
      // The user explicitly asked to wipe.
      const { count, error } = await supabase
        .from(table).delete({ count: "exact" }).eq("user_id", uid);
      if (error) throw new Error(`${table}: ${error.message}`);
      counts[table] = count ?? 0;
    };

    // Order matters for FK integrity: children before parents.
    if (scope === "all" || scope === "transactions") await wipe("transactions");
    if (scope === "all" || scope === "rules") await wipe("rules");
    if (scope === "all" || scope === "goals") await wipe("goals");
    if (scope === "all" || scope === "categories_and_budgets") {
      // budgets FK → categories, so budgets first
      await wipe("budgets");
      // If scope is categories_and_budgets but there are still txns pointing
      // at these cats, the FK would block us. Null them out first.
      if (scope === "categories_and_budgets") {
        const { error } = await supabase
          .from("transactions").update({ category_id: null }).eq("user_id", uid);
        if (error) throw new Error("unlink txns: " + error.message);
      }
      await wipe("categories");
    }

    console.info(`[ledger] wipe scope=${scope} user=${uid.slice(0, 8)}…`, counts);
    return { scope, deleted: counts };
  });
}
