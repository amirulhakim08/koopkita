import { describe, expect, it } from "vitest";
import { amountError, defaultCoopRateBp, illustrativeDividendSen, maxAllowedSen, minAllowedSen } from "@/features/projects/calc";
import { formatPct, formatRM, parsePctToBp } from "@/lib/format";

const rules = (o: Partial<Parameters<typeof amountError>[1]> = {}) => ({
  minSen: 50000, stepSen: 50000, maxPerMemberSen: null, mineSen: 0, availableSen: 2000000, ...o,
});

describe("project amount rules", () => {
  it("accepts RM500, RM1,000, RM1,500 and rejects RM750 (min RM500, step RM500)", () => {
    for (const sen of [50000, 100000, 150000]) expect(amountError(sen, rules(), formatRM)).toBeNull();
    expect(amountError(75000, rules(), formatRM)).toMatch(/gandaan/);
  });
  it("min RM1,000 / step RM500: first contribution reaches the minimum, top-ups follow the step", () => {
    const r = rules({ minSen: 100000 });
    expect(amountError(50000, r, formatRM)).toMatch(/Minimum/);
    expect(minAllowedSen(r)).toBe(100000);
    expect(minAllowedSen({ ...r, mineSen: 100000 })).toBe(50000);
    expect(amountError(50000, { ...r, mineSen: 100000 }, formatRM)).toBeNull();
  });
  it("respects the per-member maximum and the project's remaining capacity", () => {
    expect(maxAllowedSen(rules({ maxPerMemberSen: 500000, mineSen: 200000 }))).toBe(300000);
    expect(maxAllowedSen(rules({ availableSen: 120000 }))).toBe(100000);
    expect(amountError(150000, rules({ availableSen: 100000 }), formatRM)).toMatch(/baki projek/);
  });
});

describe("profit sharing", () => {
  it("cooperative takes the part above 6%, capped at 1 point", () => {
    expect([400, 500, 600, 650, 700, 800, 1000].map((r) => defaultCoopRateBp(r))).toEqual([0, 0, 0, 50, 100, 100, 100]);
  });
  it("illustrates 9% on RM2,000 as RM180", () => {
    expect(illustrativeDividendSen(200000, 1000, 100)).toBe(18000);
  });
  it("formats and parses percentages", () => {
    expect([formatPct(1000), formatPct(650), formatPct(25)]).toEqual(["10%", "6.5%", "0.25%"]);
    expect([parsePctToBp("10"), parsePctToBp("6.5"), parsePctToBp("6,5%"), parsePctToBp("x")]).toEqual([1000, 650, 650, null]);
  });
});
