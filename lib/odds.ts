/**
 * Dynamic odds: the multiplier starts at the admin-set value and compresses
 * toward a floor as more money piles into the pool. Early bettors lock in the
 * juiciest multipliers.
 *
 *   currentOdds = max(FLOOR, startingOdds / (1 + k × totalMoneyBet))
 */

export const ODDS_FLOOR = 1.1;

/** Tuning constant — higher k means odds fall faster as the pool grows. */
export const ODDS_K = Number(process.env.ODDS_K ?? 0.005);

export function computeOdds(
  startingOdds: number,
  totalPool: number,
  k: number = ODDS_K,
): number {
  const raw = startingOdds / (1 + k * Math.max(0, totalPool));
  return round2(Math.max(ODDS_FLOOR, raw));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
