"use client";
/**
 * ImportWizard — the review UI that sits between the file upload and committing
 * transactions to the ledger.
 *
 * Stages (linear; user can also go back):
 *   0 "pick"    — drop/select a file
 *   1 "mapping" — confirm which column is date/description/amount (AI + heuristic)
 *   2 "review"  — per-row: edit/override, skip duplicates, flip is_income
 *   3 "committing" / "done"
 *
 * Styling: matches BudgetShell's newspaper aesthetic — .inp / .sel / .btn /
 * .pill / .report all come from globals.css.
 */
import React from "react";
import Link from "next/link";
import { SectionHead, Btn, EmptyState, Flash } from "./Primitives";
import {
  useCategories, useRules, useTransactions,
} from "@/lib/hooks/useData";
import { fmtMoney } from "@/lib/budget";
import {
  parseFile, getInitialMapping, refineMappingWithAI, buildReviewRows,
} from "@/lib/import/pipeline";
import { normalizeRows } from "@/lib/import/normalize";
import { commitImport, type CommitResult } from "@/lib/import/commit";
import type {
  RawTable, ColumnMapping, ReviewRow, RoleName,
} from "@/lib/import/types";

type Stage = "pick" | "mapping" | "review" | "committing" | "done";

const ROLES: { role: RoleName; label: string }[] = [
  { role: "date",        label: "Date" },
  { role: "description", label: "Description" },
  { role: "amount",      label: "Amount (signed)" },
  { role: "debit",       label: "Debit (out)" },
  { role: "credit",      label: "Credit (in)" },
  { role: "category",    label: "Category" },
  { role: "notes",       label: "Notes" },
  { role: "ignore",      label: "— ignore —" },
];

