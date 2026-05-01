"use client";
import React, { useState } from "react";
import { Btn } from "@/components/budget/Primitives";

export type EditData = {
  date: string;
  description: string;
  amount: string;
  category_id: string;
  is_income: boolean;
};

export function LedgerEditRow({
  initial, cats, onSave, onCancel,
}: {
  initial: EditData;
  cats: Array<{ id: string; name: string }>;
  onSave: (d: EditData) => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<EditData>(initial);

  return (
    <div
      className="ledger-row ledger-edit-row"
      style={{
        background: "var(--accent-soft)",
        gridTemplateColumns: "110px 1fr 90px 140px auto auto",
      }}
    >
      <input
        type="date"
        className="inp"
        value={data.date}
        onChange={(e) => setData({ ...data, date: e.target.value })}
      />
      <input
        className="inp"
        value={data.description}
        onChange={(e) => setData({ ...data, description: e.target.value })}
      />
      <input
        type="number"
        className="inp"
        value={data.amount}
        onChange={(e) => setData({ ...data, amount: e.target.value })}
      />
      <select
        className="sel"
        value={data.category_id}
        onChange={(e) => setData({ ...data, category_id: e.target.value })}
      >
        <option value="">Select…</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <Btn small primary onClick={() => onSave(data)}>Save</Btn>
      <Btn small onClick={onCancel}>×</Btn>
    </div>
  );
}
