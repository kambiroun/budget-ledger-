"use client";

import { useNetStatus, useDrainQueue } from "@/lib/hooks/useData";

/**
 * Floating status chip. Three states:
 *   ONLINE     — green dot, nothing to do
 *   SYNCING    — animated dot, drainQueue in flight
 *   OFFLINE    — amber dot, showing pending count
 * Clicking forces a drain.
 */
export function ConnectionBadge() {
  const { online, syncing, pending } = useNetStatus();
  const drain = useDrainQueue();

  let label: string, dotColor: string, animate = false;
  if (!online)        { label = pending > 0 ? `Offline · ${pending} pending` : "Offline"; dotColor = "#d97757"; }
  else if (syncing)   { label = "Syncing…";                 dotColor = "#4a7a6a"; animate = true; }
  else if (pending>0) { label = `${pending} pending`;       dotColor = "#d97757"; }
  else                { label = "Online";                   dotColor = "#4a7a6a"; }

  return (
    <button
      onClick={drain}
      title="Click to retry pending writes"
      style={{
        position: "fixed", top: 14, right: 14, zIndex: 50,
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px",
        background: "var(--bg-card)", border: "1px solid var(--rule)",
        fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5,
        letterSpacing: "0.14em", textTransform: "uppercase",
        color: "var(--ink-muted)", cursor: "pointer",
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: dotColor,
        animation: animate ? "pulse 1.2s ease-in-out infinite" : undefined,
      }} />
      <span>{label}</span>
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </button>
  );
}
