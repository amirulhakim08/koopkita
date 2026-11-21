/** Pure project rules shared by the UI (the database enforces the same rules). */

/** Cooperative share in basis points: the part of the rate above the threshold, at most the cap. */
export function defaultCoopRateBp(rateBp: number, thresholdBp = 600, capBp = 100): number {
  return Math.min(Math.max(rateBp - thresholdBp, 0), capBp);
}

export type AmountRules = {
  minSen: number; stepSen: number; maxPerMemberSen: number | null;
  /** member's approved + pending contributions so far */ mineSen: number;
  /** target minus everyone's approved + pending contributions */ availableSen: number;
};

/** Largest amount this member may still contribute (a multiple of the step), or 0. */
export function maxAllowedSen(r: AmountRules): number {
  const cap = Math.min(r.availableSen, r.maxPerMemberSen == null ? Infinity : r.maxPerMemberSen - r.mineSen);
  return cap > 0 ? Math.floor(cap / r.stepSen) * r.stepSen : 0;
}

/** Smallest amount this member may contribute: up to the minimum first, then one step. */
export function minAllowedSen(r: AmountRules): number {
  const needed = Math.max(r.minSen - r.mineSen, r.stepSen);
  return Math.ceil(needed / r.stepSen) * r.stepSen;
}

/** Bahasa Melayu error for an amount, or null when it is valid. */
export function amountError(amountSen: number, r: AmountRules, fmt: (sen: number) => string): string | null {
  if (!Number.isSafeInteger(amountSen) || amountSen <= 0) return "Jumlah tidak sah.";
  if (amountSen % r.stepSen !== 0) return `Jumlah mesti gandaan ${fmt(r.stepSen)}.`;
  if (r.mineSen + amountSen < r.minSen) return `Minimum penyertaan ialah ${fmt(r.minSen)}.`;
  if (r.maxPerMemberSen != null && r.mineSen + amountSen > r.maxPerMemberSen)
    return `Melebihi had seorang ahli ${fmt(r.maxPerMemberSen)}.`;
  if (amountSen > r.availableSen) return `Melebihi baki projek ${fmt(Math.max(r.availableSen, 0))}.`;
  return null;
}

/** Illustration only: member's share of a given rate on an amount (no charges). */
export function illustrativeDividendSen(amountSen: number, rateBp: number, coopBp: number): number {
  return Math.round((amountSen * (rateBp - coopBp)) / 10000);
}
