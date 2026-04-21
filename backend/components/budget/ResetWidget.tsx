"use client";
import React from "react";
import {
  wipeUserData, emergencyLocalReset, subscribe, type NetState,
} from "@/lib/db/client";

/**
 * ResetWidget — a tiny always-visible escape hatch.
 *
 * Floats bottom-right. Shows live pending count + an expand panel with:
 *   - "Flush local cache" — nukes IndexedDB + pending queue (doesn't touch server).
 *     Safe to hit when the network tab is flooded with failing requests — it
 *     drops the ops immediately.
 *   - "Wipe everything (server + local)" — calls /api/wipe scope=all.
 *
 * Lives outside SetupPage so it's reachable even if that page errors.
 */

export function ResetWidget() {
  const [net, setNet] = React.useState<NetState>({ online: true, syncing: false, pending: 0 });
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<null | string>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => subscribe(setNet), []);

  const flushLocal = async () => {
    if (!confirm("Clear local cache and drop all queued writes?\n\nThe server keeps its data — reloading the page will pull everything back down. This just stops the retry storm.")) return;
    setBusy("flush");
    try {
      await emergencyLocalReset();
      setMsg("Local cache cleared. Reload to re-fetch from server.");
    } catch (e: any) {
      setMsg("Flush failed: " + (e?.message || "unknown"));
    } finally { setBusy(null); }
  };

  const wipeAll = async () => {
    if (!confirm("Wipe ALL your data on the server AND locally?\n\nThis cannot be undone.")) return;
    setBusy("wipe");
    try {
      const { deleted } = await wipeUserData("all");
      const total = Object.values(deleted).reduce((a: any, b: any) => a + (b || 0), 0);
      setMsg(`Wiped ${total} rows on server + cleared local cache.`);
    } catch (e: any) {
      setMsg("Wipe failed: " + (e?.message || "unknown"));
    } finally { setBusy(null); }
  };

  const hasPending = net.pending > 0;
  const hasDead = (net.deadLetters?.length ?? 0) > 0;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 9999,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
      }}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          title="Sync & reset"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px",
            background: hasPending || hasDead ? "var(--danger, #b44b44)" : "var(--ink, #222)",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            fontSize: 11,
          }}
        >
          <span
            style={{
              width: 8, height: 8, borderRadius: 999,
              background: !net.online ? "#999" : net.syncing ? "#f1c40f" : hasPending ? "#f85" : "#6b6",
            }}
          />
          {net.syncing ? "syncing…" : `${net.pending} pending`}
          {hasDead && ` · ${net.deadLetters!.length} failed`}
        </button>
      ) : (
        <div
          style={{
            width: 280,
            background: "var(--surface, #fff)",
            color: "var(--ink, #222)",
            border: "1px solid var(--rule, #ccc)",
            borderRadius: 10,
            padding: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 12 }}>Sync & reset</strong>
            <button
              onClick={() => { setOpen(false); setMsg(null); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14 }}
              aria-label="close"
            >×</button>
          </div>

          <div style={{ marginTop: 8, lineHeight: 1.5, color: "var(--ink-muted, #666)" }}>
            <div>status: {net.online ? "online" : "offline"}{net.syncing && " · syncing"}</div>
            <div>queued: {net.pending}</div>
            {hasDead && (
              <div style={{ color: "var(--danger, #b44b44)" }}>
                failed: {net.deadLetters!.length}
              </div>
            )}
          </div>

          {hasDead && (
            <details style={{ marginTop: 8, fontSize: 10 }}>
              <summary style={{ cursor: "pointer", color: "var(--danger, #b44b44)" }}>
                view failed writes
              </summary>
              <div style={{ maxHeight: 120, overflow: "auto", marginTop: 6, paddingLeft: 4 }}>
                {net.deadLetters!.slice(-10).map((d, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <b>{d.op} {d.table}</b>
                    <div style={{ opacity: 0.7 }}>{d.error}</div>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            <button
              onClick={flushLocal}
              disabled={!!busy}
              style={btnStyle("var(--ink, #222)")}
            >
              {busy === "flush" ? "flushing…" : "Flush local cache"}
            </button>
            <button
              onClick={wipeAll}
              disabled={!!busy}
              style={btnStyle("var(--danger, #b44b44)")}
            >
              {busy === "wipe" ? "wiping…" : "Wipe everything"}
            </button>
            <button
              onClick={() => location.reload()}
              disabled={!!busy}
              style={btnStyle("transparent", "var(--ink, #222)")}
            >
              Reload page
            </button>
          </div>

          {msg && (
            <div style={{ marginTop: 10, fontSize: 10, lineHeight: 1.5 }}>{msg}</div>
          )}

          <div style={{ marginTop: 10, fontSize: 10, color: "var(--ink-muted, #888)" }}>
            Flush stops retry storms. Wipe deletes on the server too.
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(bg: string, color = "#fff"): React.CSSProperties {
  return {
    padding: "7px 10px",
    background: bg,
    color,
    border: bg === "transparent" ? "1px solid var(--rule, #ccc)" : "none",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 11,
    textAlign: "left",
  };
}
