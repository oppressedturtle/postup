/**
 * Auth.js v5 (NextAuth beta) configuration for PostUp.
 *
 * Strategy: database sessions — session tokens live in the DB backed by an
 * httpOnly cookie. No JWT is issued; the cookie is just a lookup key.
 *
 * Providers:
 *   - Credentials  (email + bcrypt password)
 *   - GitHub       (if GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set)
 *   - Google       (if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set)
 *
 * The session callback enriches the session object with PostUp-specific
 * fields (handle, role, clout) so client components never need a separate
 * /api/me call.
 */
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Zod schema for credentials login — validated inside authorize()
// ---------------------------------------------------------------------------
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Build provider list dynamically
// Provider typing uses `any[]` because each provider has a different generic
// shape and NextAuth accepts a heterogeneous array at runtime.
// ---------------------------------------------------------------------------
const providers: any[] = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;

      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) return null;

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        logger.warn({ email }, "auth: failed credentials login");
        return null;
      }

      logger.info({ userId: user.id }, "auth: credentials login success");

      return {
        id: user.id,
        email: user.email,
        name: user.displayName,
        image: user.avatar,
      };
    },
  }),
];

if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    }),
  );
}

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

// ---------------------------------------------------------------------------
// NextAuth initialisation
// ---------------------------------------------------------------------------
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Cast: Prisma 7 uses a custom output path; the adapter is compatible at runtime.
  adapter: PrismaAdapter(db as any),

  session: { strategy: "database" },

  secret: env.NEXTAUTH_SECRET,

  providers,

  callbacks: {
    /**
     * Augment the session with PostUp-specific user fields.
     * With database sessions `user` is the DB row returned by the adapter.
     */
    async session({ session, user }) {
      // `user` is the raw adapter user object (from the DB)
      const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { id: true, handle: true, role: true, clout: true },
      });

      if (dbUser) {
        session.user.id = dbUser.id;
        session.user.handle = dbUser.handle;
        session.user.role = dbUser.role;
        session.user.clout = dbUser.clout;
      }

      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});

/**
 * Convenience helper for server components / route handlers that just need
 * the current session without importing `auth` directly.
 */
export async function getSession() {
  return auth();
}
