/**
 * Import types — shared across parsers, AI mapping, review UI, commit.
 *
 * The pipeline:
 *   1. Parse any file → RawTable (headers + cell grid + detected kind)
 *   2. AI mapping advisor → ColumnMapping (which cols are date/desc/amount/etc)
 *   3. Normalize via mapping → NormalizedRow[] (date/description/amount/is_income)
 *   4. Dedupe candidates lookup → each row gets DedupeVerdict
 *   5. Autopilot categorize the remainder
 *   6. User reviews → commit → create transactions under an import_batch
 */

export type FileKind =
  | "csv" | "tsv" | "xlsx" | "json" | "ofx" | "pdf" | "image" | "text" | "unknown";

export interface RawTable {
  kind: FileKind;
  filename: string;
  headers: string[];
  rows: string[][];       // cells as strings; parsers normalize to strings
  /** Anything else the parser wants to pass along (e.g. sheet name, OFX block). */
  meta?: Record<string, any>;
  warnings: string[];
}

/** Columns the user's data could fill. Dates/desc/amount are required; the rest are best-effort. */
export type RoleName =
  | "date"
  | "description"
  | "amount"            // single column, signed or positive
  | "debit"             // two-column shape: money out
  | "credit"            // two-column shape: money in
  | "category"
  | "notes"
  | "ignore";

export interface ColumnMapping {
  /** header → role. unlisted headers default to "ignore". */
  columns: Record<string, RoleName>;
  /**
   * Convention when `amount` is a single column:
   *   "negative_is_spending" — negatives = outflow, positives = income (most US banks)
   *   "positive_is_spending" — positives = outflow (some credit-card exports)
   */
  amount_convention?: "negative_is_spending" | "positive_is_spending";
  /**
   * Date format hint. "auto" tries ISO, US, EU in order. Explicit values help
   * when auto-detect is ambiguous (e.g. 03/04/2024 — Mar 4 or Apr 3?).
   */
  date_format?: "auto" | "iso" | "us" | "eu";
  /** If the file has no category column, every row falls into this (id may be null). */
  default_category_id?: string | null;
  /** Short human-readable note on how the mapping was derived. */
  rationale?: string;
}

export interface NormalizedRow {
  /** Index in the source table. Stable across the pipeline for UI keying. */
  idx: number;
  date: string;           // YYYY-MM-DD
  description: string;
  amount: number;         // absolute value
  is_income: boolean;
  category_hint?: string; // raw value from the category column if present
  notes?: string;
  /** Any problems normalizing this row — surfaced in the review UI. */
  issues: string[];
  /** The raw cells by header, for debugging + DB raw column. */
  raw: Record<string, string>;
}

export interface DedupeCandidate {
  existing_id: string;
  existing_date: string;
  existing_description: string;
  existing_amount: number;
  /** 0..1 — higher = more likely a duplicate. */
  score: number;
  /** Human-readable reason: "exact date+amount+description", "fuzzy: ±1 day, same amount" */
  reason: string;
}

export type DedupeVerdict =
  | { kind: "unique" }
  | { kind: "exact"; candidates: DedupeCandidate[] }
  | { kind: "fuzzy"; candidates: DedupeCandidate[] };

export interface ReviewRow extends NormalizedRow {
  dedupe: DedupeVerdict;
  /** User's decision — defaults follow dedupe: unique→import, exact→skip, fuzzy→import. */
  decision: "import" | "skip";
  /** Autopilot suggestion. null until categorize step runs. */
  suggested_category_id?: string | null;
  suggested_category_name?: string | null;
  suggested_confidence?: number;
  suggested_source?: "rule" | "cache" | "llm" | "none";
  /** User override. If set, wins over suggestion. */
  override_category_id?: string | null;
}

export interface ImportPlan {
  batch_id?: string;            // set after save
  filename: string;
  kind: FileKind;
  mapping: ColumnMapping;
  rows: ReviewRow[];
  warnings: string[];
}
