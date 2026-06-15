/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Control DNS prefetching behaviour.
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Prevent clickjacking — only allow framing from same origin.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Prevent MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send origin only on cross-origin requests; omit on downgrade.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict access to browser APIs not used by PostUp.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-eval' + 'unsafe-inline' required by Next.js runtime chunks.
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      // Tailwind injects inline styles at runtime.
      "style-src 'self' 'unsafe-inline'",
      // Allow MinIO (local dev) and any HTTPS image CDN; data: for base64 previews.
      "img-src 'self' data: blob: http://localhost:9000 https:",
      // Allow MinIO video and any HTTPS media host.
      "media-src 'self' http://localhost:9000 https:",
      // API calls are same-origin only.
      "connect-src 'self'",
      // oEmbed iframes: YouTube, Vimeo, Twitter/X embeds.
      "frame-src https://www.youtube.com https://player.vimeo.com https://platform.twitter.com",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Produce a self-contained Node.js server bundle for Docker.
  // The output lands in .next/standalone/server.js.
  output: "standalone",

  // Prisma 7 uses `node:` protocol imports internally (node:crypto, node:fs,
  // etc.) which webpack cannot resolve. Marking these packages as server
  // externals tells Next.js 14 to require() them at runtime rather than
  // bundling them — correct for server-only database/auth code.
  // (Next.js 15 renamed this to `serverExternalPackages`.)
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/client",
      "@prisma/adapter-pg",
      "prisma",
      "pg",
      "bcryptjs",
      "ioredis",
      "pino",
      "pino-pretty",
      "@aws-sdk/client-s3",
      "@aws-sdk/lib-storage",
    ],
  },

  // Custom webpack config to handle `node:` protocol imports from Prisma 7.
  // Prisma's generated client re-exports from @prisma/client/runtime/client.mjs
  // which uses `node:crypto`, `node:fs`, `node:path`, etc. Webpack 5 (used by
  // Next.js 14) cannot resolve the `node:` URI scheme out of the box.
  //
  // Solution: add a custom externals function that maps `node:*` imports to
  // their equivalent bare specifiers (which webpack already knows how to
  // exclude as Node.js built-ins when targeting the node runtime).
  webpack(config, { isServer }) {
    // For both server and edge builds, resolve `node:` protocol imports by
    // treating them as CommonJS externals. This prevents webpack from trying
    // to bundle built-in Node.js modules.
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
      ({ request }, callback) => {
        // Rewrite `node:crypto` → `crypto`, `node:fs` → `fs`, etc.
        if (request && request.startsWith("node:")) {
          const bare = request.replace(/^node:/, "");
          return callback(null, `commonjs ${bare}`);
        }
        callback();
      },
    ];
    return config;
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes.
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
