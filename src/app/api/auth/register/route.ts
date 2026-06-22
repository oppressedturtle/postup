/**
 * POST /api/auth/register
 *
 * Creates a new PostUp account with email + password.
 *
 * Request body: { email, password, handle }
 *
 * Responses:
 *   201 { success: true, user: { id, email, handle } }
 *   400 invalid body shape
 *   422 validation failure (field-level errors)
 *   409 email or handle already taken
 *   429 rate limit exceeded
 *   500 unexpected server error
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import { authLimiter, extractClientIp } from "@/lib/rate-limit";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  handle: z
    .string()
    .regex(
      /^[a-zA-Z0-9_]{3,20}$/,
      "Handle must be 3–20 characters: letters, numbers, and underscores only",
    ),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Rate limiting (keyed on client IP) -----------------------------------
  const ip = extractClientIp(request);
  const limit = await authLimiter(ip);

  if (!limit.success) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many registration attempts. Please try again later.",
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.reset),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(limit.reset),
        },
      },
    );
  }

  // --- Parse body -----------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  // --- Validate -------------------------------------------------------------
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid registration data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { email, password, handle } = parsed.data;

  // --- Uniqueness checks (single query via Promise.all) ---------------------
  const [existingEmail, existingHandle] = await Promise.all([
    db.user.findUnique({ where: { email }, select: { id: true } }),
    db.user.findUnique({ where: { handle }, select: { id: true } }),
  ]);

  if (existingEmail) {
    return NextResponse.json(
      {
        error: {
          code: "EMAIL_TAKEN",
          message: "An account with that email already exists.",
        },
      },
      { status: 409 },
    );
  }

  if (existingHandle) {
    return NextResponse.json(
      {
        error: {
          code: "HANDLE_TAKEN",
          message: "That handle is already taken. Please choose another.",
        },
      },
      { status: 409 },
    );
  }

  // --- Hash password + create user -----------------------------------------
  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        handle,
        displayName: handle, // default display name equals the handle
      },
      select: { id: true, email: true, handle: true },
    });

    logger.info({ userId: user.id, handle }, "auth: new user registered");

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "auth: registration failed unexpectedly");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Registration failed due to an internal error.",
        },
      },
      { status: 500 },
    );
  }
}
