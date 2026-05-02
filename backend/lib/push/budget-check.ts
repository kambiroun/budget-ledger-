/**
 * Budget overage check triggered after a new expense transaction is inserted.
 *
 * Sends a push notification the first time a category crosses its monthly budget —
 * i.e. spending was under budget before this transaction and is at/over after.
 * Skips: income transactions, transactions without a category, users without a
 * push token, or users who have opted out of budget overage alerts.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "./fcm";

interface InsertedTxn {
  user_id: string;
  category_id: string | null;
  amount: number;
  is_income: boolean;
  date: string; // YYYY-MM-DD
}

export async function checkBudgetOverage(txn: InsertedTxn): Promise<void> {
  if (txn.is_income || !txn.category_id) return;

  const supabase = createAdminClient();

  // Fetch user's profile: push token + notification pref
  const { data: profile } = await supabase
    .from("profiles")
    .select("push_token, notif_budget_overage")
    .eq("id", txn.user_id)
    .single();

  if (!profile?.push_token || !profile.notif_budget_overage) return;

  // Fetch the budget for this category
  const { data: budget } = await supabase
    .from("budgets")
    .select("amount")
    .eq("user_id", txn.user_id)
    .eq("category_id", txn.category_id)
    .is("deleted_at", null)
    .single();

  if (!budget || budget.amount <= 0) return;

  // Sum all expense transactions in this category for the same calendar month
  const [year, month] = txn.date.split("-");
  const monthStart = `${year}-${month}-01`;
  // Last day of month via next-month minus one day
  const nextMonth = new Date(`${year}-${month}-01`);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);

  const { data: agg } = await supabase
    .from("transactions")
    .select("amount")
    .eq("user_id", txn.user_id)
    .eq("category_id", txn.category_id)
    .eq("is_income", false)
    .is("deleted_at", null)
    .gte("date", monthStart)
    .lt("date", monthEnd);

  const totalSpent = (agg ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const previousSpent = totalSpent - txn.amount;

  // Only notify on the first crossing
  if (previousSpent >= budget.amount || totalSpent < budget.amount) return;

  // Fetch category name for a readable notification
  const { data: cat } = await supabase
    .from("categories")
    .select("name")
    .eq("id", txn.category_id)
    .single();

  const categoryName = cat?.name ?? "a category";
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  await sendPush({
    token: profile.push_token,
    title: "Budget exceeded",
    body: `You've spent ${fmt(totalSpent)} in ${categoryName} (budget: ${fmt(budget.amount)})`,
    route: "#/budget",
  });
}
