import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { CapacitorBridge } from "@/components/CapacitorBridge";
import { Analytics } from "@/components/Analytics";

export const metadata: Metadata = {
  title: "Budget Ledger",
  description: "An editorial budget tracker that respects your attention.",
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
        <ConnectionBadge />
        {children}
      </body>
    </html>
  );
}
