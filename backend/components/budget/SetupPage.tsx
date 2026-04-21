"use client";
import React from "react";
import {
  useCategories, useBudgets, useTransactions,
} from "@/lib/hooks/useData";
import {
  createCategory, updateCategory, deleteCategory, upsertBudgets,
} from "@/lib/db/client";
import { fmtMoney } from "@/lib/budget";
import { loadDemoData } from "@/lib/budget/demo-loader";
import { parseCSV } from "@/lib/budget/csv";
import { createTransaction } from "@/lib/db/client";
import { readLegacyJSON, importLegacyDump } from "@/lib/budget/json-import";
import { SectionHead, EmptyState, Btn } from "./Primitives";
import { DangerZone } from "./DangerZone";

const PALETTE = [
  "#c8554b", "#d48a3c", "#c9a94a", "#7a9c5c", "#5a8a8a",
  "#6b8ab8", "#8b6fb3", "#b36f8f", "#8a6a4a", "#6a6a6a",
];

function colorFor(idx: number) {
  return PALETTE[idx % PALETTE.length];
}

export function SetupPage({ userEmail }: { userEmail: string }) {
  const cats = useCategories();
  const budgets = useBudgets();
  const txns = useTransactions({ limit: 1 });

  const catList = cats.data ?? [];
  const budgetList = budgets.data ?? [];
  const hasTxns = (txns.data?.transactions?.length ?? 0) > 0;

  const [catInput, setCatInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [importReport, setImportReport] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const jsonRef = React.useRef<HTMLInputElement>(null);

  // Local budget overrides (edited but not yet saved)
  const [budgetDraft, setBudgetDraft] = React.useState<Record<string, string>>({});

  // Build a map from cat_id → amount (server) merged with draft
  const savedByCat: Record<string, number> = React.useMemo(() => {
    const m: Record<string, number> = {};
    budgetList.forEach((b: any) => { m[b.category_id] = Number(b.amount) || 0; });
    return m;
  }, [budgetList]);

  const dirty = Object.keys(budgetDraft).length > 0;

  const addCategory = async () => {
    const name = catInput.trim();
    if (!name || busy) return;
    if (catList.find((c: any) => c.name.toLowerCase() === name.toLowerCase())) {
      setFlash("That category already exists");
      setTimeout(() => setFlash(null), 2000);
      return;
    }
    setBusy(true);
    try {
      await createCategory({
        name,
        color: colorFor(catList.length),
        is_income: false,
        sort_order: catList.length,
      });
      setCatInput("");
      await cats.refresh();
    } finally { setBusy(false); }
  };

  const removeCategory = async (id: string) => {
    if (busy) return;
    if (!confirm("Delete this category? Transactions assigned to it will become uncategorized.")) return;
    setBusy(true);
    try {
      await deleteCategory(id);
      await cats.refresh();
      await budgets.refresh();
    } finally { setBusy(false); }
  };

  const saveBudgets = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const entries = Object.entries(budgetDraft).map(([category_id, v]) => ({
        category_id,
        amount: parseFloat(v) || 0,
      }));
      await upsertBudgets(entries);
      setBudgetDraft({});
      await budgets.refresh();
      setFlash("Budgets saved");
      setTimeout(() => setFlash(null), 1800);
    } finally { setBusy(false); }
  };

  const totalBudget = budgetList.reduce<number>(
    (s: number, b: any) => s + (Number(b.amount) || 0), 0
  );

  const loadDemo = async () => {
    if (busy) return;
    if (hasTxns && !confirm("You already have transactions. Add demo transactions alongside them?")) return;
    setBusy(true);
    setImportReport("Loading 3 months of realistic demo data…");
    try {
      const res = await loadDemoData(catList);
      await Promise.all([cats.refresh(), budgets.refresh(), txns.refresh()]);
      setImportReport(`Loaded ${res.txnsCreated} transactions · ${res.catsCreated} new categories`);
      setTimeout(() => setImportReport(null), 5000);
    } catch (e: any) {
      setImportReport("Demo load failed: " + (e?.message || "unknown error"));
    } finally { setBusy(false); }
  };

  const onCSVFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so the same file can be re-picked
    setBusy(true);
    setImportReport(`Parsing ${file.name}…`);
    try {
      const text = await file.text();
      const { rows, errors } = parseCSV(text);
      if (errors.length && !rows.length) {
        setImportReport("CSV error: " + errors.join("; "));
        return;
      }
      setImportReport(`Found ${rows.length} rows — importing…`);
      let done = 0;
      const BATCH = 10;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        await Promise.all(chunk.map((r) =>
          createTransaction({
            date: r.date,
            description: r.description,
            amount: r.amount,
            is_income: r.is_income,
            source: "csv",
            source_file: file.name,
          })
        ));
        done += chunk.length;
        setImportReport(`Imported ${done} / ${rows.length}…`);
      }
      await txns.refresh();
      setImportReport(`Imported ${done} transactions from ${file.name}`);
      setTimeout(() => setImportReport(null), 6000);
    } catch (err: any) {
      setImportReport("Import failed: " + (err?.message || "unknown error"));
    } finally { setBusy(false); }
  };

  // One-time migration from the legacy standalone HTML.
  // Old app's Export JSON dumps categories/budgets/txns/rules/goals.
  const onJSONFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!file.name.toLowerCase().endsWith(".json")) {
      setImportReport("Pick a .json file (from the old app's Export JSON button).");
      return;
    }
    setBusy(true);
    setImportReport(`Reading ${file.name}…`);
    try {
      const dump = await readLegacyJSON(file);
      const res = await importLegacyDump(
        dump,
        { categories: (cats.data ?? []) as any },
        (msg) => setImportReport(msg),
      );
      // Pull fresh data in now that the writes are in flight.
      await Promise.all([cats.refresh(), budgets.refresh(), txns.refresh()]);
      const parts = [
        `${res.txnsCreated} txns imported`,
        res.txnsSkipped ? `${res.txnsSkipped} skipped` : null,
        res.catsCreated ? `${res.catsCreated} new cats` : null,
        res.catsReused ? `${res.catsReused} reused` : null,
        res.budgetsUpserted ? `${res.budgetsUpserted} budgets` : null,
        res.rulesCreated ? `${res.rulesCreated} rules` : null,
        res.goalsCreated ? `${res.goalsCreated} goals` : null,
      ].filter(Boolean).join(" · ");
      setImportReport(`Imported from ${file.name}: ${parts}`);
      if (res.warnings.length) {
        // Surface first few warnings in console so it's debuggable.
        console.warn(`[ledger] JSON import warnings (${res.warnings.length}):`);
        res.warnings.slice(0, 20).forEach((w) => console.warn("  " + w));
      }
      setTimeout(() => setImportReport(null), 8000);
    } catch (err: any) {
      setImportReport("JSON import failed: " + (err?.message || "unknown error"));
    } finally { setBusy(false); }
  };

  const spending = catList.filter((c: any) => !c.is_income);
  const incomeCats = catList.filter((c: any) => c.is_income);

  return (
    <div>
      <SectionHead title="Setup" meta={userEmail} />

      {flash && (
        <div className="flash" style={{ marginBottom: 20 }}>
          {flash}
        </div>
      )}

      <h3 className="section-sub-h">Get data in</h3>
      <p style={{
        color: "var(--ink-muted)", fontSize: 14,
        marginTop: -4, marginBottom: 18, maxWidth: 620,
      }}>
        Start with demo data to explore every feature, or upload a CSV export from your
        bank. All imports land in your ledger and can be categorized with AI.
      </p>
      <div style={{
        display: "flex", gap: 12, flexWrap: "wrap",
        padding: 18,
        background: "var(--panel-soft, rgba(0,0,0,0.02))",
        border: "1px solid var(--rule-soft)",
        borderRadius: 6, marginBottom: 24,
      }}>
        <Btn primary onClick={loadDemo} disabled={busy}>
          {busy && importReport?.startsWith("Load") ? "Loading…" : "Load demo data"}
        </Btn>
        <a href="/app/imports/new" className="btn primary" style={{ textDecoration: "none" }}>
          Import wizard →
        </a>
        <Btn ghost onClick={() => fileRef.current?.click()} disabled={busy}>
          Quick CSV upload
        </Btn>
        <input ref={fileRef} type="file" accept=".csv"
          onChange={onCSVFile} style={{ display: "none" }} />
        <Btn ghost onClick={() => jsonRef.current?.click()} disabled={busy}
             title="Import from the old standalone HTML app's Export JSON">
          Import from JSON
        </Btn>
        <input ref={jsonRef} type="file" accept=".json,application/json"
          onChange={onJSONFile} style={{ display: "none" }} />
        {importReport && (
          <span style={{
            marginLeft: "auto", alignSelf: "center",
            fontSize: 13, color: "var(--ink-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {importReport}
          </span>
        )}
      </div>

      <h3 className="section-sub-h">Spending categories</h3>
      <p style={{
        color: "var(--ink-muted)", fontSize: 14,
        marginTop: -4, marginBottom: 18, maxWidth: 620,
      }}>
        Define buckets for your spending. Set a monthly target for each — anything at
        zero will still track but won't flag as over-budget.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input className="inp" value={catInput}
          onChange={(e) => setCatInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          placeholder="New category…" style={{ flex: 1 }} disabled={busy} />
        <Btn primary onClick={addCategory} disabled={busy}>Add</Btn>
      </div>

      {spending.length === 0 ? (
        <EmptyState>Add your first spending category above.</EmptyState>
      ) : (
        <div>
          {spending.map((c: any) => {
            const draft = budgetDraft[c.id];
            const saved = savedByCat[c.id] ?? 0;
            const displayVal = draft !== undefined ? draft : saved ? String(saved) : "";
            return (
              <div key={c.id} style={{
                display: "grid",
                gridTemplateColumns: "14px 1fr auto auto 28px",
                gap: 14, alignItems: "center", padding: "14px 4px",
                borderBottom: "1px solid var(--rule-soft)",
              }}>
                <span className="cat-swatch" style={{ background: c.color || "var(--ink-muted)" }} />
                <span style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 17 }}>
                  {c.name}
                </span>
                <span className="mono" style={{ color: "var(--ink-muted)", fontSize: 12 }}>$</span>
                <input type="number" className="inp" placeholder="0"
                  value={displayVal}
                  onChange={(e) => setBudgetDraft({ ...budgetDraft, [c.id]: e.target.value })}
                  style={{ width: 100, textAlign: "right" }} />
                <button
                  onClick={() => removeCategory(c.id)}
                  style={{
                    background: "none", border: "none",
                    color: "var(--ink-faint)", cursor: "pointer", fontSize: 18,
                  }}
                  title="Delete"
                >×</button>
              </div>
            );
          })}

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 16, padding: "10px 4px",
          }}>
            <span className="mono" style={{ color: "var(--ink-muted)", fontSize: 12 }}>
              TOTAL MONTHLY BUDGET · <b className="num" style={{ color: "var(--ink)" }}>
                {fmtMoney(totalBudget)}
              </b>
            </span>
            <Btn primary onClick={saveBudgets} disabled={!dirty || busy}>
              {dirty ? `Save changes (${Object.keys(budgetDraft).length})` : "Saved"}
            </Btn>
          </div>
        </div>
      )}

      {incomeCats.length > 0 && (
        <>
          <h3 className="section-sub-h" style={{ marginTop: 36 }}>Income categories</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {incomeCats.map((c: any) => (
              <span key={c.id} className="pill" style={{ color: c.color || "var(--good)" }}>
                <span className="dot" />
                {c.name}
              </span>
            ))}
          </div>
        </>
      )}

      <h3 className="section-sub-h" style={{ marginTop: 36 }}>Account</h3>
      <div className="flash info">
        Signed in as <b>{userEmail}</b>.
        {hasTxns
          ? " Your data is stored in Supabase and syncs across devices."
          : " Add or import transactions to unlock dashboards."}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <a href="/app/try" className="btn">Raw backend tester →</a>
        <a href="/app/offline" className="btn ghost">Offline test →</a>
      </div>

      <DangerZone />
    </div>
  );
}
