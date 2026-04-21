// Format helpers — direct port from src/lib.js

export function fmtDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("en-CA") : "";
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toFixed(2);
}

export function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + Math.round(n);
}

export function monthKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

const MONTHS_LONG = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTHS_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

export function monthLabel(mk: string): string {
  const parts = mk.split("-");
  return MONTHS_LONG[parseInt(parts[1]) - 1] + " " + parts[0];
}

export function monthLabelShort(mk: string): string {
  const parts = mk.split("-");
  return MONTHS_SHORT[parseInt(parts[1]) - 1] + " " + parts[0];
}

export function dayOfWeek(d: Date): string {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

export function toCents(a: number): number {
  return Math.round(a * 100);
}
