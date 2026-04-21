"use client";
import React from "react";
import { fmtMoney, fmtDate } from "@/lib/budget";

type NavTarget = "dashboard" | "ledger" | "weekly" | "compare" | "rules" | "goals" | "setup";

export type CmdAction =
  | { kind: "nav"; target: NavTarget }
  | { kind: "filter-category"; categoryName: string }
  | { kind: "filter-search"; query: string }
  | { kind: "filter-uncategorized" }
  | { kind: "open-txn"; txn: any }
  | { kind: "ai-parse"; input: string };

interface Sug {
  type: "nav" | "filter" | "txn" | "ai";
  label: string;
  hint: string;
  action: CmdAction;
}

export function CommandPalette({
  open, onClose,
  categories, transactions,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  categories: any[];
  transactions: any[]; // legacy txns
  onAction: (a: CmdAction) => void | Promise<void>;
}) {
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setFocusIdx(0);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const catNames: string[] = categories.filter((c: any) => !c.is_income).map((c: any) => c.name);

  const suggestions = React.useMemo<Sug[]>(() => {
    const q = query.toLowerCase().trim();
    const out: Sug[] = [];

    const navs: { t: NavTarget; l: string }[] = [
      { t: "dashboard", l: "Dashboard" },
      { t: "ledger",    l: "Ledger" },
      { t: "weekly",    l: "Weekly digest" },
      { t: "compare",   l: "Compare / Forecast" },
      { t: "rules",     l: "Rules" },
      { t: "goals",     l: "Goals" },
      { t: "setup",     l: "Setup" },
    ];
    navs.forEach((n) => {
      if (!q || n.l.toLowerCase().includes(q) || n.t.includes(q)) {
        out.push({
          type: "nav",
          label: "Go to " + n.l,
          hint: "navigation",
          action: { kind: "nav", target: n.t },
        });
      }
    });

    if (q) {
      catNames.forEach((c) => {
        if (c.toLowerCase().includes(q)) {
          out.push({
            type: "filter",
            label: "Show " + c,
            hint: "filter",
            action: { kind: "filter-category", categoryName: c },
          });
        }
      });
      if ("uncategorized".includes(q)) {
        out.push({
          type: "filter",
          label: "Show uncategorized",
          hint: "filter",
          action: { kind: "filter-uncategorized" },
        });
      }
      const matches = transactions
        .filter((t: any) => t.description.toLowerCase().includes(q))
        .slice(0, 4);
      matches.forEach((m: any) =>
        out.push({
          type: "txn",
          label: m.description,
          hint: fmtMoney(m.amount) + " · " + fmtDate(m.date),
          action: { kind: "open-txn", txn: m },
        })
      );
    }

    if (q.length >= 3) {
      out.push({
        type: "ai",
        label: "Ask AI: " + query,
        hint: "enter to parse",
        action: { kind: "ai-parse", input: query },
      });
    }

    return out.slice(0, 12);
  }, [query, categories, transactions]);

  React.useEffect(() => setFocusIdx(0), [query]);

  const run = async (s: Sug) => {
    if (s.type === "ai") {
      setBusy(true);
      setError(null);
      try {
        await onAction(s.action);
        onClose();
      } catch (e: any) {
        setError(e?.message || "AI couldn't parse that.");
      } finally {
        setBusy(false);
      }
    } else {
      onAction(s.action);
      onClose();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[focusIdx]) run(suggestions[focusIdx]);
      else if (query.trim().length >= 3) {
        run({
          type: "ai", label: "Ask AI: " + query, hint: "",
          action: { kind: "ai-parse", input: query },
        });
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-row">
          <span className="cmd-prompt">❭</span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="jump anywhere, filter, or ask AI to add a transaction…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
          />
          {busy && <span className="cmd-busy mono">thinking…</span>}
        </div>
        {error && <div className="cmd-error">{error}</div>}
        {suggestions.length > 0 && (
          <div className="cmd-suggestions">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className={"cmd-sug" + (i === focusIdx ? " focus" : "")}
                onMouseEnter={() => setFocusIdx(i)}
                onClick={() => run(s)}
              >
                <span className={"cmd-sug-icon type-" + s.type}>
                  {s.type === "nav" && "↳"}
                  {s.type === "filter" && "⌕"}
                  {s.type === "txn" && "§"}
                  {s.type === "ai" && "✦"}
                </span>
                <span className="cmd-sug-label">{s.label}</span>
                <span className="cmd-sug-hint mono">{s.hint}</span>
              </div>
            ))}
          </div>
        )}
        <div className="cmd-footer mono">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
          <span style={{ marginLeft: "auto" }}>⌘K to open</span>
        </div>
      </div>
    </div>
  );
}
