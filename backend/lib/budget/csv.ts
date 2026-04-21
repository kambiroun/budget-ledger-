/**
 * CSV import — parses a bank CSV string into a list of normalized transactions.
 *
 * Heuristics (the real world is messy):
 *   - comma / semicolon / tab delimiters detected from header row
 *   - header names matched loosely: date, description|merchant|name, amount|debit|credit
 *   - if BOTH debit & credit cols exist, amount = debit - credit (or credit - debit? we pick
 *     the one that yields positive spending + treat inflows as income)
 *   - dates: common US (MM/DD/YYYY), ISO (YYYY-MM-DD), EU (DD/MM/YYYY) — we try in order
 *
 * Returns rows with ISO dates, positive amounts, and an is_income flag.
 */

export interface ParsedRow {
  date: string;             // ISO yyyy-mm-dd
  description: string;
  amount: number;           // always positive
  is_income: boolean;
  raw: Record<string, string>;
}

function detectDelimiter(line: string): string {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of line) if (ch in counts) (counts as any)[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// Minimal RFC4180-ish splitter — handles quoted fields with commas.
function splitCSVLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' ) {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function matchCol(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (patterns.some((p) => p.test(h))) return i;
  }
  return -1;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const clean = s.trim();
  // ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // MM/DD/YYYY or DD/MM/YYYY
  const slash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(clean);
  if (slash) {
    let [, a, b, y] = slash;
    if (y.length === 2) y = "20" + y;
    // Heuristic: assume US (MM/DD) unless first > 12
    const [mm, dd] = +a > 12 ? [b, a] : [a, b];
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // "Jan 5, 2024"
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseMoney(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/[$,\s]/g, "").replace(/[()]/g, "-");
  const n = parseFloat(clean);
  return isFinite(n) ? n : 0;
}

export function parseCSV(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = [];
  // Strip UTF-8 BOM if present
  const stripped = text.replace(/^\uFEFF/, "");
  const lines = stripped.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], errors: ["CSV has no data rows."] };

  const delim = detectDelimiter(lines[0]);
  const headers = splitCSVLine(lines[0], delim)
    .map((h) => h.replace(/^"+|"+$/g, "").trim());

  const dateCol = matchCol(headers, [/date/, /posted/, /time/]);
  const descCol = matchCol(headers, [/desc/, /name/, /merchant/, /memo/, /payee/, /detail/, /narrat/, /transaction/]);
  const amtCol  = matchCol(headers, [/^amount$/, /amount/, /^value$/, /^amt/]);
  const debitCol = matchCol(headers, [/debit|withdrawal|outflow|paid out|charges?/]);
  const creditCol = matchCol(headers, [/credit|deposit|inflow|paid in/]);

  if (dateCol < 0) errors.push(`No date column found. Headers: ${headers.join(", ")}`);
  if (descCol < 0) errors.push(`No description/merchant column found. Headers: ${headers.join(", ")}`);
  if (amtCol < 0 && debitCol < 0 && creditCol < 0) errors.push(`No amount column found. Headers: ${headers.join(", ")}`);
  if (errors.length) return { rows: [], errors };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i], delim);
    const date = parseDate(cells[dateCol] || "");
    const desc = (cells[descCol] || "").trim();
    if (!date || !desc) continue;

    let amount: number;
    let isIncome: boolean;

    if (amtCol >= 0) {
      const raw = parseMoney(cells[amtCol]);
      // Convention varies: some banks show spending as negative, some as positive.
      // We assume negative = spending, positive = income.
      amount = Math.abs(raw);
      isIncome = raw > 0;
    } else {
      const debit = debitCol >= 0 ? parseMoney(cells[debitCol]) : 0;
      const credit = creditCol >= 0 ? parseMoney(cells[creditCol]) : 0;
      if (debit > 0) { amount = debit; isIncome = false; }
      else if (credit > 0) { amount = credit; isIncome = true; }
      else continue;
    }

    if (amount === 0) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => (raw[h] = cells[idx] ?? ""));

    rows.push({ date, description: desc, amount, is_income: isIncome, raw });
  }

  if (!rows.length) errors.push("No valid rows could be parsed.");
  return { rows, errors };
}
