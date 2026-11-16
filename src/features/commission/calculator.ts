/**
 * Pure commission rules — mirrors app_private.generate_commission in the database,
 * which is the source of truth. Used for previews and unit tests.
 *
 *  - Standard: rate × approved shares (RM40 each).
 *  - If ONE member holds all 7 shares of ONE cattle, that cattle earns the
 *    full-cattle amount (RM300) instead of 7 × rate (RM280). It is recorded as
 *    the standard entries plus an incentive entry of (RM300 − RM280) = RM20.
 */
export type CommissionRates = {
  commissionPerShareSen: number;
  fullCattleCommissionSen: number;
  sharesPerCattle: number;
};

export const DEFAULT_RATES: CommissionRates = {
  commissionPerShareSen: 4000,
  fullCattleCommissionSen: 30000,
  sharesPerCattle: 7,
};

/** One approved share = one confirmed slot. */
export type ApprovedShare = { memberId: string; cattleId: string };

export type CommissionLine = {
  memberId: string;
  type: "standard" | "full_cattle_incentive";
  amountSen: number;
  shares: number;
  cattleId?: string;
};

export function calculateCommission(shares: ApprovedShare[], rates: CommissionRates = DEFAULT_RATES): CommissionLine[] {
  if (rates.fullCattleCommissionSen < rates.commissionPerShareSen * rates.sharesPerCattle) {
    throw new Error("Full-cattle commission cannot be lower than the standard commission for a whole cattle");
  }
  const lines: CommissionLine[] = [];
  const byMember = new Map<string, ApprovedShare[]>();
  for (const s of shares) byMember.set(s.memberId, [...(byMember.get(s.memberId) ?? []), s]);

  const perCattle = new Map<string, Set<string>>();
  const perCattleCount = new Map<string, number>();
  for (const s of shares) {
    perCattle.set(s.cattleId, (perCattle.get(s.cattleId) ?? new Set()).add(s.memberId));
    perCattleCount.set(s.cattleId, (perCattleCount.get(s.cattleId) ?? 0) + 1);
  }

  for (const [memberId, own] of byMember) {
    lines.push({ memberId, type: "standard", amountSen: own.length * rates.commissionPerShareSen, shares: own.length });
    const incentive = rates.fullCattleCommissionSen - rates.sharesPerCattle * rates.commissionPerShareSen;
    if (incentive <= 0) continue;
    for (const cattleId of new Set(own.map((s) => s.cattleId))) {
      const owners = perCattle.get(cattleId)!;
      if (owners.size === 1 && perCattleCount.get(cattleId) === rates.sharesPerCattle) {
        lines.push({ memberId, type: "full_cattle_incentive", amountSen: incentive, shares: rates.sharesPerCattle, cattleId });
      }
    }
  }
  return lines;
}

export function totalFor(lines: CommissionLine[], memberId: string): number {
  return lines.filter((l) => l.memberId === memberId).reduce((sum, l) => sum + l.amountSen, 0);
}

/** Estimated commission for a member selling `shares` shares (assuming they fill whole cattle where possible). */
export function estimateCommission(shares: number, rates: CommissionRates = DEFAULT_RATES): number {
  const full = Math.floor(shares / rates.sharesPerCattle);
  const rest = shares % rates.sharesPerCattle;
  return full * rates.fullCattleCommissionSen + rest * rates.commissionPerShareSen;
}

/** Outstanding = earned (net of reversals) − paid (net of payout reversals). */
export function outstanding(ledgerSen: number[], payoutsSen: number[]): number {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return sum(ledgerSen) - sum(payoutsSen);
}
