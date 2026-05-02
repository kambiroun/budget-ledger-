/**
 * Plaid /transactions/sync integration.
 *
 * Uses cursor-based pagination to fetch only new/updated/removed transactions
 * since the last sync. Transactions are upserted into the transactions table
 * using plaid_transaction_id as the conflict key, making re-syncing idempotent.
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

export async function syncItem(itemId: string, userId: string): Promise<ItemSyncResult> {
  const supabase = createAdminClient();

  const { data: item, error } = await supabase
    .from("plaid_items")
    .select("plaid_access_token, cursor")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  if (error || !item) throw new Error("Plaid item not found");

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
      await upsertTransaction(txn, userId, supabase);
      added++;
    }

    for (const txn of data.modified) {
      if (txn.pending) continue;
      await upsertTransaction(txn, userId, supabase);
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

async function upsertTransaction(
  txn: PlaidTransaction,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  const isIncome = txn.amount < 0;
  const amount = Math.abs(txn.amount);
  const description = (txn.merchant_name || txn.name || "Unknown").slice(0, 500);

  const payload = {
    user_id: userId,
    date: txn.date,
    description,
    amount,
    is_income: isIncome,
    source: "plaid",
    plaid_transaction_id: txn.transaction_id,
    raw: {
      plaid_account_id: txn.account_id,
      merchant_name: txn.merchant_name ?? null,
      category: (txn as any).personal_finance_category?.primary ?? null,
      logo_url: (txn as any).logo_url ?? null,
    },
  };

  await supabase
    .from("transactions")
    .upsert(payload, { onConflict: "plaid_transaction_id" });
}

async function softDeleteTransaction(
  plaidTransactionId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("plaid_transaction_id", plaidTransactionId)
    .eq("user_id", userId);
}
