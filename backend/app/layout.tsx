import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget Ledger",
  description: "An editorial budget tracker that respects your attention.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
