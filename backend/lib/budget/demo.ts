// Demo data generator — direct port from src/lib.js
import { Transaction } from "./types";

export function generateDemoData(): Transaction[] {
  const today = new Date();
  const merchants = [
    { name: "WHOLE FOODS MARKET #442", cat: "Groceries", rangeMin: 45, rangeMax: 180, freq: 4 },
    { name: "TRADER JOE'S #221", cat: "Groceries", rangeMin: 30, rangeMax: 95, freq: 3 },
    { name: "SHELL OIL 57431", cat: "Transportation", rangeMin: 40, rangeMax: 72, freq: 5 },
    { name: "UBER TRIP HELP.UBER.COM", cat: "Transportation", rangeMin: 8, rangeMax: 35, freq: 6 },
    { name: "NETFLIX.COM", cat: "Subscription", rangeMin: 15.99, rangeMax: 15.99, freq: 1, recurring: true },
    { name: "SPOTIFY USA", cat: "Subscription", rangeMin: 11.99, rangeMax: 11.99, freq: 1, recurring: true },
    { name: "CLAUDE.AI/SUBSCRIPTION", cat: "Subscription", rangeMin: 20, rangeMax: 20, freq: 1, recurring: true },
    { name: "PG&E WEB ONLINE PAY", cat: "Utilities", rangeMin: 85, rangeMax: 140, freq: 1, recurring: true },
    { name: "COMCAST XFINITY", cat: "Utilities", rangeMin: 79.99, rangeMax: 79.99, freq: 1, recurring: true },
    { name: "CHIPOTLE ONLINE", cat: "Eating Out", rangeMin: 12, rangeMax: 18, freq: 4 },
    { name: "BLUE BOTTLE COFFEE", cat: "Eating Out", rangeMin: 5, rangeMax: 14, freq: 8 },
    { name: "PIZZERIA DELFINA", cat: "Food (Date)", rangeMin: 45, rangeMax: 120, freq: 2 },
    { name: "STATE BIRD PROVISIONS", cat: "Food (Date)", rangeMin: 90, rangeMax: 180, freq: 1 },
    { name: "AMC METREON 16", cat: "Fun", rangeMin: 18, rangeMax: 42, freq: 2 },
    { name: "SEPHORA STORE #0455", cat: "Self Care", rangeMin: 35, rangeMax: 150, freq: 2 },
    { name: "AMAZON.COM*H23KX88", cat: "Households", rangeMin: 12, rangeMax: 85, freq: 5 },
    { name: "TARGET 00023445", cat: "Households", rangeMin: 22, rangeMax: 110, freq: 3 },
    { name: "EMPLOYER PAYROLL DIRECT DEP", cat: null as any, income: true, rangeMin: 4200, rangeMax: 4200, freq: 2, recurring: true },
  ];
  const txns: Transaction[] = [];
  for (let monthBack = 2; monthBack >= 0; monthBack--) {
    const mo = today.getMonth() - monthBack;
    const year = today.getFullYear() + Math.floor(mo / 12);
    const realMo = ((mo % 12) + 12) % 12;
    const daysInMonth = new Date(year, realMo + 1, 0).getDate();
    const lastDay = monthBack === 0 ? today.getDate() : daysInMonth;
    merchants.forEach((m: any) => {
      const n = Math.max(1, Math.round(m.freq * (lastDay / daysInMonth)));
      for (let i = 0; i < n; i++) {
        const day = m.recurring
          ? Math.min(lastDay, 1 + Math.floor((i * daysInMonth) / Math.max(1, m.freq)))
          : 1 + Math.floor(Math.random() * lastDay);
        const amount =
          m.rangeMin === m.rangeMax ? m.rangeMin : m.rangeMin + Math.random() * (m.rangeMax - m.rangeMin);
        txns.push({
          date: new Date(year, realMo, day),
          description: m.name,
          amount: Math.round(amount * 100) / 100,
          category: m.cat,
          source: "Demo",
          isIncome: !!m.income,
        });
      }
    });
  }
  txns.sort((a, b) => a.date.getTime() - b.date.getTime());
  return txns;
}
