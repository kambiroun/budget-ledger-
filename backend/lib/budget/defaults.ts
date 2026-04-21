// Defaults: categories, budgets, colors, icons — direct port from src/lib.js

export const DEFAULT_CATEGORIES = [
  "Transportation","Food (Date)","Subscription","Groceries","Fun",
  "Households","Utilities","Self Care","Gift","Relationship","Eating Out","Other",
];

export const DEFAULT_BUDGETS: Record<string, string> = {
  "Transportation":"2300","Food (Date)":"200","Subscription":"100",
  "Groceries":"400","Fun":"400","Households":"75","Utilities":"85",
  "Self Care":"500","Gift":"100","Relationship":"400","Eating Out":"200","Other":"50",
};

export const CAT_COLORS: Record<string, string> = {
  "Transportation":"#B07638","Food (Date)":"#C44A3B","Subscription":"#4D6ABF",
  "Groceries":"#5C9A3E","Fun":"#E08340","Households":"#8B6FB0",
  "Utilities":"#3A8AA8","Self Care":"#C77A9B","Gift":"#D99A2B",
  "Relationship":"#C74258","Eating Out":"#DB6532","Other":"#7B7B7B",
};

const FALLBACK = ["#B07638","#C44A3B","#4D6ABF","#5C9A3E","#E08340","#8B6FB0","#3A8AA8","#C77A9B","#D99A2B","#C74258"];

export function getColor(cat: string, allCats: string[]): string {
  if (CAT_COLORS[cat]) return CAT_COLORS[cat];
  return FALLBACK[allCats.indexOf(cat) % FALLBACK.length] || "#7B7B7B";
}

export const CAT_ICONS: Record<string, string> = {
  "Transportation": "M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2 M19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z M7 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  "Food (Date)": "M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z M6 17h12",
  "Subscription": "M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0 M12 6v6l4 2",
  "Groceries": "M2 3h2l.4 2M7 13h10l4-8H5.4 M7 13 5.4 5 M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17 M17 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z M9 19a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  "Fun": "M15 11h.01 M11 15h.01 M16 16h.01 M2 16v6h6l3.13-3.13a4 4 0 0 0 0-5.66L8 10.07A4 4 0 0 0 2 14 M14.3 5.37 12 3l-.83.83-1.41-1.41 2.24-2.25 4.5 4.5 M20.66 16.66a4 4 0 0 0 0-5.66L17.54 7.88A4 4 0 0 0 11.88 13.54l3.12 3.12a4 4 0 0 0 5.66 0",
  "Households": "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  "Utilities": "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  "Self Care": "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
  "Gift": "M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  "Relationship": "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
  "Eating Out": "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z M21 15v7",
  "Other": "M12 2v20 M2 12h20",
};

export function getCatIcon(cat: string): string {
  return CAT_ICONS[cat] || CAT_ICONS["Other"];
}
