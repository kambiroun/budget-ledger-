import Dexie, { type Table } from "dexie";

/* ============================================================================
 * Mirror of the Postgres schema — every row we sync down lives here too.
 * Tables are keyed by server `id` (uuid). `updated_at` lets us do
 * last-write-wins merges; `_dirty` flags rows that have pending writes.
 * ==========================================================================*/

export type DirtyFlag = 0 | 1;

export interface CategoryRow {
  id: string; user_id?: string;
  name: string; color: string | null; sort_order: number;
  updated_at: string; deleted_at: string | null; created_at?: string;
  _dirty?: DirtyFlag;
}

export interface BudgetRow {
  id: string; user_id?: string;
  category_id: string; amount: number;
  updated_at: string; deleted_at: string | null;
  _dirty?: DirtyFlag;
}

export interface TransactionRow {
  id: string; user_id?: string;
  category_id: string | null;
  date: string;
  description: string;
  amount: number;
  is_income: boolean; is_dupe: boolean; is_transfer: boolean; is_refund: boolean;
  split_of: string | null;
  ai_confidence: number | null;
  source: string | null;
  source_file: string | null;
  raw: Record<string, unknown> | null;
  updated_at: string; deleted_at: string | null; created_at?: string;
  _dirty?: DirtyFlag;
}

export interface RuleRow {
  id: string; user_id?: string;
  pattern: string; category_id: string; priority: number;
  updated_at: string; deleted_at: string | null;
  _dirty?: DirtyFlag;
}

export interface GoalRow {
  id: string; user_id?: string;
  name: string; target: number; saved: number; target_date: string | null;
  updated_at: string; deleted_at: string | null;
  _dirty?: DirtyFlag;
}

export interface ProfileRow {
  id: string; email: string; display_name: string | null;
  rollover_enabled: boolean; pay_day: number; theme: "light" | "dark";
  updated_at: string;
}

/**
 * Queued write — anything that failed to POST/PATCH/DELETE while offline.
 * The sync engine drains this FIFO, retrying with exponential backoff.
 */
export interface PendingOp {
  id?: number;                   // auto-increment
  op: "create" | "update" | "delete";
  table: "categories" | "budgets" | "transactions" | "rules" | "goals" | "profile";
  row_id: string;                // server id (uuid, or "profile")
  payload: unknown;              // body to send
  created_at: string;
  attempts: number;
  last_error?: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

class BudgetDB extends Dexie {
  categories!: Table<CategoryRow, string>;
  budgets!: Table<BudgetRow, string>;
  transactions!: Table<TransactionRow, string>;
  rules!: Table<RuleRow, string>;
  goals!: Table<GoalRow, string>;
  profile!: Table<ProfileRow, string>;
  pending!: Table<PendingOp, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("budget-ledger");
    this.version(1).stores({
      // Comma-separated index list; first entry is primary key.
      // Prefix with '&' for unique, '*' for multi-entry. '_dirty' lets the
      // sync engine query all dirty rows quickly.
      categories:   "id, sort_order, _dirty, deleted_at",
      budgets:      "id, category_id, _dirty, deleted_at",
      transactions: "id, date, category_id, _dirty, deleted_at",
      rules:        "id, priority, _dirty, deleted_at",
      goals:        "id, _dirty, deleted_at",
      profile:      "id",
      pending:      "++id, table, row_id, created_at",
      meta:         "key",
    });
  }
}

/** Singleton — Dexie is safe to instantiate once per app. */
export const db = new BudgetDB();

/** Convenience: scope by current user id stashed in meta. */
export async function setCurrentUserId(userId: string) {
  await db.meta.put({ key: "user_id", value: userId });
}
export async function getCurrentUserId(): Promise<string | null> {
  const row = await db.meta.get("user_id");
  return (row?.value as string) ?? null;
}
