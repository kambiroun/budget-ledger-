/** HTML email template for the weekly spending digest. */

export interface WeeklyDigestData {
  displayName: string | null;
  weekLabel: string;       // e.g. "Apr 28 – May 4, 2026"
  totalSpent: number;
  totalBudget: number;     // 0 if no budgets set
  categories: Array<{
    name: string;
    color: string | null;
    spent: number;
    budget: number;        // 0 if no budget set
  }>;
  appUrl: string;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function buildWeeklyDigestEmail(data: WeeklyDigestData): { subject: string; html: string } {
  const { displayName, weekLabel, totalSpent, totalBudget, categories, appUrl } = data;

  const overBudget = totalBudget > 0 && totalSpent > totalBudget;
  const greeting = displayName ? `Hi ${displayName},` : "Hi there,";

  const budgetLine =
    totalBudget > 0
      ? `<p style="margin:0 0 24px;font-size:15px;color:#555;">
          You spent <strong>${fmt(totalSpent)}</strong> of your
          <strong>${fmt(totalBudget)}</strong> monthly budget this week.
          ${overBudget ? `<span style="color:#c8554b;"> You're over budget by ${fmt(totalSpent - totalBudget)}.</span>` : ""}
        </p>`
      : `<p style="margin:0 0 24px;font-size:15px;color:#555;">
          Total spending this week: <strong>${fmt(totalSpent)}</strong>
        </p>`;

  const topCats = categories
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8);

  const catRows = topCats
    .map((c) => {
      const pct = c.budget > 0 ? Math.min(100, Math.round((c.spent / c.budget) * 100)) : 0;
      const barColor = c.budget > 0 && c.spent > c.budget ? "#c8554b" : (c.color ?? "#6b8ab8");
      return `
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#333;">${c.name}</td>
          <td style="padding:8px 0 8px 16px;font-size:14px;color:#333;text-align:right;white-space:nowrap;">
            ${fmt(c.spent)}${c.budget > 0 ? ` <span style="color:#999;font-size:12px;">/ ${fmt(c.budget)}</span>` : ""}
          </td>
        </tr>
        ${
          c.budget > 0
            ? `<tr>
                <td colspan="2" style="padding:0 0 8px;">
                  <div style="background:#eee;border-radius:2px;height:4px;">
                    <div style="background:${barColor};border-radius:2px;height:4px;width:${pct}%;"></div>
                  </div>
                </td>
              </tr>`
            : ""
        }`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly spending digest</title>
</head>
<body style="margin:0;padding:0;background:#f7f6f3;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #e8e4df;border-radius:4px;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #e8e4df;">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#999;font-family:'JetBrains Mono',monospace;">Budget Ledger</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:normal;color:#1a1a1a;">Weekly digest</h1>
              <p style="margin:4px 0 0;font-size:13px;color:#999;">${weekLabel}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;font-size:15px;color:#333;">${greeting}</p>
              ${budgetLine}

              ${
                topCats.length > 0
                  ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                      ${catRows}
                    </table>`
                  : `<p style="font-size:14px;color:#999;">No expense transactions this week.</p>`
              }

              <a href="${appUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.05em;font-family:'JetBrains Mono',monospace;">
                View ledger →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e8e4df;">
              <p style="margin:0;font-size:11px;color:#bbb;">
                You're receiving this because weekly digests are enabled in your Budget Ledger settings.
                <a href="${appUrl}/app" style="color:#999;">Manage preferences</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const subject = overBudget
    ? `You're over budget this week — ${fmt(totalSpent)} spent`
    : `Your week: ${fmt(totalSpent)} spent`;

  return { subject, html };
}
