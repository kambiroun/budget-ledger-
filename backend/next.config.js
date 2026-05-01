// @ts-check
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { allowedOrigins: ["localhost:3000"] } },
  // Load these large/native packages from node_modules at runtime instead of
  // bundling them — required for dynamic import() to find them on Vercel.
  serverExternalPackages: ["pdfjs-dist", "xlsx"],
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Suppress noisy build output unless CI
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Don't expose source maps to the browser
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
