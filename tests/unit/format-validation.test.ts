import { describe, expect, it } from "vitest";
import { formatDate, formatRM, maskIc, parseRMToSen, senToDecimal } from "@/lib/format";
import { toCsv } from "@/lib/csv";
import { parseDbError } from "@/lib/errors";
import { icSchema, registerSchema, validateUpload } from "@/lib/validation";

describe("money", () => {
  it("formats sen as Malaysian ringgit", () => {
    expect(formatRM(85000)).toMatch(/RM\s?850\.00/);
    expect(formatRM(123456789)).toMatch(/RM\s?1,234,567\.89/);
  });
  it("parses ringgit input into integer sen without floating point errors", () => {
    expect(parseRMToSen("850")).toBe(85000);
    expect(parseRMToSen("RM 1,234.5")).toBe(123450);
    expect(parseRMToSen("0.29")).toBe(29);
    expect(parseRMToSen("12.345")).toBeNull();
    expect(parseRMToSen("-5")).toBeNull();
    expect(parseRMToSen("abc")).toBeNull();
  });
  it("renders decimals for CSV", () => {
    expect(senToDecimal(85000)).toBe("850.00");
    expect(senToDecimal(-2005)).toBe("-20.05");
  });
});

describe("dates", () => {
  it("uses dd/mm/yyyy in Malaysia time", () => {
    expect(formatDate("2027-05-01")).toBe("01/05/2027");
    expect(formatDate("2027-04-30T17:30:00Z")).toBe("01/05/2027"); // 01:30 MYT
  });
  it("masks identification numbers", () => {
    expect(maskIc("900101025555")).toBe("900101-02-****");
  });
});

describe("validation", () => {
  it("validates Malaysian IC numbers", () => {
    expect(icSchema.safeParse("900101-02-5555").success).toBe(true);
    expect(icSchema.safeParse("901301025555").success).toBe(false);
    expect(icSchema.safeParse("12345").success).toBe(false);
  });
  it("requires matching strong passwords and consent on registration", () => {
    const base = {
      full_name: "Ali bin Abu", email: "ali@example.com", phone: "012-345 6789", ic_number: "900101025555",
      address: "No 1, Jalan Tani", state: "Kedah", postcode: "05000", password: "Kuat12345A", confirm_password: "Kuat12345A", consent: "on",
    };
    expect(registerSchema.safeParse(base).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, confirm_password: "x" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, consent: undefined }).success).toBe(false);
  });
  it("restricts upload types and sizes", () => {
    expect(validateUpload({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(validateUpload({ type: "image/svg+xml", size: 1000 })).not.toBeNull();
    expect(validateUpload({ type: "image/png", size: 6 * 1024 * 1024 })).not.toBeNull();
  });
});

describe("csv & errors", () => {
  it("escapes values and neutralises spreadsheet formulas", () => {
    const csv = toCsv(["a", "b"], [["x,y", "=HYPERLINK(1)"], ["-20.05", 'q"t']]);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("-20.05");
    expect(csv).toContain('"q""t"');
  });
  it("maps database errors to safe messages", () => {
    expect(parseDbError({ message: "FORBIDDEN|Tiada akses" })).toEqual({ code: "FORBIDDEN", message: "Tiada akses" });
    expect(parseDbError({ message: "relation x does not exist" }).code).toBe("UNKNOWN");
    expect(parseDbError({ message: "relation x does not exist" }).message).not.toContain("relation");
  });
});
