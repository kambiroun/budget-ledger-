"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionHead, Btn, EmptyState, MonthPicker } from "@/components/budget/Primitives";
import { LedgerRow } from "@/components/budget/LedgerRow";
import { LedgerEditRow, type EditData } from "@/components/budget/LedgerEditRow";
import { LedgerSplitModal } from "@/components/budget/LedgerSplitModal";
import { useCategories, useTransactions } from "@/lib/hooks/useData";
import { useTxnWrites } from "@/lib/hooks/useWrites";
import { monthLabelShort } from "@/lib/budget";

type FilterMode = "all" | "uncategorized" | "income" | string; // category_id for the rest

export function LedgerPage() {
  /* ---------------- data ---------------- */
  const cats = useCategories();
  const txns = useTransactions({ limit: 1000 });
  const writes = useTxnWrites();
  const catList = cats.data ?? [];
  const txList = txns.data?.transactions ?? [];

  /* ---------------- local ui state ---------------- */
  const [month, setMonth] = useState<string>("all"); // mk or "all"
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState<EditData>({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    category_id: "",
    is_income: false,
  });
  const [splitId, setSplitId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Listen for command-palette filter directives (dispatched by BudgetShell)
  useEffect(() => {
    const handler = (e: Event) => {
      const a = (e as CustomEvent<any>).detail;
      if (!a) return;
      if (a.kind === "filter-uncategorized") setFilter("uncategorized");
      else if (a.kind === "filter-category") {
        const cat = catList.find((c: any) => c.name === a.categoryName);
        if (cat) setFilter(cat.id);
      } else if (a.kind === "filter-search") {
        setSearch(a.query);
      }
    };
    window.addEventListener("budget:ledger-filter", handler as EventListener);
    return () => window.removeEventListener("budget:ledger-filter", handler as EventListener);
  }, [catList]);

  /* ---------------- derived ---------------- */
  const months = useMemo(() => {
    const s = new Set<string>();
    txList.forEach((t: any) => { if (t.date) s.add(t.date.slice(0, 7)); });
    return [...s].sort().reverse();
  }, [txList]);

  const byMonth = useMemo(() => {
    if (month === "all") return txList;
    return txList.filter((t: any) => t.date?.startsWith(month));
  }, [txList, month]);

  const uncatList = useMemo(
    () => byMonth.filter((t: any) => !t.category_id && !t.is_income && !t.is_transfer),
    [byMonth]
  );

  const display = useMemo(() => {
    let list: any[] = [];
    if (filter === "all") list = byMonth;
    else if (filter === "uncategorized") list = uncatList;
    else if (filter === "income") list = byMonth.filter((t: any) => t.is_income);
    else list = byMonth.filter((t: any) => t.category_id === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t: any) => t.description.toLowerCase().includes(q));
    }
    return list; // already sorted newest-first by API
  }, [byMonth, uncatList, filter, search]);

  /* keep focus in range */
  useEffect(() => {
    if (focusIdx >= display.length) setFocusIdx(Math.max(0, display.length - 1));
  }, [display.length, focusIdx]);

  /* ---------------- actions ---------------- */
  const assignCategory = useCallback(
    (txn: any, catId: string | null) => {
      writes.update(txn.id, { category_id: catId }).then(() => txns.refresh());
    },
    [writes, txns]
  );

  const bulkAssign = useCallback(
    async (catId: string | null) => {
      if (!selected.size) return;
      await Promise.all([...selected].map((id) => writes.update(id, { category_id: catId })));
      setSelected(new Set());
      txns.refresh();
    },
    [selected, writes, txns]
  );

  const toggleSelect = useCallback((id: string, dispIdx: number, shift: boolean) => {
    setSelected((s) => {
      const next = new Set(s);
      if (shift && anchor !== null) {
        const [from, to] = [Math.min(anchor, dispIdx), Math.max(anchor, dispIdx)];
        for (let k = from; k <= to; k++) {
          const t = display[k];
          if (t) next.add(t.id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setAnchor(dispIdx);
      }
      return next;
    });
  }, [anchor, display]);

  const startEdit = useCallback((txn: any) => {
    setEditingId(txn.id);
    setEditData({
      date: txn.date,
      description: txn.description,
      amount: Number(txn.amount).toFixed(2),
      category_id: txn.category_id || "",
      is_income: !!txn.is_income,
    });
  }, []);

  const saveEdit = useCallback(
    async (d: EditData) => {
      if (!editingId) return;
      const amt = parseFloat(d.amount);
      if (!d.description.trim() || isNaN(amt)) return;
      await writes.update(editingId, {
        date: d.date,
        description: d.description.trim(),
        amount: amt,
        category_id: d.category_id || null,
        is_income: d.is_income,
      });
      setEditingId(null);
      setEditData(null);
      txns.refresh();
    },
    [editingId, writes, txns]
  );

  const addManual = useCallback(async () => {
    const amt = parseFloat(newRow.amount);
    if (!newRow.description.trim() || !newRow.date || isNaN(amt)) return;
    await writes.create({
      date: newRow.date,
      description: newRow.description.trim(),
      amount: amt,
      category_id: newRow.category_id || null,
      is_income: newRow.is_income,
      source: "manual",
    });
    setNewRow({
      date: new Date().toISOString().slice(0, 10),
      description: "",
      amount: "",
      category_id: "",
      is_income: false,
    });
    setShowAdd(false);
    txns.refresh();
  }, [newRow, writes, txns]);

  const deleteTxn = useCallback(
    async (id: string) => {
      await writes.remove(id);
      txns.refresh();
    },
    [writes, txns]
  );

  const applySplit = useCallback(
    async (parts: { amount: number; category_id: string | null }[]) => {
      if (!splitId) return;
      const t = txList.find((x: any) => x.id === splitId);
      if (!t) return;
      // 1) create N children
      await Promise.all(
        parts.map((p, i) =>
          writes.create({
            date: t.date,
            description: `${t.description} (${i + 1}/${parts.length})`,
            amount: p.amount,
            category_id: p.category_id,
            is_income: false,
            split_of: t.id,
            source: "split",
          })
        )
      );
      // 2) delete parent
      await writes.remove(t.id);
      setSplitId(null);
      txns.refresh();
    },
    [splitId, txList, writes, txns]
  );

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || editingId) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, display.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === " ") {
        e.preventDefault();
        const t = display[focusIdx];
        if (!t) return;
        toggleSelect(t.id, focusIdx, false);
      } else if (e.key === "Escape") {
        setSelected(new Set());
      } else if (e.key === "e") {
        e.preventDefault();
        const t = display[focusIdx];
        if (t) startEdit(t);
      } else if (e.key === "/") {
        e.preventDefault();
        document.getElementById("ledger-search")?.focus();
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const n = parseInt(e.key, 10) - 1;
        if (n < catList.length) {
          const cat = catList[n];
          if (selected.size > 0) {
            bulkAssign(cat.id);
          } else {
            const t = display[focusIdx];
            if (t && !t.is_income) assignCategory(t, cat.id);
            setFocusIdx((i) => Math.min(i + 1, display.length - 1));
          }
        }
      } else if (e.key === "0") {
        e.preventDefault();
        if (selected.size > 0) bulkAssign(null);
        else {
          const t = display[focusIdx];
          if (t && !t.is_income) assignCategory(t, null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [display, focusIdx, catList, selected, editingId, toggleSelect, bulkAssign, assignCategory, startEdit]);

  /* scroll focused row */
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector("[data-focus='1']");
    if (el && "scrollIntoView" in el) {
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [focusIdx]);

  /* ---------------- render ---------------- */
  const dupeCount = 0; // TODO: dedupe detection lives on server
  const progress = byMonth.length ? ((byMonth.length - uncatList.length) / byMonth.length) * 100 : 0;

  return (
    <div>
      <SectionHead
        title="The Ledger"
        meta={`§03 · ${uncatList.length} uncategorized`}
      >
        <MonthPicker
          months={months}
          value={month}
          onChange={setMonth}
          monthLabelShort={monthLabelShort}
        />
        <Btn small onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Row"}
        </Btn>
      </SectionHead>

      {txList.length === 0 && !txns.loading && (
        <EmptyState>
          A blank ledger. Head to <b>Setup</b> to import a CSV or load demo data.
        </EmptyState>
      )}

      {txList.length > 0 && (
        <div
          style={{
            height: 3, background: "var(--rule-soft)",
            marginBottom: 18, overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%", background: "var(--ink)",
              width: `${progress}%`, transition: "width 0.3s",
            }}
          />
        </div>
      )}

      {showAdd && (
        <div
          style={{
            padding: 14, background: "var(--bg-card)",
            border: "1px solid var(--ink)", marginBottom: 14,
            display: "flex", flexWrap: "wrap", gap: 6,
          }}
        >
          <input
            type="date" className="inp"
            value={newRow.date}
            onChange={(e) => setNewRow({ ...newRow, date: e.target.value })}
            style={{ width: 140 }}
          />
          <input
            className="inp" placeholder="Description"
            value={newRow.description}
            onChange={(e) => setNewRow({ ...newRow, description: e.target.value })}
            style={{ flex: 1, minWidth: 140 }}
          />
          <input
            type="number" className="inp" placeholder="Amount"
            value={newRow.amount}
            onChange={(e) => setNewRow({ ...newRow, amount: e.target.value })}
            style={{ width: 90 }}
          />
          <select
            className="sel" value={newRow.category_id}
            onChange={(e) => setNewRow({ ...newRow, category_id: e.target.value })}
          >
            <option value="">Category…</option>
            {catList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <label style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 11, fontFamily: "JetBrains Mono, monospace",
            color: "var(--ink-muted)", textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            <input
              type="checkbox" checked={newRow.is_income}
              onChange={(e) => setNewRow({ ...newRow, is_income: e.target.checked })}
            /> Income
          </label>
          <Btn small primary onClick={addManual}>Record</Btn>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          id="ledger-search" className="inp"
          placeholder="Search descriptions…   (press / to focus)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      <div className="filter-bar">
        <FilterPill label="All" count={byMonth.length} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterPill label="Todo" count={uncatList.length} active={filter === "uncategorized"} onClick={() => setFilter("uncategorized")} />
        <FilterPill label="Income" count={byMonth.filter((t: any) => t.is_income).length} active={filter === "income"} onClick={() => setFilter("income")} />
        {catList.map((c) => {
          const n = byMonth.filter((t: any) => t.category_id === c.id).length;
          if (!n) return null;
          return (
            <FilterPill
              key={c.id} label={c.name} count={n}
              active={filter === c.id}
              onClick={() => setFilter(c.id)}
            />
          );
        })}
      </div>

      {/* hint + bulk bar */}
      {txList.length > 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 10, fontFamily: "JetBrains Mono, monospace",
          fontSize: 10, color: "var(--ink-faint)",
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          {selected.size === 0 ? (
            <span>
              <kbd>j/k</kbd> move · <kbd>1-9</kbd> assign · <kbd>0</kbd> clear ·{" "}
              <kbd>space</kbd> select · <kbd>e</kbd> edit · <kbd>/</kbd> search
            </span>
          ) : (
            <span>
              <b style={{ color: "var(--accent)" }}>{selected.size} selected</b>
              {" "}— press <kbd>1-9</kbd> to assign, <kbd>esc</kbd> to clear
            </span>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div style={{
          display: "flex", gap: 4, flexWrap: "wrap",
          padding: 10, border: "1px dashed var(--accent)",
          background: "var(--accent-soft)", marginBottom: 12,
        }}>
          {catList.map((c, i) => (
            <button
              key={c.id}
              className="filter-pill"
              onClick={() => bulkAssign(c.id)}
              style={{ borderColor: c.color || "var(--rule)", color: c.color || "var(--ink)" }}
            >
              <span style={{
                display: "inline-block", width: 8, height: 8,
                background: c.color || "var(--ink)", marginRight: 5,
              }} />
              {i < 9 && (
                <span className="mono" style={{ opacity: 0.6, marginRight: 3 }}>
                  {i + 1}
                </span>
              )}
              {c.name}
            </button>
          ))}
          <button onClick={() => bulkAssign(null)} className="filter-pill">✕ clear</button>
          <button onClick={() => setSelected(new Set())} className="filter-pill" style={{ marginLeft: "auto" }}>cancel</button>
        </div>
      )}

      <div className="ledger" ref={listRef}>
        {display.map((t: any, i: number) => {
          if (editingId === t.id && editData) {
            return (
              <LedgerEditRow
                key={t.id}
                initial={editData}
                cats={catList}
                onSave={saveEdit}
                onCancel={() => { setEditingId(null); setEditData(null); }}
              />
            );
          }
          return (
            <LedgerRow
              key={t.id}
              txn={t}
              cats={catList}
              focused={i === focusIdx}
              selected={selected.has(t.id)}
              editing={false}
              onClick={(e) => {
                setFocusIdx(i);
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  toggleSelect(t.id, i, e.shiftKey);
                } else if ((e as any).detail === 2) {
                  // double-click → open receipt drawer (BudgetShell listens)
                  window.dispatchEvent(new CustomEvent("budget:open-receipt", { detail: { id: t.id } }));
                }
              }}
              onToggleSelect={() => toggleSelect(t.id, i, false)}
              onCategoryChange={(catId) => assignCategory(t, catId)}
              onStartEdit={() => startEdit(t)}
              onOpenSplit={() => setSplitId(t.id)}
              onDelete={() => deleteTxn(t.id)}
            />
          );
        })}
        {display.length === 0 && txList.length > 0 && (
          <div style={{
            padding: 50, textAlign: "center", color: "var(--ink-faint)",
            fontStyle: "italic", fontFamily: "Fraunces, Georgia, serif", fontSize: 17,
          }}>
            {filter === "uncategorized"
              ? "All caught up — nothing to categorize ✓"
              : search
                ? `No matches for "${search}"`
                : "Nothing in this filter."}
          </div>
        )}
      </div>

      {splitId && (() => {
        const t = txList.find((x: any) => x.id === splitId);
        if (!t) return null;
        return (
          <LedgerSplitModal
            txn={t}
            cats={catList}
            onApply={applySplit}
            onClose={() => setSplitId(null)}
          />
        );
      })()}
    </div>
  );
}

function FilterPill({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      className={"filter-pill" + (active ? " active" : "")}
      onClick={onClick}
    >
      {label} · {count}
    </button>
  );
}
