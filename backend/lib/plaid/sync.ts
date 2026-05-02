/**
 * Plaid /transactions/sync integration.
 *
 * Uses cursor-based pagination so only new/modified/removed transactions are
 * fetched since the last sync. New transactions get auto-categorized via the
 * user's rules (same engine as CSV import). Modified transactions preserve any
 * category the user has manually set.
 *
 * Plaid amount sign convention:
 *   positive = money leaving the account (expense/debit)
 *   negative = money entering the account (income/credit)
 */
import type { Transaction as PlaidTransaction } from "plaid";
import { plaidClient } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ItemSyncResult {
  added: number;
  modified: number;
  removed: number;
}

interface Rule {
  pattern: string;
  category_id: string;
}

function matchRule(description: string, rules: Rule[]): string | null {
  const lower = description.toLowerCase();
  for (const r of rules) {
    if (lower.includes(r.pattern.toLowerCase())) return r.category_id;
  }
  return null;
}

export async function syncItem(itemId: string, userId: string): Promise<ItemSyncResult> {
  const supabase = createAdminClient();

  const { data: item, error } = await supabase
    .from("plaid_items")
    .select("plaid_access_token, cursor")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  if (error || !item) throw new Error("Plaid item not found");

  // Fetch user's categorization rules once — applied to all new transactions
  const { data: rulesData } = await supabase
    .from("rules")
    .select("pattern, category_id, priority")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("priority", { ascending: false });
  const rules: Rule[] = rulesData ?? [];

  let added = 0;
  let modified = 0;
  let removed = 0;
  let cursor: string | undefined = item.cursor ?? undefined;
  let hasMore = true;

  while (hasMore) {
    const { data } = await plaidClient.transactionsSync({
      access_token: item.plaid_access_token,
      cursor,
      options: { include_personal_finance_category: true },
    });

    for (const txn of data.added) {
      if (txn.pending) continue;
      await insertTransaction(txn, userId, rules, supabase);
      added++;
    }

    for (const txn of data.modified) {
      if (txn.pending) continue;
      await updateTransaction(txn, userId, supabase);
      modified++;
    }

    for (const removed_txn of data.removed) {
      await softDeleteTransaction(removed_txn.transaction_id, userId, supabase);
      removed++;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await supabase
    .from("plaid_items")
    .update({
      cursor,
      last_synced_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq("id", itemId);

  return { added, modified, removed };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertTransaction(txn: PlaidTransaction, userId: string, rules: Rule[], supabase: any) {
  const isIncome = txn.amount < 0;
  const amount = Math.abs(txn.amount);
  const description = (txn.merchant_name || txn.name || "Unknown").slice(0, 500);
  const category_id = isIncome ? null : matchRule(description, rules);

  await supabase.from("transactions").insert({
    user_id: userId,
    date: txn.date,
    description,
    amount,
    is_income: isIncome,
    source: "plaid",
    plaid_transaction_id: txn.transaction_id,
    category_id,
    raw: {
      plaid_account_id: txn.account_id,
      merchant_name: txn.merchant_name ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category: (txn as any).personal_finance_category?.primary ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logo_url: (txn as any).logo_url ?? null,
    },
  });
}

// Modified transactions: update amount/date/description but preserve user's category.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateTransaction(txn: PlaidTransaction, userId: string, supabase: any) {
  const isIncome = txn.amount < 0;
  const amount = Math.abs(txn.amount);
  const description = (txn.merchant_name || txn.name || "Unknown").slice(0, 500);

  await supabase
    .from("transactions")
    .update({
      date: txn.date,
      description,
      amount,
      is_income: isIncome,
      raw: {
        plaid_account_id: txn.account_id,
        merchant_name: txn.merchant_name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category: (txn as any).personal_finance_category?.primary ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logo_url: (txn as any).logo_url ?? null,
      },
    })
    .eq("plaid_transaction_id", txn.transaction_id)
    .eq("user_id", userId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function softDeleteTransaction(plaidTransactionId: string, userId: string, supabase: any) {
  await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("plaid_transaction_id", plaidTransactionId)
    .eq("user_id", userId);
}
