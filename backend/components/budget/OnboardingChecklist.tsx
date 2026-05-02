"use client";
/**
 * First-run onboarding checklist — shown for PostHog feature flag
 * `onboarding_variant = "B"`.
 *
 * Three guided steps are checked off automatically as the user completes them.
 * The checklist dismisses when all steps are done or when the user clicks ×.
 * Dismissed state persists in localStorage.
 */
import React from "react";
import { track } from "@/lib/analytics";

const DISMISS_KEY = "onboarding_checklist_dismissed";

interface Step {
  id: string;
  label: string;
  hint: string;
  done: boolean;
}

interface Props {
  hasTxns: boolean;
  hasBudgets: boolean;
  hasCategorized: boolean;
}

export function OnboardingChecklist({ hasTxns, hasBudgets, hasCategorized }: Props) {
  const [dismissed, setDismissed] = React.useState(true); // start hidden, hydrate from LS

  React.useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const steps: Step[] = [
    {
      id: "first_txn",
      label: "Add your first transaction",
      hint: "Use ⌘K or the + button, or import a CSV.",
      done: hasTxns,
    },
    {
      id: "set_budget",
      label: "Set a monthly budget",
      hint: "Go to Setup → Spending categories and enter a dollar amount.",
      done: hasBudgets,
    },
    {
      id: "categorize",
      label: "Categorize a transaction",
      hint: "Open the Ledger tab and assign a category to any row.",
      done: hasCategorized,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  // Track step completions
  const prevDone = React.useRef<Record<string, boolean>>({});
  React.useEffect(() => {
    for (const step of steps) {
      if (step.done && !prevDone.current[step.id]) {
        track("onboarding_step_completed", { step: step.id });
      }
    }
    prevDone.current = Object.fromEntries(steps.map((s) => [s.id, s.done]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTxns, hasBudgets, hasCategorized]);

  // Auto-dismiss once everything is done
  React.useEffect(() => {
    if (allDone) {
      const timer = setTimeout(() => dismiss(), 2500);
      return () => clearTimeout(timer);
    }
  }, [allDone]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
    track("onboarding_checklist_dismissed", { completed: completedCount });
  }

  if (dismissed) return null;

  return (
    <div style={{
      position: "fixed", bottom: 80, right: 16, zIndex: 200,
      width: 280, background: "var(--bg-card, #fff)",
      border: "1px solid var(--rule)", boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px 10px",
        borderBottom: "1px solid var(--rule-soft)",
      }}>
        <div>
          <span style={{
            fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-faint)",
          }}>
            Getting started
          </span>
          <span style={{
            marginLeft: 8, fontSize: 11, color: "var(--ink-muted)",
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {completedCount}/{steps.length}
          </span>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss checklist"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-faint)", fontSize: 18, lineHeight: 1, padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "var(--rule-soft)" }}>
        <div style={{
          height: 3, background: "var(--good, #5a8a5a)",
          width: `${(completedCount / steps.length) * 100}%`,
          transition: "width 0.4s ease",
        }} />
      </div>

      {/* Steps */}
      <div style={{ padding: "8px 0" }}>
        {steps.map((step) => (
          <div key={step.id} style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "8px 14px",
            opacity: step.done ? 0.5 : 1,
          }}>
            <span style={{
              flexShrink: 0, width: 18, height: 18, borderRadius: "50%",
              border: `1.5px solid ${step.done ? "var(--good, #5a8a5a)" : "var(--rule)"}`,
              background: step.done ? "var(--good, #5a8a5a)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginTop: 1,
            }}>
              {step.done && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <div>
              <div style={{
                fontSize: 13, color: "var(--ink)",
                textDecoration: step.done ? "line-through" : "none",
              }}>
                {step.label}
              </div>
              {!step.done && (
                <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>
                  {step.hint}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {allDone && (
        <div style={{
          padding: "10px 14px 14px", textAlign: "center",
          fontSize: 12, color: "var(--good, #5a8a5a)",
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          All done — your ledger is ready.
        </div>
      )}
    </div>
  );
}
