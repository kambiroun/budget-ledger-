"use client";

export function UpgradeButton({
  tier,
  label,
  disabled,
  highlight,
}: {
  tier: string | null;
  label: string;
  disabled?: boolean;
  highlight?: boolean;
}) {
  if (disabled || !tier) {
    return (
      <div style={{
        textAlign: "center", padding: "11px 20px",
        border: `1px solid ${highlight ? "rgba(255,255,255,0.2)" : "var(--rule)"}`,
        fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase",
        fontFamily: '"JetBrains Mono", monospace',
        color: highlight ? "rgba(255,255,255,0.4)" : "var(--ink-faint)",
        cursor: "default",
      }}>
        {label}
      </div>
    );
  }

  async function handleClick() {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier, interval: "month" }),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.data?.url) {
      window.location.href = json.data.url;
    } else if (res.status === 401) {
      window.location.href = `/sign-up?redirect=/pricing`;
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        width: "100%", cursor: "pointer", border: "none",
        textAlign: "center", padding: "11px 20px",
        background: highlight ? "var(--bg)" : "var(--ink)",
        color: highlight ? "var(--ink)" : "var(--bg)",
        fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase",
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      {label}
    </button>
  );
}
