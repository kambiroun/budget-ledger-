import { z } from "zod";

/* ============================================================================
 * Shared primitives
 * ==========================================================================*/

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
export const isoTimestamp = z.string().datetime({ offset: true });
export const money = z.number().finite();

const baseMeta = {
  id: uuid,
  user_id: uuid,
  updated_at: isoTimestamp,
  deleted_at: isoTimestamp.nullable().optional(),
};

/* ============================================================================
 * Categories
 * ==========================================================================*/

export const CategoryCreate = z.object({
  id: uuid.optional(),            // client may generate for offline-first
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  is_income: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export const CategoryUpdate = CategoryCreate.partial();

export const Category = z.object({
  ...baseMeta,
  name: z.string(),
  color: z.string().nullable(),
  is_income: z.boolean(),
  sort_order: z.number().int(),
  created_at: isoTimestamp,
});

/* ============================================================================
 * Budgets
 * ==========================================================================*/

export const BudgetUpsert = z.object({
  id: uuid.optional(),
  category_id: uuid,
  amount: money.nonnegative(),
});

export const Budget = z.object({
  ...baseMeta,
  category_id: uuid,
  amount: money,
});

/* ============================================================================
 * Transactions
 * ==========================================================================*/

export const TransactionCreate = z.object({
  id: uuid.optional(),
  category_id: uuid.nullable().optional(),
  date: isoDate,
  description: z.string().min(1).max(500),
  amount: money,
  is_income: z.boolean().optional(),
  is_dupe: z.boolean().optional(),
  is_transfer: z.boolean().optional(),
  is_refund: z.boolean().optional(),
  split_of: uuid.nullable().optional(),
  ai_confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.enum(["csv", "paste", "manual", "demo", "import"]).optional(),
  source_file: z.string().max(200).nullable().optional(),
  raw: z.record(z.unknown()).nullable().optional(),
});

export const TransactionUpdate = TransactionCreate.partial();

export const Transaction = z.object({
  ...baseMeta,
  category_id: uuid.nullable(),
  date: isoDate,
  description: z.string(),
  amount: money,
  is_income: z.boolean(),
  is_dupe: z.boolean(),
  is_transfer: z.boolean(),
  is_refund: z.boolean(),
  split_of: uuid.nullable(),
  ai_confidence: z.number().nullable(),
  source: z.string().nullable(),
  source_file: z.string().nullable(),
  raw: z.record(z.unknown()).nullable(),
  created_at: isoTimestamp,
});

export const TransactionListQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category_id: uuid.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  include_deleted: z.coerce.boolean().optional(),
});

/* ============================================================================
 * Rules
 * ==========================================================================*/

export const RuleCreate = z.object({
  id: uuid.optional(),
  pattern: z.string().min(1).max(200),
  category_id: uuid,
  priority: z.number().int().optional(),
});

export const RuleUpdate = RuleCreate.partial();

export const Rule = z.object({
  ...baseMeta,
  pattern: z.string(),
  category_id: uuid,
  priority: z.number().int(),
  created_at: isoTimestamp,
});

/* ============================================================================
 * Merchant map
 * ==========================================================================*/

export const MerchantMapUpsert = z.object({
  merchant_key: z.string().min(1).max(200),
  category_id: uuid,
});

/* ============================================================================
 * Goals
 * ==========================================================================*/

export const GoalCreate = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(120),
  target: money.positive(),
  saved: money.nonnegative().optional(),
  target_date: isoDate.nullable().optional(),
});

export const GoalUpdate = GoalCreate.partial();

export const Goal = z.object({
  ...baseMeta,
  name: z.string(),
  target: money,
  saved: money,
  target_date: isoDate.nullable(),
  created_at: isoTimestamp,
});

/* ============================================================================
 * Profile
 * ==========================================================================*/

export const ProfileUpdate = z.object({
  display_name: z.string().min(1).max(80).optional(),
  rollover_enabled: z.boolean().optional(),
  pay_day: z.number().int().min(1).max(28).optional(),
  theme: z.enum(["light", "dark"]).optional(),
});

/* ============================================================================
 * Sync (used by offline engine in M3)
 * ==========================================================================*/

export const SyncPush = z.object({
  since: isoTimestamp.optional(),
  categories: z.array(CategoryUpdate.extend({ id: uuid, deleted_at: isoTimestamp.nullable().optional() })).optional(),
  budgets: z.array(BudgetUpsert.extend({ deleted_at: isoTimestamp.nullable().optional() })).optional(),
  transactions: z.array(TransactionUpdate.extend({ id: uuid, deleted_at: isoTimestamp.nullable().optional() })).optional(),
  rules: z.array(RuleUpdate.extend({ id: uuid, deleted_at: isoTimestamp.nullable().optional() })).optional(),
  goals: z.array(GoalUpdate.extend({ id: uuid, deleted_at: isoTimestamp.nullable().optional() })).optional(),
});

export type CategoryT = z.infer<typeof Category>;
export type BudgetT = z.infer<typeof Budget>;
export type TransactionT = z.infer<typeof Transaction>;
export type RuleT = z.infer<typeof Rule>;
export type GoalT = z.infer<typeof Goal>;
