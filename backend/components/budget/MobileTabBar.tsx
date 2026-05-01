"use client";
import React from "react";

type TabKey = "dashboard" | "ledger" | "weekly" | "compare" | "rules" | "goals" | "setup";

const MOBILE_TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dash",   icon: "◈" },
  { key: "ledger",    label: "Ledger", icon: "≡" },
  { key: "goals",     label: "Goals",  icon: "◎" },
  { key: "setup",     label: "Setup",  icon: "⚙" },
];

export function MobileTabBar({
  active,
  onChange,
  onAdd,
}: {
  active: string;
  onChange: (key: TabKey) => void;
  onAdd: () => void;
}) {
  return (
    <nav className="mobile-tab-bar" role="navigation" aria-label="Main navigation">
      {MOBILE_TABS.slice(0, 2).map((t) => (
        <button
          key={t.key}
          className={"mobile-tab" + (active === t.key ? " active" : "")}
          onClick={() => onChange(t.key)}
          aria-label={t.label}
          aria-current={active === t.key ? "page" : undefined}
        >
          <span className="mobile-tab-icon">{t.icon}</span>
          <span className="mobile-tab-label">{t.label}</span>
        </button>
      ))}

      <button
        className="mobile-tab mobile-tab-add"
        onClick={onAdd}
        aria-label="Add transaction"
      >
        <span className="mobile-tab-icon mobile-tab-add-icon">+</span>
        <span className="mobile-tab-label">Add</span>
      </button>

      {MOBILE_TABS.slice(2).map((t) => (
        <button
          key={t.key}
          className={"mobile-tab" + (active === t.key ? " active" : "")}
          onClick={() => onChange(t.key)}
          aria-label={t.label}
          aria-current={active === t.key ? "page" : undefined}
        >
          <span className="mobile-tab-icon">{t.icon}</span>
          <span className="mobile-tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
