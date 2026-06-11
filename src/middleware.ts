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
