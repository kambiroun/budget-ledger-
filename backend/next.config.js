/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: { serverActions: { allowedOrigins: ["localhost:3000"] } }
};
