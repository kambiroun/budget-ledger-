/**
 * Universal file parser — dispatches by file kind, returns a normalized RawTable
 * ({ headers, rows, warnings }) regardless of input format.
 *
 * Kinds handled:
 *   - csv / tsv     → parseDelimited() (hand-rolled RFC4180-ish with auto-delim)
 *   - xlsx          → parseXlsx()     (xlsx npm lib, dynamically imported)
 *   - json          → parseJSON()     (array of objects, or legacy envelope)
 *   - ofx / qfx     → parseOfx()      (SGML-ish; regex-based)
 *   - pdf           → parsePdf()      (pdfjs-dist, dynamically imported)
 *   - image         → parseImage()    → returns a synthesized RawTable from vision
 *   - text          → parseText()     → best-effort line-splitter
 *
 * `detectKind(filename, mime)` picks a format by extension first, then mime,
 * falling back to sniffing the first ~2KB.
 */
import type { RawTable, FileKind } from "./types";

/* ============================================================================
 * Kind detection
 * ==========================================================================*/

export function detectKind(filename: string, mime: string, sample?: string): FileKind {
  const n = filename.toLowerCase();
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".tsv") || n.endsWith(".tab")) return "tsv";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "xlsx";
  if (n.endsWith(".json")) return "json";
  if (n.endsWith(".ofx") || n.endsWith(".qfx")) return "ofx";
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".txt")) return "text";
  if (n.match(/\.(png|jpe?g|webp|gif|bmp|heic)$/i)) return "image";

  if (mime) {
    if (mime.includes("csv")) return "csv";
    if (mime.includes("tab-separated")) return "tsv";
    if (mime.includes("spreadsheet") || mime.includes("excel")) return "xlsx";
    if (mime.includes("json")) return "json";
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("text/")) return "text";
  }

  // Sniff
  if (sample) {
    const s = sample.trim();
    if (s.startsWith("{") || s.startsWith("[")) return "json";
    if (s.startsWith("<OFX") || s.includes("OFXHEADER")) return "ofx";
    if (s.includes("\t") && !s.includes(",")) return "tsv";
    if (s.includes(",")) return "csv";
  }
  return "unknown";
}

/* ============================================================================
 * CSV / TSV
 * ==========================================================================*/

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim().replace(/^"+|"+$/g, ""));
}

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && counts[ch] !== undefined) counts[ch]++;
  }
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return best[1] > 0 ? best[0] : ",";
}

/**
 * Parse delimited text. Handles quoted fields, auto-detects delimiter,
 * skips blank lines and obvious junk rows above the real header.
 */
export function parseDelimited(text: string, filename: string, forceDelim?: string): RawTable {
  const warnings: string[] = [];
  const stripped = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const allLines = stripped.split("\n").filter(l => l.trim().length > 0);
  if (allLines.length < 1) {
    return { kind: "csv", filename, headers: [], rows: [], warnings: ["empty file"] };
  }

  // Some bank CSVs prefix 3-10 rows of "Account: XYZ" junk before the actual header.
  // Heuristic: the real header row is the first row with >=3 delimiter-split cells
  // AND whose cells are mostly non-numeric.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, allLines.length); i++) {
    const d = forceDelim || detectDelimiter(allLines[i]);
    const cells = splitLine(allLines[i], d);
    if (cells.length < 3) continue;
    const nonNumeric = cells.filter(c => c && !/^[-$()\d.,\s]+$/.test(c)).length;
    if (nonNumeric >= Math.max(2, Math.floor(cells.length / 2))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx > 0) warnings.push(`skipped ${headerIdx} junk row(s) before header`);

  const delim = forceDelim || detectDelimiter(allLines[headerIdx]);
  const kind: FileKind = delim === "\t" ? "tsv" : "csv";
  const headers = splitLine(allLines[headerIdx], delim).map(h => h || `column_${Math.random().toString(36).slice(2, 6)}`);
  // Deduplicate headers
  const seen: Record<string, number> = {};
  const uniqHeaders = headers.map(h => {
    if (seen[h] === undefined) { seen[h] = 0; return h; }
    seen[h]++;
    return `${h}_${seen[h]}`;
  });

  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const cells = splitLine(allLines[i], delim);
    if (cells.every(c => !c)) continue;
    // Pad/trim to header length
    while (cells.length < uniqHeaders.length) cells.push("");
    if (cells.length > uniqHeaders.length) cells.length = uniqHeaders.length;
    rows.push(cells);
  }

  if (!rows.length) warnings.push("no data rows after header");
  return { kind, filename, headers: uniqHeaders, rows, warnings };
}

