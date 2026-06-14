/**
 * PostUp feed ranking utilities.
 *
 * All functions are pure — no DB or Redis calls. Callers fetch the data and
 * pass it in. This makes the functions trivially testable and keeps the
 * ranking logic decoupled from I/O.
 *
 * Algorithms
 * ----------
 *
 * wilsonScore  — Wilson score lower-bound confidence interval for a Bernoulli
 *                proportion. Used for "Best" sort on replies (Phase 5), where
 *                we want to rank replies that have been consistently upvoted
 *                higher than replies that got lucky with a small sample.
 *
 * hotScore     — Reddit-style "hot" score. Takes the log of the absolute heat
 *                so differences in large vote counts matter less than recency.
 *                A drop posted 12 h ago needs 10× the votes of a 1 h old drop
 *                to outrank it.
 *
 * isRising     — True for drops < 24 h old with a positive Heat score.
 *                Intentionally simple: the "Rising" feed is purely "new stuff
 *                people are already boosting", without the complexity of rate-
 *                of-change tracking.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** z-score for 95 % confidence interval (used in Wilson score). */
const Z_95 = 1.96;

/** Unix epoch of the PostUp "epoch" — votes before this date score 0. */
const EPOCH_MS = new Date("2026-06-01T00:00:00Z").getTime();

// ---------------------------------------------------------------------------
// wilsonScore
// ---------------------------------------------------------------------------

/**
 * Wilson score lower bound — returns a value in [0, 1].
 *
 * Useful as a "quality" sort for replies: it balances raw upvote count
 * against confidence that the item is genuinely good (penalises items with
 * very few votes).
 *
 * References:
 *   https://www.evanmiller.org/how-not-to-sort-by-average-rating.html
 *
 * @param ups    Number of upvotes (non-negative integer).
 * @param downs  Number of downvotes (non-negative integer).
 */
export function wilsonScore(ups: number, downs: number): number {
  const n = ups + downs;
  if (n === 0) return 0;

  const p = ups / n;
  const z = Z_95;
  const z2 = z * z;

  const numerator = p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  const denominator = 1 + z2 / n;

  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// hotScore
// ---------------------------------------------------------------------------

/**
 * Reddit-style hot score with time decay.
 *
 * Score = log10(max(|heat|, 1)) × sign(heat) + age_seconds / 45000
 *
 * The constant 45 000 seconds (≈ 12.5 hours) is the Reddit value; it means a
 * drop gains the equivalent of ~1 log-unit of heat roughly every 12 hours just
 * from being new.
 *
 * @param heat       Net vote score (can be negative).
 * @param createdAt  Drop creation time.
 */
export function hotScore(heat: number, createdAt: Date): number {
  const sign = heat > 0 ? 1 : heat < 0 ? -1 : 0;
  const order = Math.log10(Math.max(Math.abs(heat), 1));
  const ageSeconds = (createdAt.getTime() - EPOCH_MS) / 1000;

  return sign * order + ageSeconds / 45_000;
}

// ---------------------------------------------------------------------------
// isRising
// ---------------------------------------------------------------------------

/**
 * Returns true if the drop qualifies for the "Rising" feed.
 *
 * Criteria:
 *   - Created within the last 24 hours.
 *   - Has a positive Heat score (at least one more Boost than Bury).
 *
 * @param heat       Net vote score.
 * @param createdAt  Drop creation time.
 */
export function isRising(heat: number, createdAt: Date): boolean {
  const ageMs = Date.now() - createdAt.getTime();
  return heat > 0 && ageMs < 24 * 60 * 60 * 1000;
}
