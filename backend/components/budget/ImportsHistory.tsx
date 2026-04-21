"use client";
/**
 * ImportsHistory — list of the user's import batches, with undo (delete all
 * transactions under the batch) and re-run (jump back to the wizard with the
 * stashed raw + mapping, if available).
 *
 * The undo DELETE hits /api/imports/[id], which hard-deletes every txn that
 * references the batch. Re-run just links to /app/imports/new?replay=<id> —
 * the wizard reads the batch server-side and seeds the pipeline from it.
 */
import React from "react";
import Link from "next/link";
import { SectionHead, Btn, EmptyState, Flash } from "./Primitives";
import { useTransactions } from "@/lib/hooks/useData";

type Batch = {
  id: string;
  filename: string;
  file_kind: string;
  status: "pending" | "committed" | "failed" | "undone";
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  rows_duplicate: number;
  warnings: string[] | null;
  created_at: string;
};

export function ImportsHistory() {
  const [batches, setBatches] = React.useState<Batch[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const txns = useTransactions({ limit: 1 }); // only used to refresh after undo

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/imports");
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) throw new Error(json?.error || `http_${res.status}`);
      setBatches(json.data as Batch[]);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const undo = async (b: Batch) => {
    if (!confirm(
      `Undo "${b.filename}"?\n\n` +
      `This will permanently delete ${b.rows_imported} transaction${b.rows_imported === 1 ? "" : "s"} ` +
      `that were imported from this file.`
    )) return;
    setBusyId(b.id);
    try {
      const res = await fetch(`/api/imports/${b.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) throw new Error(json?.error || `http_${res.status}`);
      setFlash(`Undone — removed ${json.data.deleted_transactions ?? 0} transactions`);
      await Promise.all([load(), txns.refresh().catch(() => {})]);
      setTimeout(() => setFlash(null), 4000);
    } catch (e: any) {
      setFlash("Undo failed: " + (e?.message || e));
    } finally { setBusyId(null); }
  };

  return (
    <div>
      <SectionHead
        title={<span><i>Import</i> <b>history</b></span>}
        meta={
          <>
            <Link className="btn ghost" href="/app">← Back to app</Link>
            <Link className="btn primary" href="/app/imports/new">New import</Link>
          </>
        }
      />

      {flash && <Flash kind="info">{flash}</Flash>}
      {error && (
        <div className="flash" style={{ marginBottom: 16 }}>
          Could not load imports: <code>{error}</code>
        </div>
      )}

      {batches === null && !error && (
        <div className="flash info" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
          Loading…
        </div>
      )}

      {batches && batches.length === 0 && (
        <EmptyState>
          No imports yet. Start your first one from the{" "}
          <Link href="/app/imports/new" style={{ textDecoration: "underline" }}>
            import wizard
          </Link>.
        </EmptyState>
      )}

      {batches && batches.length > 0 && (
        <table className="report">
          <thead>
            <tr>
              <th>File</th>
              <th style={{ width: 90 }}>Kind</th>
              <th style={{ width: 110 }}>Status</th>
              <th className="num" style={{ width: 90 }}>Imported</th>
              <th className="num" style={{ width: 90 }}>Dupes</th>
              <th className="num" style={{ width: 90 }}>Skipped</th>
              <th style={{ width: 160 }}>When</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.id}>
                <td style={{ fontSize: 13 }}>
                  <b>{b.filename}</b>
                  {b.warnings && b.warnings.length > 0 && (
                    <div style={{ fontSize: 11, color: "#d48a3c", marginTop: 2 }}
                         title={b.warnings.join("\n")}>
                      ⚠ {b.warnings.length} warning{b.warnings.length === 1 ? "" : "s"}
                    </div>
                  )}
                </td>
                <td className="mono" style={{ fontSize: 11, textTransform: "uppercase" }}>
                  {b.file_kind}
                </td>
                <td>
                  <StatusPill status={b.status} />
                </td>
                <td className="num mono">{b.rows_imported}</td>
                <td className="num mono" style={{ color: b.rows_duplicate ? "#d48a3c" : "var(--ink-faint)" }}>
                  {b.rows_duplicate}
                </td>
                <td className="num mono" style={{ color: "var(--ink-muted)" }}>
                  {b.rows_skipped}
                </td>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                  {fmtRelative(b.created_at)}
                </td>
                <td className="num">
                  {b.status === "committed" && (
                    <Btn
                      small danger
                      onClick={() => undo(b)}
                      disabled={busyId === b.id}
                    >
                      {busyId === b.id ? "…" : "Undo"}
                    </Btn>
                  )}
                  {b.status === "undone" && (
                    <span style={{ fontSize: 11, color: "var(--ink-faint)", fontStyle: "italic" }}>
                      rolled back
                    </span>
                  )}
                  {b.status === "pending" && (
                    <span style={{ fontSize: 11, color: "#d48a3c", fontStyle: "italic" }}>
                      incomplete
                    </span>
                  )}
                  {b.status === "failed" && (
                    <Btn small danger onClick={() => undo(b)} disabled={busyId === b.id}>
                      Clean up
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Batch["status"] }) {
  const colors: Record<Batch["status"], string> = {
    pending:   "#d48a3c",
    committed: "var(--good, #7a9c5c)",
    failed:    "var(--bad, #c8554b)",
    undone:    "var(--ink-faint)",
  };
  return (
    <span className="pill" style={{ color: colors[status], fontSize: 11 }}>
      <span className="dot" />
      {status}
    </span>
  );
}

/** Short human delta: "3h ago", "2d ago", else full date. */
function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
