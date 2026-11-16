import { describe, expect, it } from "vitest";
import { calculateCommission, estimateCommission, outstanding, totalFor, type ApprovedShare } from "@/features/commission/calculator";

const shares = (memberId: string, cattleId: string, n: number): ApprovedShare[] => Array.from({ length: n }, () => ({ memberId, cattleId }));

describe("commission calculator (mirrors the database engine)", () => {
  it.each([
    [1, 4000], [2, 8000], [3, 12000], [4, 16000], [5, 20000], [6, 24000],
  ])("%i share(s) of one cattle = %i sen", (n, expected) => {
    expect(totalFor(calculateCommission(shares("A", "C1", n)), "A")).toBe(expected);
  });

  it("7 shares of the same cattle by one member = RM300 (RM280 standard + RM20 incentive)", () => {
    const lines = calculateCommission(shares("A", "C1", 7));
    expect(totalFor(lines, "A")).toBe(30000);
    expect(lines).toEqual([
      { memberId: "A", type: "standard", amountSen: 28000, shares: 7 },
      { memberId: "A", type: "full_cattle_incentive", amountSen: 2000, shares: 7, cattleId: "C1" },
    ]);
  });

  it("RM300 replaces RM280 — it is not an additional RM300 bonus", () => {
    expect(totalFor(calculateCommission(shares("A", "C1", 7)), "A")).not.toBe(28000 + 30000);
  });

  it("7 shares of one cattle split between members = RM40 each (RM280 total)", () => {
    const lines = calculateCommission([...shares("A", "C1", 3), ...shares("B", "C1", 2), ...shares("C", "C1", 2)]);
    expect([totalFor(lines, "A"), totalFor(lines, "B"), totalFor(lines, "C")]).toEqual([12000, 8000, 8000]);
    expect(lines.some((l) => l.type === "full_cattle_incentive")).toBe(false);
  });

  it("7 shares across different cattle do not qualify", () => {
    const lines = calculateCommission([...shares("A", "C1", 4), ...shares("A", "C2", 3)]);
    expect(totalFor(lines, "A")).toBe(28000);
  });

  it("14 shares filling two whole cattle = RM600", () => {
    expect(totalFor(calculateCommission([...shares("A", "C1", 7), ...shares("A", "C2", 7)]), "A")).toBe(60000);
  });

  it("rejects configurations where the full-cattle amount is below 7 × rate", () => {
    expect(() => calculateCommission([], { commissionPerShareSen: 5000, fullCattleCommissionSen: 30000, sharesPerCattle: 7 })).toThrow();
  });

  it("estimates commission for a planned order", () => {
    expect(estimateCommission(7)).toBe(30000);
    expect(estimateCommission(9)).toBe(38000);
    expect(estimateCommission(3)).toBe(12000);
  });

  it("partial payouts reduce the outstanding balance", () => {
    expect(outstanding([12000], [5000])).toBe(7000);
    expect(outstanding([12000, -4000], [5000, 3000])).toBe(0);
    expect(outstanding([12000], [5000, 7000, -7000])).toBe(7000);
  });
});
