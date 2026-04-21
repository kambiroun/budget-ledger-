"use client";
import React, { useState } from "react";
import { fmtMoney, forecastCategory } from "@/lib/budget";

export function DashBudgetTab({
  categories, names, spentByCat, budgetMap, transactions, monthTxns,
  month, isCurrentMonth,
}: {
  categories: any[];
  names: string[];
  spentByCat: Record<string, number>;
  budgetMap: Record<string, string | number>;
  transactions: any[];
  monthTxns: any[];
  month: string;
  isCurrentMonth: boolean;
}) {
  const colorFor = (name: string) =>
    categories.find((c) => c.name === name)?.color ?? "var(--ink-muted)";

  // Which category row is expanded. Null = none; only one open at a time.
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (name: string) =>
    setExpanded((cur) => (cur === name ? null : name));

  // Open the full transaction in the Receipt Drawer. BudgetShell listens
  // for this event — same one LedgerPage rows use on double-click.
  const openReceipt = (id: string) =>
    window.dispatchEvent(new CustomEvent("budget:open-receipt", { detail: { id } }));

  return (
    <div>
      {names.map((c) => {
        const sp = spentByCat[c] || 0;
        const bg = Number(budgetMap[c]) || 0;
        const rm = bg - sp;
        const over = sp > bg && bg > 0;
        const pct = bg > 0 ? Math.min((sp / bg) * 100, 100) : 0;
        const fc = isCurrentMonth && bg > 0 ? forecastCategory(transactions, month, c) : null;
        const projPct = fc && bg > 0 ? Math.min((fc.projected / bg) * 100, 100) : 0;
        const projOver = fc && fc.projected > bg && bg > 0;

        // Transactions in this category for the selected month, newest first.
        const rows = monthTxns
          .filter((t) => t.category === c)
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const txCount = rows.length;
        const isOpen = expanded === c;

        return (
          <div key={c}>
            <div
              className="cat-row"
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggle(c)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(c); }
              }}
              title={isOpen ? `Collapse ${c}` : `Expand ${c} — ${txCount} txns`}
              style={{ cursor: "pointer" }}
            >
              <div className="cat-row-top">
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 10,
                    marginRight: 2,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: "var(--ink-faint)",
                    transform: isOpen ? "rotate(90deg)" : "none",
                    transition: "transform 120ms",
                  }}
                >▸</span>
                <span className="cat-swatch" style={{ background: colorFor(c) }} />
                <span className="cat-name">{c}</span>
                <span className="mono" style={{ color: "var(--ink-faint)", fontSize: 11 }}>
                  {txCount} txns
                </span>
                <span className="cat-amounts">
                  <span className={"spent" + (over ? " over" : "")}>{fmtMoney(sp)}</span>
                  {bg > 0 && <span className="budget"> / {fmtMoney(bg)}</span>}
                </span>
              </div>
              {bg > 0 ? (
                <>
                  <div className="bar-track" style={{ position: "relative" }}>
                    <div className="bar-fill" style={{
                      width: pct + "%",
                      background: over ? "var(--bad)" : colorFor(c),
                    }} />
                    {fc && projPct > pct && (
                      <div style={{
                        position: "absolute", top: 0, left: pct + "%",
                        width: (projPct - pct) + "%", height: "100%",
                        background: projOver ? "var(--bad)" : colorFor(c), opacity: 0.35,
                      }} />
                    )}
                  </div>
                  <div className="mono" style={{
                    marginTop: 6, fontSize: 11,
                    color: over ? "var(--bad)" : "var(--ink-muted)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <span>{over ? `Over by ${fmtMoney(Math.abs(rm))}` : `${fmtMoney(rm)} left · ${Math.round(pct)}%`}</span>
                    {fc && fc.daysElapsed > 2 && (
                      <span style={{ color: projOver ? "var(--bad)" : "var(--ink-faint)" }}>
                        pace → {fmtMoney(fc.projected)} by EOM
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="mono" style={{
                  marginTop: 6, fontSize: 11, color: "var(--ink-faint)",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>No budget set</div>
              )}
            </div>

            {/* Expanded transaction list for this category, in-place. */}
            {isOpen && (
              <div
                style={{
                  margin: "2px 0 16px 24px",
                  padding: "8px 0 4px",
                  borderLeft: `2px solid ${colorFor(c)}`,
                  paddingLeft: 14,
                }}
              >
                {rows.length === 0 ? (
                  <div className="mono" style={{
                    fontSize: 11, color: "var(--ink-faint)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "6px 0",
                  }}>
                    No transactions this month
                  </div>
                ) : (
                  <div>
                    {rows.map((t) => (
                      <button
                        key={t.id}
                        onClick={(e) => { e.stopPropagation(); openReceipt(t.id); }}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "80px 1fr auto",
                          gap: 12,
                          width: "100%",
                          background: "none",
                          border: "none",
                          borderBottom: "1px solid var(--rule-soft)",
                          padding: "8px 4px",
                          textAlign: "left",
                          cursor: "pointer",
                          alignItems: "baseline",
                          color: "inherit",
                        }}
                        title="Open receipt"
                      >
                        <span className="mono" style={{
                          fontSize: 11, color: "var(--ink-faint)",
                          letterSpacing: "0.04em",
                        }}>
                          {t.date}
                        </span>
                        <span style={{
                          fontFamily: "Source Serif 4, Georgia, serif",
                          fontSize: 15,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {t.merchant || t.description || "—"}
                        </span>
                        <span className="mono" style={{
                          fontSize: 13,
                          fontVariantNumeric: "tabular-nums",
                          color: t.amount < 0 ? "var(--good)" : "var(--ink)",
                        }}>
                          {fmtMoney(Math.abs(t.amount))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
