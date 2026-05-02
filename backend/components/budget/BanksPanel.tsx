"use client";
import React from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkOnSuccess, PlaidLinkOnExit } from "react-plaid-link";
import { Btn } from "./Primitives";
import type { PlaidItemT } from "@/lib/schemas";

export function BanksPanel() {
  const [items, setItems] = React.useState<PlaidItemT[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [linkToken, setLinkToken] = React.useState<string | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);

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
      } else {
        setLinkError(json.error ?? "Could not initialize bank connection");
      }
    } catch {
      setLinkError("Could not initialize bank connection");
    }
  }, []);

  React.useEffect(() => {
    loadItems();
    fetchLinkToken();
  }, [loadItems, fetchLinkToken]);

  const onSuccess = React.useCallback<PlaidLinkOnSuccess>(
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
              id: a.id,
              name: a.name,
              mask: a.mask,
              type: a.type,
              subtype: a.subtype,
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

  const onExit = React.useCallback<PlaidLinkOnExit>((err) => {
    if (err) {
      setStatus(err.display_message ?? err.error_message ?? "Cancelled");
      setTimeout(() => setStatus(null), 3000);
    }
  }, []);

  const { open: openPlaidLink, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
    onExit,
  });

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

  const fmtSyncDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

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
            onClick={() => linkToken && ready && openPlaidLink()}
            disabled={!linkToken || !ready}
          >
            {linkToken && ready ? "Connect a bank" : "Loading…"}
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

      {/* Config error */}
      {linkError && (
        <div className="flash" style={{ marginBottom: 12 }}>
          {linkError} — add PLAID_CLIENT_ID and PLAID_SECRET to your environment.
        </div>
      )}

      {/* Item list */}
      {loading ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
          No banks connected yet. Click &ldquo;Connect a bank&rdquo; to link your first account
          and import transactions automatically.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              border: "1px solid var(--rule-soft)",
              borderRadius: 6, overflow: "hidden",
            }}>
              {/* Institution header */}
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "var(--panel-soft, rgba(0,0,0,0.02))",
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
                    color: item.error_code ? "var(--bad)" : "var(--ink-faint)",
                  }}>
                    {item.error_code
                      ? `Error: ${item.error_code}`
                      : `Last synced: ${fmtSyncDate(item.last_synced_at)}`}
                  </span>
                </div>
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
          ))}
        </div>
      )}
    </div>
  );
}
