import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Budget Ledger",
};

const EFFECTIVE_DATE = "May 1, 2026";
const CONTACT_EMAIL = "kamranbiroun@gmail.com";
const APP_NAME = "Budget Ledger";

export default function PrivacyPage() {
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
        Privacy Policy
      </h1>
      <p style={{ color: "var(--ink-muted)", marginBottom: 48, fontSize: 14 }} className="mono">
        Effective {EFFECTIVE_DATE}
      </p>

      <Section title="1. Overview">
        <p>
          {APP_NAME} (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is a personal budgeting
          application. We collect only the information necessary to provide the service.
          We do not sell your data, display ads, or share your financial information with
          third parties for marketing purposes.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <p><strong>Account data:</strong> email address and optional display name, collected
        when you create an account.</p>
        <p><strong>Financial data:</strong> transactions, categories, budgets, and goals that
        you enter or import. This data is stored in your account and is not shared.</p>
        <p><strong>Usage data:</strong> we may collect anonymized, aggregated usage statistics
        (e.g. feature usage counts) to improve the product. This does not include the
        content of your transactions.</p>
        <p><strong>Device token:</strong> if you enable push notifications, your device&rsquo;s
        APNs or FCM token is stored to deliver notifications. You can disable notifications
        at any time in your device settings.</p>
      </Section>

      <Section title="3. How We Use Your Information">
        <p>We use your information to:</p>
        <ul>
          <li>Provide and improve the {APP_NAME} service</li>
          <li>Authenticate your identity and secure your account</li>
          <li>Sync your data across your devices</li>
          <li>Send you notifications you have requested</li>
          <li>Respond to support requests</li>
        </ul>
      </Section>

      <Section title="4. AI Features">
        <p>
          {APP_NAME} offers optional AI-powered features such as transaction categorization
          and receipt scanning. When you use these features, relevant data (e.g. a
          receipt photo or transaction description) is sent to Anthropic&rsquo;s API for
          processing. Anthropic&rsquo;s privacy policy applies to data processed by their API.
          AI features are opt-in and can be used with your own API key.
        </p>
      </Section>

      <Section title="5. Data Storage and Security">
        <p>
          Your data is stored in Supabase-hosted PostgreSQL databases with row-level
          security enforced — only you can read or write your own data. Data is encrypted
          in transit (TLS) and at rest. We do not have access to your Stripe payment
          instrument details; Stripe handles all payment processing.
        </p>
      </Section>

      <Section title="6. Data Retention and Deletion">
        <p>
          Your data is retained as long as your account is active. You can delete your
          account and all associated data at any time from the Settings page within the
          app. Deleted data is purged within 30 days.
        </p>
      </Section>

      <Section title="7. Third-Party Services">
        <p>We use the following third-party services:</p>
        <ul>
          <li><strong>Supabase</strong> — database and authentication</li>
          <li><strong>Vercel</strong> — hosting and edge functions</li>
          <li><strong>Stripe</strong> — payment processing (Pro/Plus subscriptions)</li>
          <li><strong>Anthropic</strong> — AI features (optional, opt-in)</li>
          <li><strong>Apple / Google</strong> — push notifications on mobile</li>
        </ul>
      </Section>

      <Section title="8. Children's Privacy">
        <p>
          {APP_NAME} is not directed to children under 13. We do not knowingly collect
          personal information from children under 13.
        </p>
      </Section>

      <Section title="9. Changes to This Policy">
        <p>
          We may update this policy from time to time. We will notify you of significant
          changes by updating the effective date above and, where appropriate, via email.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions about this policy? Contact us at{" "}
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
