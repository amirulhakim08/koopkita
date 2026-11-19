import { describe, expect, it } from "vitest";
import { displayStatus, invoiceTotals } from "@/features/business/totals";

describe("invoice totals (mirror of the database calculation)", () => {
  it("adds lines, subtracts discounts and applies SST in integer sen", () => {
    const lines = [{ quantity: 4, unit_price_sen: 4500 }, { quantity: 10, unit_price_sen: 350, discount_sen: 500 }];
    expect(invoiceTotals(lines)).toEqual({ subtotal: 21500, discount: 500, tax: 0, total: 21000 });
    expect(invoiceTotals([{ quantity: 1, unit_price_sen: 10000 }], 600)).toEqual({ subtotal: 10000, discount: 0, tax: 600, total: 10600 });
  });
  it("rounds fractional quantities to the nearest sen", () => {
    expect(invoiceTotals([{ quantity: 1.5, unit_price_sen: 333 }]).total).toBe(500);
  });
  it("flags unpaid invoices past their due date as overdue", () => {
    expect(displayStatus("issued", "2026-11-01", "2026-11-19")).toBe("overdue");
    expect(displayStatus("partially_paid", "2026-11-30", "2026-11-19")).toBe("partially_paid");
    expect(displayStatus("paid", "2026-11-01", "2026-11-19")).toBe("paid");
  });
});
