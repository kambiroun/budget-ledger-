/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: { serverActions: { allowedOrigins: ["localhost:3000"] } },
  // Load these large/native packages from node_modules at runtime instead of
  // bundling them — required for dynamic import() to find them on Vercel.
  serverExternalPackages: ["pdfjs-dist", "xlsx"],
};
