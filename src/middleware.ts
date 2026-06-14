/**
 * Auth.js v5 middleware for PostUp.
 *
 * Protects all routes except the explicit public allow-list below.
 * Unauthenticated requests to protected routes are redirected to /login.
 *
 * Public routes:
 *   /                     — landing page
 *   /login                — sign-in page
 *   /register             — registration page
 *   /u/[handle]           — public user profile
 *   /h/[slug]             — public hub page
 *   /api/auth/*           — Auth.js internal routes (sign-in, callbacks, etc.)
 *   /api/auth/register    — registration API endpoint
 *   /api/hubs (GET)       — hub discovery
 *   /api/hubs/[slug] (GET)— hub detail
 *   /api/drops (GET)      — drop feed
 *   /api/drops/[id] (GET) — drop detail
 *   /api/link-preview     — link preview scraper
 *   /api/votes            — bulk vote state (auth enforced in handler)
 *   /api/stream           — home feed (auth optional; handler degrades gracefully)
 *   /api/users/top        — Clout leaderboard (public)
 *   /api/drops/[id]/replies (GET) — reply list (auth enforced in handler for POST)
 *   /api/replies/[id] (GET)       — reply detail (auth enforced in handler for PATCH/DELETE)
 *   /api/hubs/[slug]/mod-log (GET) — public moderation log
 *   /api/reports (GET)            — warden/overseer scoped in handler
 *
 * Protected (require auth, enforced at middleware):
 *   /api/admin/*                  — Overseer admin API (role enforced in handler)
 *   /api/reports POST             — report submission (auth enforced in handler)
 *
 * Note: GET-only public API routes are allowed for all HTTP methods at
 * the middleware level; route handlers enforce auth for mutating methods.
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  /^\/$/, // home
  /^\/login(\/.*)?$/, // login page
  /^\/register(\/.*)?$/, // register page
  /^\/u\/[^/]+(\/.*)?$/, // /u/<handle>
  /^\/h\/[^/]+(\/.*)?$/, // /h/<slug>
  /^\/api\/auth(\/.*)?$/, // all /api/auth/* (includes register API)
  /^\/api\/hubs$/, // GET hub discovery (auth enforced in handler for POST)
  /^\/api\/hubs\/[^/]+$/, // GET hub detail (auth enforced in handler for PATCH/DELETE)
  /^\/api\/drops$/, // GET drop feed (auth enforced in handler for POST)
  /^\/api\/drops\/[^/]+$/, // GET drop detail (auth enforced in handler for PATCH/DELETE)
  /^\/api\/link-preview$/, // link preview scraper (rate-limited in handler)
  /^\/api\/votes$/, // bulk vote state (auth enforced in handler)
  /^\/api\/stream$/, // home feed (auth optional in handler)
  /^\/api\/users\/top$/, // Clout leaderboard (public)
  /^\/api\/drops\/[^/]+\/replies$/, // GET reply list (auth enforced in handler for POST)
  /^\/api\/replies\/[^/]+$/, // GET reply detail (auth enforced in handler for PATCH/DELETE)
  /^\/api\/hubs\/[^/]+\/mod-log$/, // public hub mod log
  /^\/api\/reports$/, // GET reports (warden/overseer scoped in handler); POST auth enforced in handler
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

export default auth(function middleware(request: NextRequest & { auth: unknown }) {
  const { pathname } = request.nextUrl;

  // Allow public paths unconditionally
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // For protected paths, check session
  // `request.auth` is populated by Auth.js when wrapping with `auth()`
  const session = (request as unknown as { auth: { user?: unknown } | null }).auth;
  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  /*
   * Match all paths except:
   *   - Next.js internals (_next/static, _next/image, favicon.ico)
   *   - Static files in /public (images, fonts, etc.)
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)",
  ],
};
