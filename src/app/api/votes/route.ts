/**
 * /api/votes
 *
 * GET — Bulk fetch the caller's vote state for a list of drop IDs (auth required).
 *
 * Query params:
 *   dropIds=id1,id2,...  (max 50 IDs)
 *
 * Responses:
 *   200  { [dropId]: { userVote: 1 | -1 | null, heat: number } }
 *   400  missing or malformed dropIds param
 *   401  unauthenticated
 *   500  internal error
 *
 * Used by the feed to hydrate all visible drops' vote state in a single request
 * rather than N individual calls.
 */
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

const MAX_IDS = 50;

// ---------------------------------------------------------------------------
// GET /api/votes
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const raw = request.nextUrl.searchParams.get("dropIds");
  if (!raw || raw.trim() === "") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "dropIds query param is required." } },
      { status: 400 },
    );
  }

  const dropIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  if (dropIds.length === 0) {
    return NextResponse.json({});
  }

  try {
    // Fetch drop heats + user votes in parallel
    const [drops, votes] = await Promise.all([
      db.drop.findMany({
        where: { id: { in: dropIds }, isRemoved: false },
        select: { id: true, heat: true },
      }),
      db.vote.findMany({
        where: {
          userId: user.id,
          dropId: { in: dropIds },
        },
        select: { dropId: true, value: true },
      }),
    ]);

    // Build vote map: dropId → value
    const voteMap = new Map<string, 1 | -1>();
    for (const v of votes) {
      if (v.dropId) {
        voteMap.set(v.dropId, v.value as 1 | -1);
      }
    }

    // Build response map
    const result: Record<string, { userVote: 1 | -1 | null; heat: number }> = {};
    for (const drop of drops) {
      result[drop.id] = {
        userVote: voteMap.get(drop.id) ?? null,
        heat: drop.heat,
      };
    }

    // Drops that were requested but not found (removed/non-existent) are omitted
    // from the response — callers treat missing keys as { userVote: null, heat: 0 }.

    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err, userId: user.id, dropIds }, "votes: GET bulk failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve vote states." } },
      { status: 500 },
    );
  }
}