export function ImportWizard() {
  const cats = useCategories();
  const rules = useRules();
  // Preload txns so dedupe has fresh data to compare against.
  const txns = useTransactions({ limit: 2000 });

  const [stage, setStage] = React.useState<Stage>("pick");
  const [file, setFile] = React.useState<File | null>(null);
  const [table, setTable] = React.useState<RawTable | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null);
  const [rows, setRows] = React.useState<ReviewRow[]>([]);
  const [scanStats, setScanStats] = React.useState<{ checked_against: number; intra_dup: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CommitResult | null>(null);

  const catList = (cats.data ?? []) as any[];
  const ruleList = (rules.data ?? []) as any[];

  /* ============ Stage 0: pick ============ */

  const onPickFile = async (f: File) => {
    setFile(f);
    setBusy(true);
    setMsg(`Parsing ${f.name}…`);
    try {
      const t = await parseFile(f);
      setTable(t);
      const heuristic = getInitialMapping(t);
      setMapping(heuristic);
      if (!t.rows.length) {
        setMsg(t.warnings.join(" · ") || "No rows detected.");
        setStage("mapping");
        return;
      }
      setMsg(`${t.rows.length} rows · ${t.headers.length} columns detected`);
      setStage("mapping");
      // Fire AI refine in background (user can proceed before it returns).
      refineMappingWithAI(t, heuristic).then(res => {
        if (res.error) setAiError(res.error);
        else setMapping(res.mapping);
      });
    } catch (e: any) {
      setMsg(`Parse failed: ${e?.message ?? e}`);
    } finally { setBusy(false); }
  };

  /* ============ Stage 1 → 2: apply mapping ============ */

  const applyMapping = async () => {
    if (!table || !mapping) return;
    setBusy(true);
    setMsg("Checking for duplicates…");
    try {
      // Make sure dedupe scans against fresh txns.
      await txns.refresh().catch(() => {});
      const { rows, scan } = await buildReviewRows(table, mapping);
      setRows(rows);
      setScanStats(scan);
      setStage("review");
      setMsg(`Reviewing ${rows.length} rows`);
    } catch (e: any) {
      setMsg(`Could not build review: ${e?.message ?? e}`);
    } finally { setBusy(false); }
  };

  /* ============ Stage 2: row actions ============ */

  const toggleDecision = (idx: number) => {
    setRows(rs => rs.map(r =>
      r.idx === idx ? { ...r, decision: r.decision === "import" ? "skip" : "import" } : r
    ));
  };
  const setOverride = (idx: number, catId: string | null) => {
    setRows(rs => rs.map(r => r.idx === idx ? { ...r, override_category_id: catId } : r));
  };
  const toggleIncome = (idx: number) => {
    setRows(rs => rs.map(r => r.idx === idx ? { ...r, is_income: !r.is_income } : r));
  };

  const bulkSetDecision = (filter: (r: ReviewRow) => boolean, d: "import" | "skip") => {
    setRows(rs => rs.map(r => (filter(r) ? { ...r, decision: d } : r)));
  };

  /* ============ Stage 3: commit ============ */

  const commit = async () => {
    if (!table || !mapping) return;
    setStage("committing");
    setBusy(true);
    try {
      const res = await commitImport(
        { filename: table.filename, kind: table.kind, mapping, rows, warnings: table.warnings },
        { rules: ruleList, categories: catList },
        { onProgress: m => setMsg(m) },
      );
      setResult(res);
      setStage("done");
      // Refresh caches so the ledger reflects new txns immediately.
      await txns.refresh().catch(() => {});
    } catch (e: any) {
      setMsg(`Commit failed: ${e?.message ?? e}`);
      setStage("review");
    } finally { setBusy(false); }
  };

  /* ============ Render ============ */

  return (
    <div>
      <SectionHead
        title={
          <span>
            <i>Import</i> <b>transactions</b>
          </span>
        }
        meta={
          <>
            <Link className="btn ghost" href="/app">
              ← Back to app
            </Link>
            {stage !== "pick" && stage !== "done" && (
              <Btn ghost onClick={() => { setStage("pick"); setFile(null); setTable(null); setRows([]); setResult(null); setMsg(null); }}>
                Start over
              </Btn>
            )}
          </>
        }
      />

      {/* Stepper */}
      <Stepper stage={stage} />

      {msg && stage !== "done" && (
        <div className="flash info" style={{ marginBottom: 20, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
          {msg}
          {busy && " …"}
        </div>
      )}

      {stage === "pick"       && <PickStage onFile={onPickFile} disabled={busy} />}
      {stage === "mapping"    && table && mapping && (
        <MappingStage
          table={table}
          mapping={mapping}
          aiError={aiError}
          onChange={setMapping}
          onNext={applyMapping}
          disabled={busy}
        />
      )}
      {stage === "review"     && table && mapping && (
        <ReviewStage
          rows={rows}
          categories={catList}
          scanStats={scanStats}
          onToggleDecision={toggleDecision}
          onSetOverride={setOverride}
          onToggleIncome={toggleIncome}
          onBulkSetDecision={bulkSetDecision}
          onBack={() => setStage("mapping")}
          onCommit={commit}
          disabled={busy}
        />
      )}
      {stage === "committing" && (
        <EmptyState>Committing… keep this tab open.</EmptyState>
      )}
      {stage === "done" && result && (
        <DoneStage result={result} filename={file?.name ?? ""} />
      )}
    </div>
  );
}

/* ============================================================================
 * Stepper
 * ==========================================================================*/

function Stepper({ stage }: { stage: Stage }) {
  const steps: { key: Stage; label: string }[] = [
    { key: "pick",    label: "1. File" },
    { key: "mapping", label: "2. Columns" },
    { key: "review",  label: "3. Review" },
    { key: "done",    label: "4. Done" },
  ];
  const order: Stage[] = ["pick", "mapping", "review", "committing", "done"];
  const curIdx = order.indexOf(stage);
  return (
    <div style={{
      display: "flex", gap: 24, marginBottom: 24, paddingBottom: 14,
      borderBottom: "1px solid var(--rule-soft)",
      fontFamily: "JetBrains Mono, monospace", fontSize: 11,
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}>
      {steps.map((s, i) => {
        const done = i < order.indexOf(stage === "committing" ? "review" : stage);
        const active = s.key === stage || (s.key === "review" && stage === "committing");
        return (
          <span key={s.key} style={{
            color: active ? "var(--ink)" : done ? "var(--ink-muted)" : "var(--ink-faint)",
            fontWeight: active ? 700 : 400,
          }}>
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

/* ============================================================================
 * Stage 0: file picker
 * ==========================================================================*/

function PickStage({ onFile, disabled }: { onFile: (f: File) => void; disabled: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);

  return (
    <div>
      <p style={{ color: "var(--ink-muted)", fontSize: 14, marginBottom: 20, maxWidth: 640 }}>
        Drop a file below — CSV, TSV, Excel (.xlsx), OFX/QFX, JSON, or PDF statements.
        We'll detect the columns, flag duplicates, and auto-categorize with your rules
        plus AI before you commit.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        style={{
          border: `2px dashed ${drag ? "var(--ink)" : "var(--rule)"}`,
          padding: "56px 24px", textAlign: "center",
          background: drag ? "var(--bg-elev)" : "transparent",
          transition: "all .15s ease", cursor: "pointer",
          borderRadius: 4,
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 22, marginBottom: 6 }}>
          Drop a file, or click to browse
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", fontFamily: "JetBrains Mono, monospace" }}>
          .csv · .tsv · .xlsx · .ofx · .qfx · .json · .pdf · .txt
        </div>
        <input
          ref={inputRef} type="file"
          accept=".csv,.tsv,.tab,.xlsx,.xls,.ofx,.qfx,.json,.pdf,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (f) onFile(f);
          }}
          disabled={disabled}
          style={{ display: "none" }}
        />
      </div>

      <div style={{ marginTop: 28, color: "var(--ink-muted)", fontSize: 13 }}>
        <b>Tip:</b> Your bank's "Download transactions" button is a good source.
        Many banks offer both CSV and OFX — either works.
      </div>
    </div>
  );
}

/* ============================================================================
 * Stage 1: column mapping
 * ==========================================================================*/

function MappingStage({
  table, mapping, aiError, onChange, onNext, disabled,
}: {
  table: RawTable;
  mapping: ColumnMapping;
  aiError: string | null;
  onChange: (m: ColumnMapping) => void;
  onNext: () => void;
  disabled: boolean;
}) {
  const updateCol = (header: string, role: RoleName) => {
    onChange({ ...mapping, columns: { ...mapping.columns, [header]: role } });
  };

  // Preview the first 5 rows as they'll be normalized.
  const preview = React.useMemo(() => {
    if (!table.rows.length) return [];
    const sample: RawTable = { ...table, rows: table.rows.slice(0, 5) };
    return normalizeRows(sample, mapping);
  }, [table, mapping]);

  // Sanity checks.
  const hasDate = Object.values(mapping.columns).includes("date");
  const hasDesc = Object.values(mapping.columns).includes("description");
  const hasAmt  = Object.values(mapping.columns).includes("amount")
               || (Object.values(mapping.columns).includes("debit")
                   || Object.values(mapping.columns).includes("credit"));
  const ready = hasDate && hasDesc && hasAmt;

  return (
    <div>
      {table.warnings.length > 0 && (
        <div className="flash" style={{ marginBottom: 18 }}>
          {table.warnings.join(" · ")}
        </div>
      )}

      {mapping.rationale && (
        <p style={{
          color: "var(--ink-muted)", fontSize: 13, fontStyle: "italic",
          marginBottom: 18, padding: "10px 14px",
          background: "var(--bg-elev)", borderLeft: "3px solid var(--ink-muted)",
        }}>
          <span className="mono" style={{ fontStyle: "normal", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginRight: 8 }}>
            AI note
          </span>
          {mapping.rationale}
          {aiError && (
            <span style={{ color: "var(--bad, #c8554b)", marginLeft: 10 }}>
              (AI advisor: {aiError})
            </span>
          )}
        </p>
      )}

      <h3 className="section-sub-h" style={{ marginBottom: 8 }}>Column roles</h3>

      <table className="report" style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={{ width: "30%" }}>Header</th>
            <th style={{ width: "25%" }}>Role</th>
            <th>Sample values</th>
          </tr>
        </thead>
        <tbody>
          {table.headers.map(h => {
            const samples = table.rows.slice(0, 3).map(r => r[table.headers.indexOf(h)]).filter(Boolean);
            return (
              <tr key={h}>
                <td><b>{h}</b></td>
                <td>
                  <select
                    className="sel"
                    value={mapping.columns[h] ?? "ignore"}
                    onChange={(e) => updateCol(h, e.target.value as RoleName)}
                    disabled={disabled}
                    style={{ width: "100%" }}
                  >
                    {ROLES.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
                  </select>
                </td>
                <td style={{ fontSize: 12, color: "var(--ink-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                  {samples.length ? samples.join(" · ") : <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>(empty)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Convention + date format */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Sign:</span>
          <select
            className="sel"
            value={mapping.amount_convention ?? "negative_is_spending"}
            onChange={(e) => onChange({ ...mapping, amount_convention: e.target.value as any })}
          >
            <option value="negative_is_spending">Negatives = spending</option>
            <option value="positive_is_spending">Positives = spending</option>
          </select>
        </label>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Date:</span>
          <select
            className="sel"
            value={mapping.date_format ?? "auto"}
            onChange={(e) => onChange({ ...mapping, date_format: e.target.value as any })}
          >
            <option value="auto">auto-detect</option>
            <option value="iso">ISO (2024-03-15)</option>
            <option value="us">US (03/15/2024)</option>
            <option value="eu">EU (15/03/2024)</option>
          </select>
        </label>
      </div>

      {/* Live preview */}
      <h3 className="section-sub-h" style={{ marginTop: 32, marginBottom: 8 }}>Preview (first 5 rows)</h3>
      <table className="report" style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={{ width: 100 }}>Date</th>
            <th>Description</th>
            <th className="num">Amount</th>
            <th style={{ width: 90 }}>Type</th>
            <th style={{ width: 200 }}>Issues</th>
          </tr>
        </thead>
        <tbody>
          {preview.length === 0 && (
            <tr><td colSpan={5} style={{ color: "var(--ink-faint)", fontStyle: "italic", padding: 12 }}>No rows to preview.</td></tr>
          )}
          {preview.map(p => (
            <tr key={p.idx}>
              <td className="mono" style={{ fontSize: 12 }}>{p.date || "—"}</td>
              <td style={{ fontSize: 13 }}>{p.description || <i>(missing)</i>}</td>
              <td className="num mono" style={{ color: p.issues.length ? "var(--bad, #c8554b)" : undefined }}>
                {p.amount ? fmtMoney(p.amount) : "—"}
              </td>
              <td style={{ fontSize: 12 }}>
                {p.is_income ? <span style={{ color: "var(--good, #7a9c5c)" }}>income</span> : "spending"}
              </td>
              <td style={{ fontSize: 12, color: "var(--bad, #c8554b)" }}>
                {p.issues.join(", ") || <span style={{ color: "var(--ink-faint)" }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!ready && (
        <div className="flash" style={{ marginBottom: 16 }}>
          Map at least a <b>date</b>, <b>description</b>, and <b>amount</b> (or debit/credit) before continuing.
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn primary onClick={onNext} disabled={!ready || disabled}>
          Continue to review →
        </Btn>
      </div>
    </div>
  );
}

/* ============================================================================
 * Stage 2: per-row review
 * ==========================================================================*/

function ReviewStage({
  rows, categories, scanStats,
  onToggleDecision, onSetOverride, onToggleIncome, onBulkSetDecision,
  onBack, onCommit, disabled,
}: {
  rows: ReviewRow[];
  categories: any[];
  scanStats: { checked_against: number; intra_dup: number } | null;
  onToggleDecision: (idx: number) => void;
  onSetOverride: (idx: number, catId: string | null) => void;
  onToggleIncome: (idx: number) => void;
  onBulkSetDecision: (filter: (r: ReviewRow) => boolean, d: "import" | "skip") => void;
  onBack: () => void;
  onCommit: () => void;
  disabled: boolean;
}) {
  const [filter, setFilter] = React.useState<"all" | "import" | "skip" | "dupe" | "issues">("all");
  const [q, setQ] = React.useState("");

  const importing = rows.filter(r => r.decision === "import").length;
  const skipping  = rows.filter(r => r.decision === "skip").length;
  const dupes     = rows.filter(r => r.dedupe.kind !== "unique").length;
  const withIssues = rows.filter(r => r.issues.length > 0).length;

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === "import" && r.decision !== "import") return false;
      if (filter === "skip"   && r.decision !== "skip")   return false;
      if (filter === "dupe"   && r.dedupe.kind === "unique") return false;
      if (filter === "issues" && !r.issues.length) return false;
      if (qq && !r.description.toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [rows, filter, q]);

  const spending = categories.filter((c: any) => !c.is_income && !c.deleted_at);
  const incomeCats = categories.filter((c: any) => c.is_income && !c.deleted_at);

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center",
        padding: "12px 16px", marginBottom: 16,
        background: "var(--bg-elev)", border: "1px solid var(--rule-soft)",
      }}>
        <SummaryStat label="Total" value={String(rows.length)} />
        <SummaryStat label="Importing" value={String(importing)} accent="good" />
        <SummaryStat label="Skipping" value={String(skipping)} />
        <SummaryStat label="Duplicates" value={String(dupes)} accent={dupes ? "warn" : undefined} />
        <SummaryStat label="Issues" value={String(withIssues)} accent={withIssues ? "warn" : undefined} />
        {scanStats && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-faint)", fontFamily: "JetBrains Mono, monospace" }}>
            checked against {scanStats.checked_against} existing · {scanStats.intra_dup} in-batch dupes
          </span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {([
          ["all",     `All (${rows.length})`],
          ["import",  `Importing (${importing})`],
          ["skip",    `Skipping (${skipping})`],
          ["dupe",    `Duplicates (${dupes})`],
          ["issues",  `With issues (${withIssues})`],
        ] as const).map(([k, lbl]) => (
          <button
            key={k}
            className={"tab" + (filter === k ? " active" : "")}
            onClick={() => setFilter(k)}
            style={{ fontSize: 11 }}
          >
            {lbl}
          </button>
        ))}
        <input
          className="inp" placeholder="filter by description…"
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />

        {/* Bulk actions */}
        <Btn small ghost onClick={() => onBulkSetDecision(() => true, "import")} disabled={disabled}>
          All → import
        </Btn>
        <Btn small ghost onClick={() => onBulkSetDecision(r => r.dedupe.kind !== "unique", "skip")} disabled={disabled}>
          Skip all dupes
        </Btn>
      </div>

      {/* Table */}
      <div style={{ maxHeight: 520, overflowY: "auto", border: "1px solid var(--rule-soft)" }}>
        <table className="report" style={{ marginBottom: 0 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg)", zIndex: 1 }}>
            <tr>
              <th style={{ width: 70 }}>Import?</th>
              <th style={{ width: 100 }}>Date</th>
              <th>Description</th>
              <th className="num" style={{ width: 110 }}>Amount</th>
              <th style={{ width: 70 }}>Type</th>
              <th style={{ width: 220 }}>Category</th>
              <th style={{ width: 170 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>
                No rows match this filter.
              </td></tr>
            )}
            {filtered.map(r => {
              const hasIssue = r.issues.length > 0;
              const dupe = r.dedupe.kind !== "unique";
              return (
                <tr key={r.idx} style={{
                  opacity: r.decision === "skip" ? 0.45 : 1,
                  background: hasIssue ? "color-mix(in srgb, var(--bad, #c8554b) 6%, transparent)"
                    : dupe ? "color-mix(in srgb, #d48a3c 5%, transparent)"
                    : undefined,
                }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.decision === "import"}
                      onChange={() => onToggleDecision(r.idx)}
                      disabled={disabled}
                    />
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.date || "—"}</td>
                  <td style={{ fontSize: 13 }}>
                    <div>{r.description || <i>(missing)</i>}</div>
                    {r.notes && (
                      <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>
                        {r.notes}
                      </div>
                    )}
                  </td>
                  <td className="num mono" style={{ fontSize: 13 }}>
                    {r.amount ? fmtMoney(r.amount) : "—"}
                  </td>
                  <td>
                    <button
                      onClick={() => onToggleIncome(r.idx)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 11, padding: 0,
                        color: r.is_income ? "var(--good, #7a9c5c)" : "var(--ink-muted)",
                        textDecoration: "underline dotted",
                      }}
                      title="Click to toggle income/spending"
                    >
                      {r.is_income ? "income" : "spending"}
                    </button>
                  </td>
                  <td>
                    <select
                      className="sel" style={{ width: "100%", fontSize: 12 }}
                      value={r.override_category_id ?? ""}
                      onChange={(e) => onSetOverride(r.idx, e.target.value || null)}
                      disabled={disabled}
                    >
                      <option value="">— auto (rule / AI) —</option>
                      {(r.is_income ? incomeCats : spending).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {hasIssue && (
                      <div style={{ color: "var(--bad, #c8554b)" }}>
                        {r.issues.join(", ")}
                      </div>
                    )}
                    {dupe && (
                      <div style={{ color: "#d48a3c", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>
                        {r.dedupe.kind === "exact" ? "EXACT DUPE" : "FUZZY DUPE"}
                        {" · "}
                        {r.dedupe.candidates?.[0]?.reason}
                      </div>
                    )}
                    {!hasIssue && !dupe && (
                      <span style={{ color: "var(--ink-faint)" }}>new</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 10 }}>
        <Btn ghost onClick={onBack} disabled={disabled}>← Back to columns</Btn>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", marginLeft: "auto", marginRight: 12 }}>
          Will import <b style={{ color: "var(--ink)" }}>{importing}</b> · skip {skipping}
        </div>
        <Btn primary onClick={onCommit} disabled={!importing || disabled}>
          Commit {importing} transaction{importing === 1 ? "" : "s"}
        </Btn>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: "good" | "warn" }) {
  const color =
    accent === "good" ? "var(--good, #7a9c5c)" :
    accent === "warn" ? "#d48a3c" : "var(--ink)";
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
        {label}
      </span>
      <span className="num" style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "Fraunces, Georgia, serif" }}>
        {value}
      </span>
    </div>
  );
}

/* ============================================================================
 * Stage 3: done
 * ==========================================================================*/

function DoneStage({ result, filename }: { result: CommitResult; filename: string }) {
  return (
    <div>
      <Flash kind="info">
        ✓ <b>{result.imported}</b> transactions imported from <b>{filename}</b>.
        {result.categorized_by_rule > 0 && ` ${result.categorized_by_rule} categorized by rules.`}
        {result.categorized_by_ai > 0 && ` ${result.categorized_by_ai} by AI.`}
        {result.duplicate > 0 && ` ${result.duplicate} duplicate${result.duplicate === 1 ? "" : "s"} skipped.`}
      </Flash>

      {result.warnings.length > 0 && (
        <div className="flash" style={{ marginTop: 16 }}>
          <b>Warnings ({result.warnings.length}):</b>
          <ul style={{ margin: "6px 0 0 20px", fontSize: 13 }}>
            {result.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
            {result.warnings.length > 10 && <li>… and {result.warnings.length - 10} more</li>}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <Link className="btn primary" href="/app">Open ledger →</Link>
        <Link className="btn ghost" href="/app/imports/new">Import another file</Link>
        {result.batch_id && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-faint)", alignSelf: "center", fontFamily: "JetBrains Mono, monospace" }}>
            Batch {result.batch_id.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
}
