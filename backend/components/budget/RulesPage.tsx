"use client";
import React from "react";
import {
  useCategories, useTransactions, useRules,
} from "@/lib/hooks/useData";
import { createRule, deleteRule } from "@/lib/db/client";
import { toLegacyTxns } from "@/lib/budget/adapter";
import { SectionHead, EmptyState, Btn } from "./Primitives";

export function RulesPage() {
  const cats = useCategories();
  const txns = useTransactions({ limit: 2000 });
  const rules = useRules();

  const [pattern, setPattern] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const catList = cats.data ?? [];
  const supaTxns = (txns.data?.transactions ?? []) as any[];
  const rList = rules.data ?? [];

  const legacy = React.useMemo(() => toLegacyTxns(supaTxns, catList), [supaTxns, catList]);

  const names = catList.filter((c: any) => !c.is_income).map((c: any) => c.name);
  const catById = React.useMemo(() => {
    const m: Record<string, any> = {};
    catList.forEach((c: any) => (m[c.id] = c));
    return m;
  }, [catList]);
  const catByName = React.useMemo(() => {
    const m: Record<string, any> = {};
    catList.forEach((c: any) => (m[c.name] = c));
    return m;
  }, [catList]);

  const matches = React.useMemo(() => {
    if (!pattern.trim()) return null;
    const p = pattern.toLowerCase().trim();
    return legacy
      .filter((t: any) => t.description.toLowerCase().includes(p))
      .slice(0, 8);
  }, [pattern, legacy]);

  const addRule = async () => {
    if (!pattern.trim() || !category || busy) return;
    setBusy(true);
    try {
      const cat = catByName[category];
      await createRule({
        pattern: pattern.trim(),
        category_id: cat?.id ?? null,
        priority: (rList.length || 0) + 1,
      });
      setPattern("");
      setCategory("");
      await rules.refresh();
    } finally { setBusy(false); }
  };

  const removeRule = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteRule(id);
      await rules.refresh();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <SectionHead title="Categorization rules" meta={`§07 · ${rList.length} rules`} />
      <p style={{
        color: "var(--ink-muted)", fontSize: 14,
        marginTop: -10, marginBottom: 20, maxWidth: 620,
      }}>
        When a transaction description contains a pattern, auto-assign the category.
        Patterns are case-insensitive substring matches.
      </p>

      <div style={{
        display: "grid", gridTemplateColumns: "2fr 1.2fr auto",
        gap: 8, marginBottom: 10,
      }}>
        <input
          className="inp"
          placeholder="if description contains… (e.g. NETFLIX)"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRule()}
        />
        <select
          className="sel"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">→ category…</option>
          {names.map((c: string) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Btn primary onClick={addRule} disabled={busy}>Add rule</Btn>
      </div>

      {matches && (
        <div style={{
          padding: 12, background: "var(--bg-elev)",
          border: "1px dashed var(--rule)",
          marginBottom: 24, fontSize: 13,
        }}>
          <div className="mono" style={{
            fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
            color: "var(--ink-muted)", marginBottom: 6,
          }}>
            Would match {matches.length} transaction{matches.length === 1 ? "" : "s"}
            {matches.length === 8 ? " (showing first 8)" : ""}
          </div>
          {matches.length === 0 ? (
            <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
              No matches in your current data.
            </span>
          ) : (
            matches.map((m: any, i: number) => (
              <div key={i} style={{
                padding: "3px 0", fontSize: 12,
                color: "var(--ink-muted)",
                fontFamily: "JetBrains Mono, monospace",
              }}>
                {m.description}
              </div>
            ))
          )}
        </div>
      )}

      {rList.length === 0 ? (
        <EmptyState>
          No rules yet. Add one above, or categorize transactions and merchants will
          start to be remembered automatically.
        </EmptyState>
      ) : (
        <table className="report">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>→ Category</th>
              <th className="num">Priority</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rList
              .slice()
              .sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0))
              .map((r: any) => {
                const cat = catById[r.category_id];
                return (
                  <tr key={r.id}>
                    <td style={{ fontSize: 13 }}>
                      contains “<b>{r.pattern}</b>”
                    </td>
                    <td>
                      {cat ? (
                        <span className="pill" style={{ color: cat.color || "var(--ink)" }}>
                          <span className="dot" />
                          {cat.name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
                          (deleted)
                        </span>
                      )}
                    </td>
                    <td className="num mono">{r.priority ?? 0}</td>
                    <td className="num">
                      <Btn small danger onClick={() => removeRule(r.id)} disabled={busy}>
                        Delete
                      </Btn>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
    </div>
  );
}
