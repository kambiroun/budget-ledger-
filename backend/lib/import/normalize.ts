/**
 * Normalize RawTable rows into typed transactions using the ColumnMapping.
 *
 * Inputs:  RawTable (headers + string[][]) + ColumnMapping (which column plays which role)
 * Outputs: NormalizedRow[] with parsed date / amount / is_income, plus per-row
 *          `issues` for any problems (unparseable date, zero amount, etc).
 *
 * Philosophy: never throw. Every problem becomes an `issues` entry on the row,
 * so the review UI can show it and the user can decide.
 */
import type { RawTable, ColumnMapping, NormalizedRow, RoleName } from "./types";

/** Which columns play which role — indexes into RawTable.headers. */
interface RoleIndex {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  category: number;
  notes: number;
}

function buildRoleIndex(headers: string[], mapping: ColumnMapping): RoleIndex {
  const idx: RoleIndex = {
    date: -1, description: -1, amount: -1,
    debit: -1, credit: -1, category: -1, notes: -1,
  };
  headers.forEach((h, i) => {
    const role = mapping.columns[h] as RoleName | undefined;
    if (!role || role === "ignore") return;
    if (idx[role as keyof RoleIndex] === -1) idx[role as keyof RoleIndex] = i;
  });
  return idx;
}

function parseMoney(s: string): number {
  if (!s) return NaN;
  // "(123.45)" → "-123.45", strip currency/thousand separators.
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/[^\d.,\-\(\)]/g, "")
    .replace(/^\((.+)\)$/, "-$1");
  // Ambiguous "1.234,56" vs "1,234.56": pick by position of the last separator
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) {
    // comma is decimal → strip thousand dots, swap comma for dot
    normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function parseDate(s: string, fmt: ColumnMapping["date_format"] = "auto"): string | null {
  if (!s) return null;
  const clean = s.trim();
  // ISO
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(clean);
  if (iso) {
    const [_, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Slash / dash: 1/2/3 or 01-02-2024
  const slash = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(clean);
  if (slash) {
    let [_, a, b, y] = slash;
    if (y.length === 2) y = (+y > 50 ? "19" : "20") + y;
    // Decide MM/DD vs DD/MM
    let mm: string, dd: string;
    if (fmt === "us") { mm = a; dd = b; }
    else if (fmt === "eu") { mm = b; dd = a; }
    else {
      // auto: if a>12 it must be the day; if b>12 it must be the day; else US
      if (+a > 12 && +b <= 12) { dd = a; mm = b; }
      else if (+b > 12 && +a <= 12) { mm = a; dd = b; }
      else { mm = a; dd = b; }
    }
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // "Jan 5, 2024" etc — let Date try
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function normalizeRows(table: RawTable, mapping: ColumnMapping): NormalizedRow[] {
  const role = buildRoleIndex(table.headers, mapping);
  const out: NormalizedRow[] = [];
  const convention = mapping.amount_convention ?? "negative_is_spending";

  for (let i = 0; i < table.rows.length; i++) {
    const cells = table.rows[i];
    const issues: string[] = [];
    const raw: Record<string, string> = {};
    table.headers.forEach((h, j) => (raw[h] = cells[j] ?? ""));

    // Date
    let date: string | null = null;
    if (role.date >= 0) date = parseDate(cells[role.date], mapping.date_format);
    if (!date) issues.push("could not parse date");

    // Description
    let desc = role.description >= 0 ? (cells[role.description] ?? "").trim() : "";
    if (!desc) issues.push("missing description");

    // Amount — three shapes: single signed, debit/credit, debit only
    let amount = NaN;
    let isIncome = false;
    if (role.amount >= 0) {
      const raw_amt = parseMoney(cells[role.amount]);
      if (Number.isNaN(raw_amt)) issues.push("could not parse amount");
      else {
        if (convention === "negative_is_spending") {
          amount = Math.abs(raw_amt);
          isIncome = raw_amt > 0;
        } else {
          amount = Math.abs(raw_amt);
          isIncome = raw_amt < 0;
        }
      }
    } else if (role.debit >= 0 || role.credit >= 0) {
      const debit = role.debit >= 0 ? parseMoney(cells[role.debit]) : NaN;
      const credit = role.credit >= 0 ? parseMoney(cells[role.credit]) : NaN;
      if (Number.isFinite(debit) && debit > 0) { amount = debit; isIncome = false; }
      else if (Number.isFinite(credit) && credit > 0) { amount = credit; isIncome = true; }
      else issues.push("both debit and credit are empty / zero");
    } else {
      issues.push("no amount/debit/credit column mapped");
    }

    if (Number.isFinite(amount) && amount === 0) issues.push("amount is zero");

    // Category + notes passthrough
    const category_hint = role.category >= 0 ? (cells[role.category] ?? "").trim() || undefined : undefined;
    const notes = role.notes >= 0 ? (cells[role.notes] ?? "").trim() || undefined : undefined;

    out.push({
      idx: i,
      date: date ?? "",
      description: desc,
      amount: Number.isFinite(amount) ? amount : 0,
      is_income: isIncome,
      category_hint,
      notes,
      issues,
      raw,
    });
  }
  return out;
}

/**
 * Build a heuristic initial mapping so we can show *something* before the AI
 * advisor responds (or if the AI is unavailable). Pattern-matches common
 * English/US bank column names. AI output can override this later.
 */
export function heuristicMapping(table: RawTable): ColumnMapping {
  const cols: Record<string, RoleName> = {};
  for (const h of table.headers) {
    const hl = h.toLowerCase();
    if (!cols[h] && /(posting\s*)?date|posted|time/.test(hl)) { cols[h] = "date"; continue; }
    if (!cols[h] && /desc|name|merchant|memo|payee|detail|narrat|transaction|particulars/.test(hl)) { cols[h] = "description"; continue; }
    if (!cols[h] && /^amount$|^amt$|^value$|^total$|^sum$|net amount|trnamt/.test(hl)) { cols[h] = "amount"; continue; }
    if (!cols[h] && /debit|withdrawal|outflow|paid\s*out|charges?/.test(hl)) { cols[h] = "debit"; continue; }
    if (!cols[h] && /credit|deposit|inflow|paid\s*in/.test(hl)) { cols[h] = "credit"; continue; }
    if (!cols[h] && /categor|budget|tag/.test(hl)) { cols[h] = "category"; continue; }
    if (!cols[h] && /note|comment|ref|fitid|checknum/.test(hl)) { cols[h] = "notes"; continue; }
    cols[h] = "ignore";
  }
  return {
    columns: cols,
    amount_convention: "negative_is_spending",
    date_format: "auto",
    rationale: "heuristic match on column names",
  };
}
