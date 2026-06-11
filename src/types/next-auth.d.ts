/**
 * Auth.js / NextAuth type augmentations for PostUp.
 *
 * Extends the default Session.user shape with PostUp-specific fields that the
 * session callback in src/lib/auth.ts populates from the database.
 */
import type { Role } from "@/generated/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      handle: string;
      role: Role;
      clout: number;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
