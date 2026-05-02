/**
 * Thin wrapper around the Resend REST API.
 * Uses fetch directly to avoid bundling the full resend npm package server-side.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email");
    return false;
  }

  const from = payload.from ?? (process.env.RESEND_FROM_EMAIL ?? "Budget Ledger <noreply@budgetledger.app>");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[email] Resend error", res.status, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] sendEmail error", e);
    return false;
  }
}
