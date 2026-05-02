"use client";
import React from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkOnSuccess, PlaidLinkOnExit } from "react-plaid-link";
import { Btn } from "./Primitives";
import type { PlaidItemT } from "@/lib/schemas";

const ITEM_LIMIT = 4;

export function BanksPanel() {
  // ── Billing tier ─────────────────────────────────────────────────────────────
  const [tier, setTier] = React.useState<string | null>(null);
  const [tierLoading, setTierLoading] = React.useState(true);

  // ── Linked items ─────────────────────────────────────────────────────────────
  const [items, setItems] = React.useState<PlaidItemT[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  // ── New-connection link token ────────────────────────────────────────────────
  const [linkToken, setLinkToken] = React.useState<string | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  // ── Re-link (update mode for broken items) ───────────────────────────────────
  const [relinkToken, setRelinkToken] = React.useState<string | null>(null);
  const [relinkItemId, setRelinkItemId] = React.useState<string | null>(null);
  const [relinkBusy, setRelinkBusy] = React.useState(false);

  const loadItems = React.useCallback(async () => {
    const res = await fetch("/api/plaid/accounts");
    const json = await res.json();
    if (json.ok) setItems(json.data.items);
    setLoading(false);
  }, []);

  const fetchLinkToken = React.useCallback(async () => {
    setLinkError(null);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setLinkToken(json.data.link_token);
      } else if (json.error === "subscription_required") {
        setLinkToken(null); // tier gate handles the UI
      } else {
        setLinkError(json.error ?? "Could not initialize bank connection");
      }
    } catch {
      setLinkError("Could not initialize bank connection");
    }
  }, []);

  React.useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setTier(j.data.subscription_status); })
      .catch(() => setTier("free"))
      .finally(() => setTierLoading(false));
    loadItems();
  }, [loadItems]);

  React.useEffect(() => {
    if (tier === "plus") fetchLinkToken();
  }, [tier, fetchLinkToken]);

  // ── onExit shared by both Link instances ─────────────────────────────────────
  const onExit = React.useCallback<PlaidLinkOnExit>((err) => {
    if (err) {
      setStatus(err.display_message ?? err.error_message ?? "Cancelled");
      setTimeout(() => setStatus(null), 3000);
    }
    setRelinkToken(null);
    setRelinkItemId(null);
  }, []);

  // ── New-connection success ───────────────────────────────────────────────────
  const onNewSuccess = React.useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setStatus("Connecting bank…");
      try {
        const res = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution_id: metadata.institution?.institution_id,
            institution_name: metadata.institution?.name,
            accounts: metadata.accounts.map((a) => ({
              id: a.id, name: a.name, mask: a.mask, type: a.type, subtype: a.subtype,
            })),
          }),
        });
        const json = await res.json();
        if (json.ok) {
          setStatus(`Connected — imported ${json.data.transactions_imported} transactions`);
          await loadItems();
          await fetchLinkToken();
        } else {
          setStatus(`Connection failed: ${json.error ?? "unknown error"}`);
        }
      } catch {
        setStatus("Connection failed");
      }
      setTimeout(() => setStatus(null), 6000);
    },
    [loadItems, fetchLinkToken]
  );

  // ── Re-link success ──────────────────────────────────────────────────────────
  const onRelinkSuccess = React.useCallback<PlaidLinkOnSuccess>(
    async () => {
      if (!relinkItemId) return;
      setStatus("Reconnecting…");
      try {
        const res = await fetch("/api/plaid/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ item_id: relinkItemId }),
        });
        const json = await res.json();
        setStatus(json.ok ? "Reconnected successfully" : "Sync error after reconnect");
        await loadItems();
      } catch {
        setStatus("Sync error after reconnect");
      }
      setRelinkToken(null);
      setRelinkItemId(null);
      setTimeout(() => setStatus(null), 4000);
    },
    [relinkItemId, loadItems]
  );

  const { open: openNew, ready: newReady } = usePlaidLink({
    token: linkToken,
    onSuccess: onNewSuccess,
    onExit,
  });

  const { open: openRelink, ready: relinkReady } = usePlaidLink({
    token: relinkToken,
    onSuccess: onRelinkSuccess,
    onExit,
  });

  // Auto-open re-link as soon as its token is ready
  React.useEffect(() => {
    if (relinkToken && relinkReady) openRelink();
  }, [relinkToken, relinkReady, openRelink]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const syncAll = async () => {
    setSyncing(true);
    setStatus("Syncing transactions…");
    try {
      const res = await fetch("/api/plaid/sync", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setStatus(`Sync complete — ${json.data.transactions_added} new transactions`);
        await loadItems();
      } else {
        setStatus("Sync failed");
      }
    } catch {
      setStatus("Sync failed");
    }
    setSyncing(false);
    setTimeout(() => setStatus(null), 5000);
  };

  const removeItem = async (itemId: string, institutionName: string | null) => {
    const label = institutionName ?? "this bank";
    if (!confirm(`Disconnect ${label}? Transactions already imported will stay in your ledger.`)) return;
    const res = await fetch(`/api/plaid/items/${itemId}`, { method: "DELETE" });
    if (res.ok) await loadItems();
  };

  const startRelink = async (itemId: string) => {
    setRelinkBusy(true);
    setStatus("Preparing reconnection…");
    try {
      const res = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      const json = await res.json();
      if (json.ok) {
        setRelinkItemId(itemId);
        setRelinkToken(json.data.link_token);
      } else {
        setStatus(`Could not prepare reconnection: ${json.error ?? "unknown error"}`);
        setTimeout(() => setStatus(null), 4000);
      }
    } catch {
      setStatus("Could not prepare reconnection");
      setTimeout(() => setStatus(null), 3000);
    }
    setRelinkBusy(false);
  };

  const fmtSyncDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  };

  // ── Tier gate ────────────────────────────────────────────────────────────────
  if (tierLoading || loading) {
    return <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>Loading…</p>;
  }

  if (tier !== "plus") {
    return (
      <div style={{
        padding: 20, border: "1px solid var(--rule-soft)", borderRadius: 6,
        background: "var(--panel-soft, rgba(0,0,0,0.02))",
      }}>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ink-muted)" }}>
          Automatic bank sync is a <strong>Plus</strong> feature ($15/mo).
          Connect up to 4 accounts and let transactions import automatically.
        </p>
        <a href="/pricing" className="btn primary" style={{ textDecoration: "none" }}>
          Upgrade to Plus →
        </a>
      </div>
    );
  }

  // ── Plus UI ──────────────────────────────────────────────────────────────────
  const atLimit = items.length >= ITEM_LIMIT;

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn
            primary
            onClick={() => linkToken && newReady && openNew()}
            disabled={!linkToken || !newReady || atLimit}
            title={atLimit ? `${ITEM_LIMIT}-account limit reached` : undefined}
          >
            {linkToken && newReady ? "Connect a bank" : "Loading…"}
          </Btn>
          {items.length > 0 && (
            <Btn ghost onClick={syncAll} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </Btn>
          )}
        </div>
        {status && (
          <span style={{
            fontSize: 13, color: "var(--ink-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {status}
          </span>
        )}
      </div>

      {linkError && (
        <div className="flash" style={{ marginBottom: 12 }}>
          {linkError} — check PLAID_CLIENT_ID and PLAID_SECRET in your environment.
        </div>
      )}

      {atLimit && (
        <p style={{ fontSize: 13, color: "var(--ink-muted)", marginBottom: 12 }}>
          {ITEM_LIMIT} of {ITEM_LIMIT} accounts connected (Plus plan limit).
        </p>
      )}

      {items.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
          No banks connected yet. Click &ldquo;Connect a bank&rdquo; to link your first account.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => {
            const hasError = !!item.error_code;
            return (
              <div key={item.id} style={{
                border: `1px solid ${hasError ? "var(--bad, #c8554b)" : "var(--rule-soft)"}`,
                borderRadius: 6, overflow: "hidden",
              }}>
                {/* Institution header */}
                <div style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: hasError
                    ? "rgba(200,85,75,0.05)"
                    : "var(--panel-soft, rgba(0,0,0,0.02))",
                  borderBottom: (item.accounts?.length ?? 0) > 0
                    ? "1px solid var(--rule-soft)"
                    : "none",
                }}>
                  <div>
                    <span style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 16 }}>
                      {item.institution_name ?? "Unknown Bank"}
                    </span>
                    <span style={{
                      display: "block", marginTop: 2,
                      fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.05em", textTransform: "uppercase",
                      color: hasError ? "var(--bad, #c8554b)" : "var(--ink-faint)",
                    }}>
                      {hasError
                        ? "Login required — click Fix to reconnect"
                        : `Last synced: ${fmtSyncDate(item.last_synced_at)}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {hasError && (
                      <button
                        onClick={() => startRelink(item.id)}
                        disabled={relinkBusy}
                        style={{
                          background: "none",
                          border: "1px solid var(--bad, #c8554b)",
                          cursor: relinkBusy ? "not-allowed" : "pointer",
                          color: "var(--bad, #c8554b)",
                          fontSize: 11, padding: "4px 10px",
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: "0.05em", textTransform: "uppercase",
                        }}
                      >
                        Fix
                      </button>
                    )}
                    <button
                      onClick={() => removeItem(item.id, item.institution_name)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--ink-faint)", fontSize: 12, padding: "4px 8px",
                        fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em",
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                {/* Account rows */}
                {(item.accounts ?? []).map((account, idx) => (
                  <div key={account.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 16px",
                    borderBottom: idx < (item.accounts?.length ?? 1) - 1
                      ? "1px solid var(--rule-soft)"
                      : "none",
                  }}>
                    <span style={{ flex: 1, fontSize: 14 }}>{account.name}</span>
                    {account.mask && (
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12, color: "var(--ink-muted)",
                      }}>
                        ···{account.mask}
                      </span>
                    )}
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11, color: "var(--ink-faint)",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>
                      {account.subtype ?? account.type ?? "account"}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
