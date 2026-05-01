/**
 * Front-of-pipeline helpers for the importer wizard.
 *
 *   parseFile(file)      → RawTable      (dispatches to the right parser)
 *   getInitialMapping()  → ColumnMapping (heuristic now; AI override later)
 *   refineMappingWithAI  → ColumnMapping (calls /api/ai/map-columns)
 *   buildReviewRows()    → ReviewRow[]   (normalize + dedupe + default decisions)
 *
 * Keeps wizard UI dumb — it just calls these in order and shows results.
 */
import type {
  RawTable, ColumnMapping, ReviewRow, DedupeVerdict,
} from "./types";
import {
  detectKind, parseDelimited, parseJSONFile, parseOfx,
  parseXlsx, parseText,
} from "./parsers";
// parsePdf is intentionally NOT imported here — pdfjs-dist v4+ requires a
// worker in browsers and lives in serverExternalPackages. PDF parsing is
// handled server-side via POST /api/import/parse-pdf.
import { normalizeRows, heuristicMapping } from "./normalize";
import { dedupeScan } from "./dedupe";

/**
 * Parse any supported file → RawTable. Never throws; problems land in
 * `table.warnings` so the UI can display them.
 */
export async function parseFile(file: File): Promise<RawTable> {
  const kind = detectKind(file.name, file.type);

  // Binary formats read as ArrayBuffer; text formats read as text.
  if (kind === "xlsx") {
    try { return await parseXlsx(await file.arrayBuffer(), file.name); }
    catch (e: any) {
      return { kind: "xlsx", filename: file.name, headers: [], rows: [],
               warnings: ["xlsx parse failed: " + (e?.message || e)] };
    }
  }
  if (kind === "pdf") {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/parse-pdf", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        throw new Error(json?.error || `http_${res.status}`);
      }
      return json.data as RawTable;
    } catch (e: any) {
      return { kind: "pdf", filename: file.name, headers: [], rows: [],
               warnings: ["pdf parse failed: " + (e?.message || e)] };
    }
  }
  if (kind === "image") {
    return { kind: "image", filename: file.name, headers: [], rows: [],
             warnings: ["Image/receipt imports aren't supported in the wizard yet — use the single-receipt inbox instead."] };
  }

  const text = await file.text();
  switch (kind) {
    case "csv":
    case "tsv":     return parseDelimited(text, file.name);
    case "json":    return parseJSONFile(text, file.name);
    case "ofx":     return parseOfx(text, file.name);
    case "text":    return parseText(text, file.name);
    case "unknown":
    default:        return parseText(text, file.name);
  }
}

/** First-pass mapping — name-matching heuristic, instant and offline-safe. */
export function getInitialMapping(table: RawTable): ColumnMapping {
  return heuristicMapping(table);
}

/**
 * Ask the server AI advisor for a better mapping. Samples up to 15 rows.
 * Returns the existing mapping on any error — we're never *worse* than the
 * heuristic.
 */
export async function refineMappingWithAI(table: RawTable, fallback: ColumnMapping): Promise<{
  mapping: ColumnMapping;
  error?: string;
}> {
  if (!table.headers.length || !table.rows.length) return { mapping: fallback };
  const sample = table.rows.slice(0, 15);

  try {
    const res = await fetch("/api/ai/map-columns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headers: table.headers, rows_sample: sample }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      return { mapping: fallback, error: json?.error || `http_${res.status}` };
    }
    const aiMap = json.data?.mapping as ColumnMapping;
    // Defensive: ensure every header has an entry (fill gaps from fallback).
    const cols = { ...aiMap.columns };
    for (const h of table.headers) {
      if (!cols[h]) cols[h] = fallback.columns[h] ?? "ignore";
    }
    return {
      mapping: {
        ...aiMap,
        columns: cols,
        rationale: aiMap.rationale || fallback.rationale,
      },
    };
  } catch (e: any) {
    return { mapping: fallback, error: e?.message ?? "ai_failed" };
  }
}

/**
 * Build the review-row list from the raw table + mapping:
 *   - normalize each row (parse date/amount/desc)
 *   - scan for duplicates (both in-batch and against existing txns)
 *   - set default `decision` based on verdict
 *
 * UI mutates decisions/overrides in-place afterward.
 */
export async function buildReviewRows(
  table: RawTable, mapping: ColumnMapping
): Promise<{ rows: ReviewRow[]; scan: { checked_against: number; intra_dup: number } }> {
  const normalized = normalizeRows(table, mapping);
  const dd = await dedupeScan(normalized);
  const rows: ReviewRow[] = normalized.map(n => {
    const verdict: DedupeVerdict = dd.verdicts[n.idx] ?? { kind: "unique" };
    // Default decision rules:
    //   - rows with fatal parse issues: skip (user can still force-import)
    //   - exact-dupes: skip by default (both in-batch and external)
    //   - fuzzy & unique: import
    const hasFatal = n.issues.some(s => s.startsWith("could not") || s.startsWith("no amount"));
    let decision: "import" | "skip" = "import";
    if (hasFatal) decision = "skip";
    else if (verdict.kind === "exact") decision = "skip";
    return { ...n, dedupe: verdict, decision };
  });
  return {
    rows,
    scan: { checked_against: dd.checked_against, intra_dup: dd.intra_batch_duplicates },
  };
}
