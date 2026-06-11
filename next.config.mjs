/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Produce a self-contained Node.js server bundle for Docker.
  // The output lands in .next/standalone/server.js.
  output: "standalone",
};

export default nextConfig;
