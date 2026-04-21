"use client";
import React from "react";
import { fmtMoney } from "@/lib/budget";

type Txn = any;
type Cat = { id: string; name: string; color?: string | null };

export function LedgerRow({
  txn, cats, focused, selected, editing,
  onClick, onDoubleClick, onToggleSelect, onCategoryChange,
  onStartEdit, onOpenSplit, onDelete,
}: {
  txn: Txn;
  cats: Cat[];
  focused: boolean;
  selected: boolean;
  editing: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onToggleSelect: () => void;
  onCategoryChange: (catId: string | null) => void;
  onStartEdit: () => void;
  onOpenSplit: () => void;
  onDelete: () => void;
}) {
  const cat = txn.category_id ? cats.find((c) => c.id === txn.category_id) : null;
  const isIncome = !!txn.is_income;
  const isTransfer = !!txn.is_transfer;
  const isRefund = !!txn.is_refund;
  const isSplit = !!txn.split_of;

  const rowCls = [
    "ledger-row",
    !cat && !isIncome && !isTransfer ? "uncat" : "",
    focused ? "focused" : "",
    selected ? "selected" : "",
    isTransfer || isRefund ? "transfer" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={rowCls}
      data-focus={focused ? "1" : "0"}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="ledger-date">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          style={{ marginRight: 6, verticalAlign: "middle" }}
        />
        {isRefund && <span style={{ color: "var(--accent)", fontWeight: 700, marginRight: 4 }}>REFUND</span>}
        {isTransfer && !isRefund && <span style={{ color: "var(--accent)", fontWeight: 700, marginRight: 4 }}>XFER</span>}
        {txn.date}
      </div>
      <div className="ledger-desc" style={{ fontFamily: "Source Serif 4, Georgia, serif" }}>
        {txn.description}
        {isSplit && (
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-faint)", marginLeft: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            ·split
          </span>
        )}
        {txn.ai_confidence != null && !cat && (
          <span className="mono" style={{ fontSize: 9, color: "var(--accent)", marginLeft: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            ·ai?
          </span>
        )}
      </div>
      <div className={"ledger-amt" + (isIncome ? " income" : "")}>
        {isIncome ? "+ " : ""}{fmtMoney(Number(txn.amount))}
      </div>
      <div className="ledger-cat">
        {isIncome ? (
          <span className="pill" style={{ color: "var(--good)" }}>
            <span className="dot" /> Income
          </span>
        ) : (
          <select
            className="sel"
            value={txn.category_id || ""}
            onChange={(e) => onCategoryChange(e.target.value || null)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              borderColor: cat?.color || "var(--rule)",
              background: cat?.color ? cat.color + "22" : "var(--bg-card)",
            }}
          >
            <option value="">Select…</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {!isIncome && !isSplit && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSplit(); }}
            title="Split transaction"
            style={{
              background: "none", border: "none", color: "var(--ink-muted)",
              cursor: "pointer", fontSize: 10, fontFamily: "JetBrains Mono, monospace",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}
          >÷</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
          style={{
            background: "none", border: "none", color: "var(--ink-muted)",
            cursor: "pointer", fontSize: 10, fontFamily: "JetBrains Mono, monospace",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}
        >edit</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: "none", border: "none", color: "var(--ink-faint)",
            cursor: "pointer", fontSize: 14,
          }}
        >×</button>
      </div>
    </div>
  );
}
