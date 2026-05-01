import Link from "next/link";
import { UpgradeButton } from "@/components/budget/UpgradeButton";

export const metadata = { title: "Pricing — Budget Ledger" };

const plans = [
  {
    name: "Free",
    price: null,
    tagline: "Everything to get started.",
    features: [
      "Unlimited transactions",
      "Offline-first sync",
      "Import CSV, PDF, XLSX",
      "Rules & goals",
      "Bring your own Anthropic key",
    ],
    cta: "Get started",
    ctaHref: "/sign-up",
    tier: null,
  },
  {
    name: "Pro",
    price: 8,
    tagline: "AI that earns its keep.",
    features: [
      "Everything in Free",
      "AI categorization",
      "AI receipt extraction",
      "Natural-language entry",
      "Dashboard narrative insights",
    ],
    cta: "Upgrade to Pro",
    ctaHref: null,
    tier: "pro",
    highlight: true,
  },
  {
    name: "Plus",
    price: 15,
    tagline: "Your bank, in the loop.",
    features: [
      "Everything in Pro",
      "Bank sync via Plaid",
      "Up to 4 connected accounts",
      "Auto-import transactions",
      "Instant balance updates",
    ],
    cta: "Coming soon",
    ctaHref: null,
    tier: null,
    disabled: true,
  },
];

export default function PricingPage() {
  return (
    <main style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "64px 24px 96px",
    }}>
      <Link href="/" style={{
        fontSize: 11, letterSpacing: "0.2em", color: "var(--ink-faint)",
        textTransform: "uppercase", fontFamily: '"JetBrains Mono", monospace',
        textDecoration: "none", marginBottom: 48,
      }}>
        ← The Budget Ledger
      </Link>

      <h1 style={{
        fontFamily: '"Fraunces", Georgia, serif',
        fontSize: "clamp(36px, 6vw, 60px)", fontWeight: 400,
        letterSpacing: "-0.02em", margin: "0 0 12px", textAlign: "center",
      }}>
        Simple, honest pricing
      </h1>
      <p style={{
        color: "var(--ink-muted)", fontSize: 16, maxWidth: 440,
        textAlign: "center", margin: "0 0 56px",
      }}>
        Pay for what you use. No seats, no data selling, no dark patterns.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 20, maxWidth: 880, width: "100%",
      }}>
        {plans.map((plan) => (
          <div key={plan.name} style={{
            background: plan.highlight ? "var(--ink)" : "var(--bg-card)",
            color: plan.highlight ? "var(--bg)" : "var(--ink)",
            border: `1px solid ${plan.highlight ? "var(--ink)" : "var(--rule)"}`,
            padding: "32px 28px 28px",
            display: "flex", flexDirection: "column",
            opacity: plan.disabled ? 0.6 : 1,
          }}>
            <div style={{
              fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
              fontFamily: '"JetBrains Mono", monospace',
              color: plan.highlight ? "var(--bg-sunken)" : "var(--ink-faint)",
              marginBottom: 12,
            }}>
              {plan.name}
            </div>

            <div style={{ marginBottom: 6 }}>
              {plan.price ? (
                <>
                  <span style={{
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontSize: 42, fontWeight: 400, lineHeight: 1,
                  }}>
                    ${plan.price}
                  </span>
                  <span style={{
                    fontSize: 13, fontFamily: '"JetBrains Mono", monospace',
                    color: plan.highlight ? "var(--bg-sunken)" : "var(--ink-muted)",
                    marginLeft: 4,
                  }}>
                    / mo
                  </span>
                </>
              ) : (
                <span style={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: 42, fontWeight: 400, lineHeight: 1,
                }}>
                  Free
                </span>
              )}
            </div>

            <p style={{
              fontSize: 13, margin: "0 0 24px",
              color: plan.highlight ? "var(--bg-sunken)" : "var(--ink-muted)",
            }}>
              {plan.tagline}
            </p>

            <ul style={{
              listStyle: "none", padding: 0, margin: "0 0 28px",
              display: "flex", flexDirection: "column", gap: 10, flex: 1,
            }}>
              {plan.features.map((f) => (
                <li key={f} style={{ fontSize: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{
                    color: plan.highlight ? "var(--bg-sunken)" : "var(--good)",
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 12, paddingTop: 1,
                  }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {plan.ctaHref ? (
              <Link href={plan.ctaHref} style={{
                display: "block", textAlign: "center",
                padding: "11px 20px",
                background: plan.highlight ? "var(--bg)" : "var(--ink)",
                color: plan.highlight ? "var(--ink)" : "var(--bg)",
                textDecoration: "none",
                fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase",
                fontFamily: '"JetBrains Mono", monospace',
              }}>
                {plan.cta}
              </Link>
            ) : (
              <UpgradeButton tier={plan.tier} label={plan.cta} disabled={plan.disabled} highlight={plan.highlight} />
            )}
          </div>
        ))}
      </div>

      <p style={{
        marginTop: 48, fontSize: 13, color: "var(--ink-faint)", textAlign: "center",
      }}>
        Annual plans save 25% · Cancel any time · Questions?{" "}
        <a href="mailto:kamranbiroun@gmail.com" style={{ color: "var(--ink-muted)" }}>
          Email us
        </a>
      </p>
    </main>
  );
}

