/**
 * Dynamic sitemap for PostUp.
 *
 * Next.js 14 metadata route — export default async function returning
 * MetadataRoute.Sitemap. The file lives at src/app/sitemap.ts and is
 * served at /sitemap.xml automatically.
 *
 * Includes:
 *   - Static pages (home, hubs, stream, login, register)
 *   - All hub pages (/h/<slug>)
 *   - Recent 1000 drops (/drops/<id>)
 *   - All user profile pages (/u/<handle>)
 */
import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const BASE_URL = env.NEXTAUTH_URL.replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/hubs`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/stream`,
      lastModified: new Date(),
      changeFrequency: "always",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/register`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  // Fetch hub slugs + updatedAt in parallel with drops + users
  const [hubs, drops, users] = await Promise.all([
    db.hub.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.drop.findMany({
      where: { isRemoved: false },
      select: { id: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    db.user.findMany({
      select: { handle: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const hubPages: MetadataRoute.Sitemap = hubs.map((h) => ({
    url: `${BASE_URL}/h/${h.slug}`,
    lastModified: h.updatedAt,
    changeFrequency: "hourly",
    priority: 0.8,
  }));

  const dropPages: MetadataRoute.Sitemap = drops.map((d) => ({
    url: `${BASE_URL}/drops/${d.id}`,
    lastModified: d.updatedAt,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const userPages: MetadataRoute.Sitemap = users.map((u) => ({
    url: `${BASE_URL}/u/${u.handle}`,
    lastModified: u.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticPages, ...hubPages, ...dropPages, ...userPages];
}
