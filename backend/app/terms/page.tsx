import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Budget Ledger",
};

const EFFECTIVE_DATE = "May 1, 2026";
const CONTACT_EMAIL = "kamranbiroun@gmail.com";
const APP_NAME = "Budget Ledger";

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "60px 24px 80px" }}>
      <div style={{ marginBottom: 40 }}>
        <Link href="/" style={{ fontSize: 13, color: "var(--ink-muted)", textDecoration: "none" }}
          className="mono">
          ← Back
        </Link>
      </div>

      <h1 style={{
        fontFamily: '"Fraunces", Georgia, serif', fontSize: 42,
        fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 8
      }}>
        Terms of Service
      </h1>
      <p style={{ color: "var(--ink-muted)", marginBottom: 48, fontSize: 14 }} className="mono">
        Effective {EFFECTIVE_DATE}
      </p>

      <Section title="1. Acceptance">
        <p>
          By creating an account or using {APP_NAME}, you agree to these Terms of Service.
          If you do not agree, please do not use the service.
        </p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          {APP_NAME} is a personal budgeting application that helps you track income,
          expenses, and savings goals. The service is provided &ldquo;as-is&rdquo; and is
          intended for personal, non-commercial use.
        </p>
      </Section>

      <Section title="3. Account Responsibilities">
        <p>
          You are responsible for maintaining the confidentiality of your account
          credentials and for all activity that occurs under your account. You must
          provide accurate information when creating your account and keep it up to date.
        </p>
        <p>
          You may not use the service for any illegal purpose or in violation of any
          applicable laws or regulations.
        </p>
      </Section>

      <Section title="4. Subscriptions and Billing">
        <p>
          {APP_NAME} offers optional paid subscription tiers (Pro and Plus). Subscriptions
          are billed monthly or annually as selected. You may cancel at any time; your
          access to paid features will continue until the end of your current billing period.
          Refunds are handled at our discretion and in accordance with applicable law.
        </p>
        <p>
          All payments are processed by Stripe. By subscribing, you also agree to
          Stripe&rsquo;s terms of service.
        </p>
      </Section>

      <Section title="5. Your Content">
        <p>
          You retain ownership of all financial data you enter into {APP_NAME}. You grant
          us a limited license to store and process this data solely to provide the service.
          We do not claim ownership of your data.
        </p>
      </Section>

      <Section title="6. AI Features">
        <p>
          AI-powered features (receipt scanning, transaction categorization) are provided
          for convenience and may not be accurate. You are responsible for reviewing and
          verifying any AI-generated suggestions before relying on them.
        </p>
      </Section>

      <Section title="7. Disclaimer of Warranties">
        <p>
          {APP_NAME} is provided &ldquo;as is&rdquo; without warranty of any kind, express or implied.
          We do not warrant that the service will be uninterrupted, error-free, or that
          data will not be lost. Use the service at your own risk.
        </p>
        <p>
          {APP_NAME} is not a financial advisor. Nothing in the app constitutes financial,
          tax, or investment advice. Consult a qualified professional for such advice.
        </p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, we shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages arising from your use of
          {APP_NAME}, including loss of data or financial decisions made based on information
          in the app.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          You may delete your account at any time from Settings. We reserve the right to
          suspend or terminate accounts that violate these Terms.
        </p>
      </Section>

      <Section title="10. Changes to Terms">
        <p>
          We may update these Terms from time to time. Continued use of the service after
          changes take effect constitutes acceptance of the updated Terms. We will notify
          you of material changes by email where possible.
        </p>
      </Section>

      <Section title="11. Governing Law">
        <p>
          These Terms are governed by the laws of the jurisdiction in which the service
          operator resides, without regard to conflict of law principles.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions about these Terms? Contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--ink)" }}>
            {CONTACT_EMAIL}
          </a>.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{
        fontFamily: '"Fraunces", Georgia, serif', fontSize: 22,
        fontWeight: 400, marginBottom: 12
      }}>
        {title}
      </h2>
      <div style={{
        fontFamily: '"Source Serif 4", Georgia, serif',
        fontSize: 16, lineHeight: 1.7, color: "var(--ink-muted)"
      }}>
        {children}
      </div>
    </section>
  );
}