/* ============================================================================
 * JSON — handles: array of flat objects, legacy { transactions: [...] } envelope,
 *                 or nested { data: [...] } shapes. Flattens objects to headers.
 * ==========================================================================*/

export function parseJSONFile(text: string, filename: string): RawTable {
  const warnings: string[] = [];
  let parsed: any;
  try { parsed = JSON.parse(text); }
  catch (e: any) {
    return { kind: "json", filename, headers: [], rows: [], warnings: [`invalid JSON: ${e.message}`] };
  }

  // Find the array: prefer the largest array of objects we can see.
  let arr: any[] | null = null;
  const candidates: { path: string; val: any[] }[] = [];
  const visit = (v: any, path: string) => {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
      candidates.push({ path, val: v });
    } else if (v && typeof v === "object") {
      for (const [k, vv] of Object.entries(v)) visit(vv, path ? `${path}.${k}` : k);
    }
  };
  if (Array.isArray(parsed)) arr = parsed;
  else {
    visit(parsed, "");
    // Prefer "transactions" / "data" / "rows" / "items" paths; else the longest.
    const preferred = candidates.find(c => /transactions?|data|rows|items|records/i.test(c.path));
    arr = (preferred ?? candidates.sort((a, b) => b.val.length - a.val.length)[0])?.val ?? null;
    if (arr && candidates.length > 1) warnings.push(`picked path "${preferred?.path ?? candidates[0].path}" (${arr.length} rows)`);
  }
  if (!arr) {
    return { kind: "json", filename, headers: [], rows: [], warnings: ["no array of objects found in JSON"] };
  }

  // Union of all keys, preserving first-seen order
  const headerSet: string[] = [];
  for (const o of arr) {
    if (!o || typeof o !== "object") continue;
    for (const k of Object.keys(o)) if (!headerSet.includes(k)) headerSet.push(k);
  }
  const rows = arr.map(o => headerSet.map(h => {
    const v = o?.[h];
    if (v == null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }));

  return { kind: "json", filename, headers: headerSet, rows, warnings };
}

/* ============================================================================
 * OFX / QFX — SGML-ish bank statement format
 * ==========================================================================*/

