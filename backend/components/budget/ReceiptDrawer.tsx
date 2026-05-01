"use client";
import React from "react";
import { fmtMoney, fmtDate } from "@/lib/budget";
import { merchantHistory } from "@/lib/budget/merchant";
import { aiExtractImage } from "@/lib/ai/client";
import type { LegacyTxn } from "@/lib/budget/adapter";

export function ReceiptDrawer({
  txn, transactions, categories,
  onClose, onCategoryChange, onDelete,
}: {
  txn: LegacyTxn | null;
  transactions: LegacyTxn[];
  categories: any[];
  onClose: () => void;
  onCategoryChange: (catId: string | null) => void;
  onDelete: () => void;
}) {
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [scanState, setScanState] = React.useState<"idle" | "scanning" | "done" | "error">("idle");
  const [scanNote, setScanNote] = React.useState<string | null>(null);

  // Reset scan state when a different transaction is opened
  React.useEffect(() => {
    setScanState("idle");
    setScanNote(null);
  }, [txn?.id]);

  const handleReceiptScan = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    const mediaType = (file.type === "image/png" || file.type === "image/gif" || file.type === "image/webp")
      ? file.type as "image/png" | "image/gif" | "image/webp"
      : "image/jpeg";

    setScanState("scanning");
    setScanNote(null);
    try {
      const b64 = await fileToBase64(file);
      const result = await aiExtractImage(b64, mediaType);
      const rowCount = result.rows.length;
      if (rowCount > 0) {
        setScanNote(`Scanned ${rowCount} line${rowCount !== 1 ? "s" : ""} from receipt.${result.warnings.length ? " " + result.warnings[0] : ""}`);
      } else {
        setScanNote(result.warnings[0] ?? "No transaction rows found in the image.");
      }
      setScanState("done");
    } catch (err: any) {
      setScanNote(err?.message === "upgrade_required" ? "AI scanning requires a Pro account." : "Scan failed — try a clearer photo.");
      setScanState("error");
    }
  }, []);

  const history = React.useMemo(
    () => txn ? merchantHistory(transactions, txn.description) : null,
    [txn, transactions]
  );
  const catList = categories.filter((c: any) => !c.is_income);
  const colorFor = (name: string) =>
    categories.find((c: any) => c.name === name)?.color ?? "var(--ink-muted)";

  const recentSix = React.useMemo(() => {
    if (!history) return [];
    return history.transactions
      .slice()
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 6);
  }, [history]);

  const spark = React.useMemo(() => {
    if (!history || history.monthly.length < 2) return null;
    const vals = history.monthly.slice(-12).map((m) => m.total);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const range = max - min || 1;
    const pts = vals.map((v, i) => ({ x: i, h: (v - min) / range }));
    return { points: pts, months: history.monthly.slice(-12) };
  }, [history]);

  if (!txn) return null;

  const prevAvg =
    history && history.count > 1
      ? (history.total - history.lastAmount) / (history.count - 1)
      : null;
  const vsAvg = prevAvg != null ? ((txn.amount - prevAvg) / prevAvg) * 100 : null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div className="drawer-meta mono">Receipt · {fmtDate(txn.date)}</div>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>
        <h2 className="drawer-title">{txn.description}</h2>
        <div className="drawer-amount">
          <span className="drawer-amount-val num">{fmtMoney(txn.amount)}</span>
          {txn.category && (
            <span className="pill drawer-cat" style={{ color: colorFor(txn.category) }}>
              <span className="dot" />
              {txn.category}
            </span>
          )}
          {txn.isIncome && <span className="pill" style={{ color: "var(--good)" }}>income</span>}
          {txn.isDupe && <span className="pill" style={{ color: "var(--warn)" }}>duplicate</span>}
        </div>

        {vsAvg != null && Math.abs(vsAvg) > 5 && (
          <div className="drawer-delta">
            <span className={"mono " + (vsAvg > 0 ? "bad" : "good")}>
              {vsAvg > 0 ? "+" : "−"}{Math.abs(Math.round(vsAvg))}% vs usual
            </span>
            <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>
              — typical: {fmtMoney(prevAvg!)}
            </span>
          </div>
        )}

        {history && history.count > 1 && (
          <section className="drawer-section">
            <h4>Merchant history</h4>
            <div className="drawer-stats">
              <div>
                <span className="drawer-stat-label">lifetime</span>
                <span className="drawer-stat-val">{fmtMoney(history.total)}</span>
              </div>
              <div>
                <span className="drawer-stat-label">visits</span>
                <span className="drawer-stat-val">{history.count}</span>
              </div>
              <div>
                <span className="drawer-stat-label">average</span>
                <span className="drawer-stat-val">{fmtMoney(history.avg)}</span>
              </div>
              <div>
                <span className="drawer-stat-label">first seen</span>
                <span className="drawer-stat-val mono" style={{ fontSize: 11 }}>
                  {fmtDate(history.first)}
                </span>
              </div>
            </div>

            {spark && (
              <div className="drawer-spark">
                <svg
                  viewBox={`0 0 ${spark.points.length * 20} 60`}
                  width="100%" height="60"
                  preserveAspectRatio="none"
                >
                  <polyline
                    points={spark.points.map((p) => `${p.x * 20 + 10},${56 - p.h * 48}`).join(" ")}
                    fill="none" stroke="var(--accent)" strokeWidth="1.5"
                  />
                  {spark.points.map((p, i) => (
                    <circle
                      key={i} cx={p.x * 20 + 10} cy={56 - p.h * 48}
                      r="2.5" fill="var(--accent)"
                    />
                  ))}
                </svg>
                <div className="drawer-spark-labels mono">
                  {spark.months.map((m, i) => (
                    <span key={i} style={{ flex: 1, textAlign: "center" }}>
                      {m.month.slice(5)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {recentSix.length > 1 && (
          <section className="drawer-section">
            <h4>Recent charges</h4>
            <div className="drawer-list">
              {recentSix.map((t, i) => (
                <div
                  key={i}
                  className={"drawer-list-row" + (t === txn ? " current" : "")}
                >
                  <span className="mono drawer-list-date">{fmtDate(t.date)}</span>
                  <span className="drawer-list-desc">{t.description}</span>
                  <span className="num drawer-list-amt">{fmtMoney(t.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="drawer-section">
          <h4>Recategorize</h4>
          <div className="drawer-cats">
            {catList.map((c: any) => (
              <button
                key={c.id}
                onClick={() => onCategoryChange(c.id)}
                className={"drawer-cat-btn" + (txn.category === c.name ? " active" : "")}
                style={{ ["--cat-color" as any]: c.color || "var(--ink)" }}
              >
                <span className="dot" />
                {c.name}
              </button>
            ))}
            {txn.category && (
              <button
                onClick={() => onCategoryChange(null)}
                className="drawer-cat-btn"
                style={{ ["--cat-color" as any]: "var(--ink-faint)" }}
              >
                clear
              </button>
            )}
          </div>
        </section>

        <section className="drawer-section">
          <h4>Receipt photo</h4>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleReceiptScan}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="btn"
              disabled={scanState === "scanning"}
              onClick={() => cameraInputRef.current?.click()}
              style={{ minHeight: 44 }}
            >
              {scanState === "scanning" ? "Scanning…" : "📷 Scan receipt"}
            </button>
            <button
              className="btn ghost"
              disabled={scanState === "scanning"}
              onClick={() => {
                if (cameraInputRef.current) {
                  cameraInputRef.current.removeAttribute("capture");
                  cameraInputRef.current.click();
                  setTimeout(() => cameraInputRef.current?.setAttribute("capture", "environment"), 500);
                }
              }}
              style={{ minHeight: 44 }}
            >
              Upload photo
            </button>
          </div>
          {scanNote && (
            <p style={{
              marginTop: 10, fontSize: 13,
              color: scanState === "error" ? "var(--bad)" : "var(--good)",
            }}>
              {scanNote}
            </p>
          )}
        </section>

        <div className="drawer-actions">
          <button
            className="btn danger"
            onClick={() => {
              if (confirm("Delete this transaction?")) onDelete();
            }}
          >Delete transaction</button>
        </div>
      </div>
    </>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:image/...;base64, prefix
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
