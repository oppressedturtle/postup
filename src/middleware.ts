/**
 * PostUp middleware — route protection.
 *
 * Keeps the middleware edge-compatible by checking for the Auth.js session
 * cookie directly, rather than importing the full auth config (which pulls in
 * `pg` → Node.js `crypto`, unavailable in the Edge runtime).
 *
 * This is an optimistic check: we verify the cookie is present, not that the
 * session is valid. Actual session validation (including DB lookup for database-
 * strategy sessions and the suspended-account check) happens in every route
 * handler via `requireAuth()`.
 *
 * Public routes (no session cookie required):
 *   /                                  — landing / home feed
 *   /login, /register                  — auth pages
 *   /u/[handle]                        — public user profile
 *   /h/[slug]                          — public hub page (hub detail + drop feed)
 *   /search                            — search results page
 *   /api/auth/*                        — Auth.js internal routes
 *   /api/hubs, /api/hubs/[slug]        — GET discovery & detail
 *   /api/drops, /api/drops/[id]        — GET feed & drop detail
 *   /api/drops/[id]/replies            — GET reply list
 *   /api/replies/[id]                  — GET reply detail
 *   /api/hubs/[slug]/mod-log           — public mod log
 *   /api/link-preview                  — link preview scraper
 *   /api/votes                         — bulk vote state
 *   /api/stream                        — home feed (auth optional in handler)
 *   /api/users/top                     — Clout leaderboard
 *   /api/reports                       — GET warden/overseer reports
 *   /api/search                        — full-text search
 *   /api/hubs/trending                 — trending hubs
 *   /api/hubs/recommended              — recommended hubs
 *   /api/og                            — OG image generation (edge)
 *   /api/health                        — health check
 *   /sitemap.xml, /robots.txt          — crawlers
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  /^\/$/, // home
  /^\/login(\/.*)?$/, // login page
  /^\/register(\/.*)?$/, // register page
  /^\/search(\/.*)?$/, // search results page
  /^\/u\/[^/]+(\/.*)?$/, // /u/<handle>
  /^\/h\/[^/]+(\/.*)?$/, // /h/<slug>
  /^\/api\/auth(\/.*)?$/, // all /api/auth/* (includes register API)
  /^\/api\/hubs$/, // GET hub discovery
  /^\/api\/hubs\/[^/]+$/, // GET hub detail
  /^\/api\/drops$/, // GET drop feed
  /^\/api\/drops\/[^/]+$/, // GET drop detail
  /^\/api\/drops\/[^/]+\/replies$/, // GET reply list
  /^\/api\/replies\/[^/]+$/, // GET reply detail
  /^\/api\/hubs\/[^/]+\/mod-log$/, // public hub mod log
  /^\/api\/link-preview$/, // link preview scraper
  /^\/api\/votes$/, // bulk vote state
  /^\/api\/stream$/, // home feed
  /^\/api\/users\/top$/, // Clout leaderboard
  /^\/api\/reports$/, // GET reports
  /^\/api\/search$/, // full-text search
  /^\/api\/hubs\/trending$/, // trending hubs
  /^\/api\/hubs\/recommended$/, // recommended hubs
  /^\/api\/og$/, // OG images
  /^\/api\/health$/, // health check
  /^\/sitemap\.xml$/, // sitemap
  /^\/robots\.txt$/, // robots.txt
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

// Auth.js v5 session cookie names (plain HTTP dev / HTTPS prod).
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => !!request.cookies.get(name)?.value);
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Cookie presence is an optimistic gate. Route handlers call requireAuth()
  // which performs the actual DB session validation + suspended check.
  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)",
  ],
};