export function parseOfx(text: string, filename: string): RawTable {
  const warnings: string[] = [];
  // OFX tags are <TAG>value (no close on leaves). Grab STMTTRN blocks.
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  if (!blocks.length) {
    return { kind: "ofx", filename, headers: [], rows: [], warnings: ["no <STMTTRN> blocks found"] };
  }
  const headerSet = ["TRNTYPE", "DTPOSTED", "TRNAMT", "FITID", "NAME", "MEMO", "CHECKNUM"];
  const getTag = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}>([^\n\r<]*)`, "i"));
    return m ? m[1].trim() : "";
  };
  const rows = blocks.map(b => headerSet.map(h => getTag(b, h)));
  // Normalize DTPOSTED (YYYYMMDD[HHMMSS...]) → YYYY-MM-DD
  const dtIdx = headerSet.indexOf("DTPOSTED");
  for (const r of rows) {
    const d = r[dtIdx];
    const m = d.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) r[dtIdx] = `${m[1]}-${m[2]}-${m[3]}`;
  }
  return { kind: "ofx", filename, headers: headerSet, rows, warnings };
}

/* ============================================================================
 * XLSX — needs the `xlsx` package (dynamic import so SSR doesn't choke)
 * ==========================================================================*/

export async function parseXlsx(buffer: ArrayBuffer, filename: string): Promise<RawTable> {
  const warnings: string[] = [];
  let XLSX: any;
  try {
    // webpackIgnore so bundler doesn't hard-require the module at build time —
    // we want a runtime try/catch, not a compile-time module-not-found.
    XLSX = await import(/* webpackIgnore: true */ "xlsx").catch(() => null);
    if (!XLSX) throw new Error("not installed");
  } catch {
    return { kind: "xlsx", filename, headers: [], rows: [],
             warnings: ["xlsx package not installed — run: npm i xlsx"] };
  }
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false, cellNF: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { kind: "xlsx", filename, headers: [], rows: [], warnings: ["no sheets"] };
  const sheet = wb.Sheets[sheetName];
  // sheet_to_json({header:1}) yields a 2D array of cells (first row = header)
  const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  if (!aoa.length) return { kind: "xlsx", filename, headers: [], rows: [], warnings: ["sheet is empty"] };

  // Skip junk rows above header (same heuristic as CSV)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, aoa.length); i++) {
    const cells = aoa[i].map(c => String(c ?? ""));
    if (cells.length < 3) continue;
    const nonNumeric = cells.filter(c => c && !/^[-$()\d.,\s]+$/.test(c)).length;
    if (nonNumeric >= Math.max(2, Math.floor(cells.length / 2))) { headerIdx = i; break; }
  }
  if (headerIdx > 0) warnings.push(`skipped ${headerIdx} junk row(s) before header`);

  const headers = aoa[headerIdx].map((h, i) => String(h ?? `column_${i}`).trim() || `column_${i}`);
  const seen: Record<string, number> = {};
  const uniq = headers.map(h => {
    if (seen[h] === undefined) { seen[h] = 0; return h; }
    seen[h]++;
    return `${h}_${seen[h]}`;
  });
  const rows = aoa.slice(headerIdx + 1).map(r => {
    const out = uniq.map((_, i) => String(r[i] ?? "").trim());
    return out;
  }).filter(r => r.some(c => c));

  if (wb.SheetNames.length > 1) warnings.push(`using first sheet "${sheetName}" (${wb.SheetNames.length} sheets total)`);
  return { kind: "xlsx", filename, headers: uniq, rows, warnings, meta: { sheet: sheetName } };
}

/* ============================================================================
 * PDF — needs pdfjs-dist (dynamic import). Extracts text and heuristically
 * tries to parse transaction-looking lines. Falls back to raw text if no luck.
 * ==========================================================================*/

export async function parsePdf(buffer: ArrayBuffer, filename: string): Promise<RawTable> {
  const warnings: string[] = [];
  let pdfjs: any;
  try {
    pdfjs = await import(/* webpackIgnore: true */ "pdfjs-dist").catch(() => null);
    if (!pdfjs) throw new Error("not installed");
  } catch {
    return { kind: "pdf", filename, headers: [], rows: [],
             warnings: ["pdfjs-dist not installed — run: npm i pdfjs-dist"] };
  }
  // Disable worker for serverless / simple env
  try { pdfjs.GlobalWorkerOptions.workerSrc = ""; } catch {}

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true, isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group items by y-coordinate to reconstruct lines
    const byY: Record<string, string[]> = {};
    for (const item of content.items as any[]) {
      const y = Math.round((item.transform?.[5] ?? 0));
      (byY[y] ||= []).push(item.str);
    }
    const pageLines = Object.entries(byY)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([, parts]) => parts.join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    lines.push(...pageLines);
  }

  // Try to detect "date description amount" shape.
  // Date alternatives: "24 Apr. 2026" | "24-Apr-2026" | MM/DD/YYYY | YYYY-MM-DD
  // Amount captures optional leading minus so credits like -$468.50 are preserved.
  const txnLine = /^(\d{1,2}[\s\-][A-Za-z]{3,9}\.?[\s\-]\d{4}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{4}-\d{2}-\d{2})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*$/;
  const rows: string[][] = [];
  for (const l of lines) {
    const m = l.match(txnLine);
    if (m) rows.push([m[1], m[2].trim(), m[3]]);
  }
  if (rows.length === 0) {
    // Fallback — return the raw text as a single 1-column table so the AI advisor
    // at least has something to work with.
    warnings.push("could not auto-detect transaction lines; returning raw text for AI assist");
    return {
      kind: "pdf", filename,
      headers: ["line"],
      rows: lines.map(l => [l]),
      warnings,
    };
  }
  warnings.push(`extracted ${rows.length} transaction-looking lines across ${doc.numPages} page(s)`);
  return { kind: "pdf", filename, headers: ["date", "description", "amount"], rows, warnings };
}

/* ============================================================================
 * Plain text — try to split into lines, dispatch as CSV if it looks like one,
 * else surface as a 1-column table for AI to reason over.
 * ==========================================================================*/

export function parseText(text: string, filename: string): RawTable {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "text", filename, headers: [], rows: [], warnings: ["empty"] };
  // If it's actually CSV-ish, upgrade it
  const firstLine = trimmed.split("\n")[0];
  if (/[,;\t|]/.test(firstLine) && trimmed.split("\n").length > 2) {
    return { ...parseDelimited(trimmed, filename), warnings: ["treated pasted text as CSV"] };
  }
  const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
  return {
    kind: "text", filename,
    headers: ["line"], rows: lines.map(l => [l]),
    warnings: ["free-form text — AI will need to interpret line-by-line"],
  };
}
