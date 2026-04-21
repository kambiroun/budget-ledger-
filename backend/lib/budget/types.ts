// Core types used throughout the budget app

export type Transaction = {
  id?: string;
  date: Date;
  description: string;
  amount: number;
  category: string | null;
  source?: string;
  isIncome?: boolean;
  isDupe?: boolean;
  isSplit?: boolean;
  splitFrom?: string;
  autoSource?: "rule" | "memory" | "ai" | null;
  note?: string;
};

export type Category = { name: string; color?: string };

export type Rule = { id?: string; pattern: string; category: string };

export type Goal = {
  id?: string;
  name: string;
  target: number;
  saved: number;
  deadline?: string | null;
};

export type BudgetMap = Record<string, string | number>;
export type MerchantMap = Record<string, string>;

export type InboxItem = {
  id: string;
  priority: number;
  icon: string;
  title: string;
  sub: string;
  action?: {
    type: "goto" | "focus-cat" | "focus-txn";
    tab?: string;
    filter?: string;
    cat?: string;
    txn?: Transaction;
  };
};
