import { describe, expect, it } from "vitest";
import { parseReceipt } from "@/lib/ocr/parse-receipt";

const today = new Date("2026-11-17T10:00:00Z");

describe("receipt parsing (OCR / PDF text)", () => {
  it("reads a Maybank2u-style transfer receipt", () => {
    const text = `Maybank2u
Transfer Successful
Reference number 4567891234
Transaction date 15 Nov 2026 10:32:11
Amount RM 850.00
Recipient KOPERASI INDUSTRI TANI AGRO`;
    expect(parseReceipt(text, today)).toEqual({ amountSen: 85000, date: "2026-11-15", reference: "4567891234" });
  });

  it("reads a DuitNow / CIMB style receipt with dd/mm/yyyy and RM thousands", () => {
    const text = `CIMB Clicks
DuitNow Transfer
Date: 03/11/2026
Jumlah: RM1,700.00
No. Rujukan: CT20261103ABC123
Status: Berjaya`;
    expect(parseReceipt(text, today)).toEqual({ amountSen: 170000, date: "2026-11-03", reference: "CT20261103ABC123" });
  });

  it("uses the next line when the value is printed under the label", () => {
    const text = `Transaction ID
M2U998877665544
Total Amount
MYR 5,950.00
Date 2026-10-30`;
    expect(parseReceipt(text, today)).toEqual({ amountSen: 595000, date: "2026-10-30", reference: "M2U998877665544" });
  });

  it("supports Malay month names and ignores future dates", () => {
    expect(parseReceipt("Tarikh: 5 Ogos 2026\nRM 40", today).date).toBe("2026-08-05");
    expect(parseReceipt("Valid until 01/01/2030\nPaid 02/11/2026\nRM 10.00", today).date).toBe("2026-11-02");
  });

  it("falls back to the largest RM amount and returns nothing it cannot find", () => {
    expect(parseReceipt("Fee RM 0.50\nRM 120.00 transferred", today).amountSen).toBe(12000);
    expect(parseReceipt("hello world", today)).toEqual({ amountSen: undefined, date: undefined, reference: undefined });
  });
});
