/** Customer search and de-duplication shared by the picker (client) and the server actions. */
export type CustomerLite = { id: string; name: string; phone: string | null };

/** Comparable form of a Malaysian phone number: digits only, "+60 12…" and "012…" are the same. */
export function normPhone(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("60")) return `0${d.slice(2)}`;
  return d;
}

/** The customer that already uses this phone number, if any. */
export function findByPhone<T extends CustomerLite>(customers: T[], phone: string | null | undefined): T | undefined {
  const p = normPhone(phone);
  if (p.length < 9) return undefined;
  return customers.find((c) => normPhone(c.phone) === p);
}

/** Customers whose name or phone number matches what was typed (name words in any order). */
export function matchCustomers<T extends CustomerLite>(customers: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers.slice(0, limit);
  const digits = q.replace(/\D/g, "");
  const words = q.split(/\s+/).filter(Boolean);
  return customers
    .filter((c) => {
      const name = c.name.toLowerCase();
      if (words.every((w) => name.includes(w))) return true;
      return digits.length >= 3 && normPhone(c.phone).includes(normPhone(digits) || digits);
    })
    .slice(0, limit);
}
