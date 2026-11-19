import { describe, expect, it } from "vitest";
import { findByPhone, matchCustomers, normPhone } from "@/features/business/customer-match";

const customers = [
  { id: "1", name: "Encik Ali Contoh", phone: "011-2233 4455" },
  { id: "2", name: "Alia Kedai Runcit", phone: "+60198887777" },
  { id: "3", name: "Kafe Contoh Sdn Bhd", phone: null },
];

describe("customer matching", () => {
  it("normalises Malaysian phone numbers", () => {
    expect(normPhone("+60 19-888 7777")).toBe("0198887777");
    expect(normPhone("019 888 7777")).toBe("0198887777");
    expect(normPhone(null)).toBe("");
  });

  it("finds customers by name words or phone digits", () => {
    expect(matchCustomers(customers, "ali").map((c) => c.id)).toEqual(["1", "2"]);
    expect(matchCustomers(customers, "contoh kafe").map((c) => c.id)).toEqual(["3"]);
    expect(matchCustomers(customers, "0112").map((c) => c.id)).toEqual(["1"]);
    expect(matchCustomers(customers, "+6019888").map((c) => c.id)).toEqual(["2"]);
    expect(matchCustomers(customers, "").length).toBe(3);
    expect(matchCustomers(customers, "tiada")).toEqual([]);
  });

  it("detects a phone number that already belongs to a customer", () => {
    expect(findByPhone(customers, "0198887777")?.id).toBe("2");
    expect(findByPhone(customers, "+60 11 2233 4455")?.id).toBe("1");
    expect(findByPhone(customers, "0120000000")).toBeUndefined();
    expect(findByPhone(customers, "011")).toBeUndefined();
  });
});
