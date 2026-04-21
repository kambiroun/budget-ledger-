// Parsers — direct port from src/lib.js

export function parseAmexDate(s: any): Date | null {
  if (!s) return null;
  const d = new Date(String(s).trim());
  return isNaN(d.getTime()) ? null : d;
}

export function parseBankDate(s: any): Date | null {
  if (!s) return null;
  const str = String(s).trim();
  if (/^\d{8}$/.test(str)) {
    return new Date(+str.slice(0, 4), +str.slice(4, 6) - 1, +str.slice(6, 8));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + "T00:00:00");
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function parseAmount(s: any): number {
  if (typeof s === "number") return s;
  if (!s) return 0;
  let str = String(s).trim();
  let neg = false;
  if (/^\(.*\)$/.test(str)) {
    neg = true;
    str = str.slice(1, -1);
  }
  if (/^-/.test(str)) {
    neg = true;
    str = str.slice(1);
  }
  str = str.replace(/[$,\s]/g, "");
  const n = parseFloat(str) || 0;
  return neg ? -n : n;
}
