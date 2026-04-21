/**
 * Dedupe — compare a batch of NormalizedRow against the user's existing
 * transactions and flag exact / fuzzy matches.
 *
 * Runs client-side against the local IndexedDB mirror, then pulls from the
 * network if the mirror is stale. We pick a generous date window (±3 days)
 * for fuzzy because banks often differ on posting vs transaction dates.
 *
 * Scoring (0..1):
 *   - exact date + exact amount + exact description    → 1.0   ("exact")
 *   - exact date + exact amount + fuzzy description    → 0.9   ("exact")
 *   - date ±3 days + exact amount + fuzzy description  → 0.7   ("fuzzy")
 *   - date ±7 days + exact amount                      → 0.5   ("fuzzy")
 *
 * Anything below 0.5 we treat as unique.
 */
import { db } from "@/lib/db/dexie";
import type { NormalizedRow, DedupeVerdict, DedupeCandidate } from "./types";

function normDesc(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db_ = new Date(b + "T00:00:00Z").getTime();
  return Math.abs(Math.round((da - db_) / 86400000));
}

/** Simple token-overlap similarity, 0..1 */
function similarity(a: string, b: string): number {
  const ta = new Set(normDesc(a).split(" ").filter(Boolean));
  const tb = new Set(normDesc(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  ta.forEach(t => { if (tb.has(t)) hits++; });
  return hits / Math.max(ta.size, tb.size);
}

/** Scan existing transactions for possible duplicates of the given row. */
function scoreCandidate(row: NormalizedRow, existing: any): DedupeCandidate | null {
  const amountMatches = Math.abs(Number(existing.amount) - row.amount) < 0.005;
  if (!amountMatches) return null;

  const dayDiff = daysBetween(row.date, existing.date);
  if (dayDiff > 7) return null;

  const descSim = similarity(row.description, existing.description || "");
  const sameDay = dayDiff === 0;
  const sameDesc = descSim >= 0.95;
  const fuzzyDesc = descSim >= 0.5;

  let score = 0;
  let reason = "";
  if (sameDay && sameDesc) { score = 1.0; reason = "same date, amount, and description"; }
  else if (sameDay && fuzzyDesc) { score = 0.9; reason = "same date + amount, similar description"; }
  else if (sameDay) { score = 0.7; reason = "same date + amount"; }
  else if (dayDiff <= 3 && fuzzyDesc) { score = 0.7; reason = `±${dayDiff}d, similar description`; }
  else if (dayDiff <= 3) { score = 0.55; reason = `±${dayDiff}d, same amount`; }
  else if (dayDiff <= 7 && fuzzyDesc) { score = 0.5; reason = `±${dayDiff}d, similar description`; }
  else return null;

  return {
    existing_id: existing.id,
    existing_date: existing.date,
    existing_description: existing.description,
    existing_amount: Number(existing.amount),
    score,
    reason,
  };
}

export interface DedupeScanResult {
  verdicts: Record<number, DedupeVerdict>;   // row.idx → verdict
  checked_against: number;                    // how many existing txns we scanned
  intra_batch_duplicates: number;
}

/**
 * Scan `rows` against existing txns. Returns a verdict per row.idx.
 * Also flags in-batch duplicates (the same CSV row appearing twice) —
 * the second occurrence gets an "exact" candidate pointing at the first.
 */
export async function dedupeScan(rows: NormalizedRow[]): Promise<DedupeScanResult> {
  const verdicts: Record<number, DedupeVerdict> = {};

  // Load existing txns from local cache. Network caller should have refreshed
  // before calling us so this is as fresh as we're going to get.
  const existing = await db.transactions
    .filter((t: any) => !t.deleted_at)
    .toArray();

  // Index existing by `date|amountBucket` for O(1)-ish candidate lookup.
  // Bucket: amount rounded to cents, date ±7 days window explored.
  const byKey = new Map<string, any[]>();
  for (const e of existing) {
    const amt = Math.round(Number(e.amount) * 100) / 100;
    for (let dd = -7; dd <= 7; dd++) {
      const base = new Date(e.date + "T00:00:00Z");
      base.setUTCDate(base.getUTCDate() + dd);
      const k = `${base.toISOString().slice(0, 10)}|${amt.toFixed(2)}`;
      const list = byKey.get(k) ?? [];
      list.push(e);
      byKey.set(k, list);
    }
  }

  // Track in-batch dupes
  const seenInBatch: Record<string, NormalizedRow> = {};
  let intraDup = 0;

  for (const row of rows) {
    if (row.issues.length && row.issues.some(s => s.startsWith("could not"))) {
      // Rows with parse issues can't be deduped meaningfully
      verdicts[row.idx] = { kind: "unique" };
      continue;
    }
    const key = `${row.date}|${row.amount.toFixed(2)}`;

    // Intra-batch: has this same (date|amount|desc) appeared already?
    const intraKey = `${key}|${normDesc(row.description)}`;
    if (seenInBatch[intraKey]) {
      intraDup++;
      verdicts[row.idx] = {
        kind: "exact",
        candidates: [{
          existing_id: `__batch_${seenInBatch[intraKey].idx}`,
          existing_date: seenInBatch[intraKey].date,
          existing_description: seenInBatch[intraKey].description,
          existing_amount: seenInBatch[intraKey].amount,
          score: 1.0,
          reason: `duplicate of row ${seenInBatch[intraKey].idx + 1} in this import`,
        }],
      };
      continue;
    }
    seenInBatch[intraKey] = row;

    // External: scan the pre-indexed ±7d window
    const candidates: DedupeCandidate[] = [];
    const bucket = byKey.get(key) ?? [];
    for (const e of bucket) {
      const c = scoreCandidate(row, e);
      if (c) candidates.push(c);
    }
    candidates.sort((a, b) => b.score - a.score);
    // Dedupe by existing_id
    const seenIds = new Set<string>();
    const uniq = candidates.filter(c => seenIds.has(c.existing_id) ? false : (seenIds.add(c.existing_id), true)).slice(0, 3);

    if (!uniq.length) verdicts[row.idx] = { kind: "unique" };
    else if (uniq[0].score >= 0.9) verdicts[row.idx] = { kind: "exact", candidates: uniq };
    else verdicts[row.idx] = { kind: "fuzzy", candidates: uniq };
  }

  return {
    verdicts,
    checked_against: existing.length,
    intra_batch_duplicates: intraDup,
  };
}
