/**
 * Centralised, Zod-validated environment configuration for PostUp.
 *
 * All application code MUST import env vars from this module — never from
 * raw `process.env`. Validation runs once at module load time; any missing or
 * malformed variable throws immediately with a descriptive message so the
 * problem is caught at startup, not buried in a runtime 500 later.
 */
import { z } from "zod";

const envSchema = z.object({
  // ── Database ───────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // ── Auth.js / NextAuth ─────────────────────────────────────────────────────
  NEXTAUTH_SECRET: z
    .string()
    .min(16, "NEXTAUTH_SECRET must be at least 16 characters"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),

  // ── Redis ──────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),

  // ── S3-compatible storage ──────────────────────────────────────────────────
  S3_ENDPOINT: z.string().url("S3_ENDPOINT must be a valid URL"),
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY is required"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),

  // ── OAuth providers (optional — app works without these configured) ────────
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ── Runtime ────────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `[PostUp] Environment validation failed — fix the following before starting:\n${issues}`,
    );
  }

  return result.data;
}

export const env: Env = parseEnv();
