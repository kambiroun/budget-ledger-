"use client";
import React from "react";

export function Btn({
  children, onClick, primary, small, ghost, danger, disabled, style, type, title, ...rest
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  primary?: boolean;
  small?: boolean;
  ghost?: boolean;
  danger?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
  title?: string;
  [k: string]: any;
}) {
  const cls = ["btn"];
  if (primary) cls.push("primary");
  if (small) cls.push("small");
  if (ghost) cls.push("ghost");
  if (danger) cls.push("danger");
  return (
    <button
      type={type || "button"}
      className={cls.join(" ")}
      onClick={onClick}
      disabled={disabled}
      style={style}
      title={title}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Pill({
  color, children, style,
}: { color?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className="pill" style={{ color: color || "var(--ink-muted)", ...style }}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function Masthead({ txCount }: { txCount: number }) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  return (
    <div className="masthead">
      <h1><i>The</i> <b>Budget Ledger</b></h1>
      <div className="edition">
        <span>Vol. II</span>
        <span>· {dateStr} ·</span>
        <span>{txCount} entries</span>
      </div>
    </div>
  );
}

export type TabDef = { key: string; label: string; count?: number | null };

export function Tabs({
  tabs, active, onChange,
}: { tabs: TabDef[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={"tab" + (active === t.key ? " active" : "")}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SectionHead({
  title, meta, children,
}: { title: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <div className="meta" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {meta}
        {children}
      </div>
    </div>
  );
}

export function MonthPicker({
  months, value, onChange, monthLabelShort,
}: {
  months: string[];
  value: string;
  onChange: (v: string) => void;
  monthLabelShort: (mk: string) => string;
}) {
  return (
    <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">ALL MONTHS</option>
      {months.map((m) => (
        <option key={m} value={m}>
          {monthLabelShort(m).toUpperCase()}
        </option>
      ))}
    </select>
  );
}

export function Modal({
  onClose, children,
}: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <p>{children}</p>
    </div>
  );
}

export function Flash({
  kind, children,
}: { kind?: "info" | "success"; children: React.ReactNode }) {
  return <div className={"flash" + (kind === "info" ? " info" : "")}>{children}</div>;
}
