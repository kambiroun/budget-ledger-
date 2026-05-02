import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { CapacitorBridge } from "@/components/CapacitorBridge";
import { Analytics } from "@/components/Analytics";
import { ReferralCapture } from "@/components/ReferralCapture";
import { LaunchBanner } from "@/components/LaunchBanner";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://budget-ledger.vercel.app";

export const metadata: Metadata = {
  title: "Budget Ledger",
  description: "A quiet personal finance app. Track income and expenses, set budgets, and import from any bank. No ads, no algorithms.",
  openGraph: {
    title: "Budget Ledger",
    description: "A quiet personal finance app. Track income and expenses, set budgets, and import from any bank. No ads, no algorithms.",
    url: appUrl,
    siteName: "Budget Ledger",
    images: [{ url: `${appUrl}/og-image.png`, width: 1200, height: 630, alt: "Budget Ledger" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Budget Ledger",
    description: "A quiet personal finance app. No ads, no algorithms.",
    images: [`${appUrl}/og-image.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <CapacitorBridge />
        <Analytics />
        <ReferralCapture />
        <ConnectionBadge />
        <LaunchBanner />
        {children}
      </body>
    </html>
  );
}
