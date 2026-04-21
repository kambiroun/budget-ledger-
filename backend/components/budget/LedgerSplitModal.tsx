"use client";
import React, { useState } from "react";
import { Modal, Btn } from "@/components/budget/Primitives";
import { fmtMoney } from "@/lib/budget";

type Cat = { id: string; name: string };

type Part = { amount: string; category_id: string };

export function LedgerSplitModal({
  txn, cats, onApply, onClose,
}: {
  txn: any;
  cats: Cat[];
  onApply: (parts: { amount: number; category_id: string | null }[]) => void;
  onClose: () => void;
}) {
  const half = Number(txn.amount) / 2;
  const [parts, setParts] = useState<Part[]>([
    { amount: half.toFixed(2), category_id: txn.category_id || "" },
    { amount: half.toFixed(2), category_id: "" },
  ]);

  const target = Number(txn.amount);
  const sum = parts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const diff = Math.abs(sum - target);
  const valid = diff < 0.01;

  const apply = () => {
    if (!valid) return;
    const cleaned = parts
      .filter((p) => parseFloat(p.amount) > 0)
      .map((p) => ({
        amount: parseFloat(p.amount),
        category_id: p.category_id || null,
      }));
    onApply(cleaned);
  };

  return (
    <Modal onClose={onClose}>
      <h3>Split transaction</h3>
      <div style={{ fontSize: 13, color: "var(--ink-muted)", marginBottom: 12 }}>
        {txn.description} · {fmtMoney(target)}
      </div>
      {parts.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            type="number"
            className="inp"
            placeholder="Amount"
            value={p.amount}
            style={{ width: 100 }}
            onChange={(e) =>
              setParts((sp) => sp.map((x, ix) => ix === i ? { ...x, amount: e.target.value } : x))
            }
          />
          <select
            className="sel"
            value={p.category_id}
            onChange={(e) =>
              setParts((sp) => sp.map((x, ix) => ix === i ? { ...x, category_id: e.target.value } : x))
            }
            style={{ flex: 1 }}
          >
            <option value="">Category…</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {parts.length > 2 && (
            <button
              onClick={() => setParts((sp) => sp.filter((_, ix) => ix !== i))}
              style={{
                background: "none", border: "none", color: "var(--ink-faint)",
                cursor: "pointer", fontSize: 18,
              }}
            >×</button>
          )}
        </div>
      ))}
      <div
        style={{
          display: "flex", gap: 6, marginBottom: 12,
          fontSize: 11, fontFamily: "JetBrains Mono, monospace",
          color: "var(--ink-muted)", justifyContent: "space-between",
        }}
      >
        <button
          onClick={() => setParts([...parts, { amount: "", category_id: "" }])}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--accent)", fontFamily: "inherit", fontSize: 11,
            letterSpacing: "0.1em", textTransform: "uppercase",
          }}
        >+ add part</button>
        <span>
          <span style={{ color: valid ? "var(--good)" : "var(--bad)" }}>
            {fmtMoney(sum)} / {fmtMoney(target)}{" "}
            {valid ? "✓" : `(${fmtMoney(target - sum)} off)`}
          </span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Btn primary onClick={apply} style={{ flex: 1 }} disabled={!valid}>Apply split</Btn>
        <Btn ghost onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}
