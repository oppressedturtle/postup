/**
 * Robots.txt for PostUp.
 *
 * Next.js 14 metadata route — served at /robots.txt automatically.
 *
 * Policy:
 *   - Allow all crawlers for public-facing pages.
 *   - Disallow: admin panel, account settings, API routes.
 */
import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

const BASE_URL = env.NEXTAUTH_URL.replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/settings", "/api"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
