/** Formatting helpers — Malaysian conventions (RM, dd/mm/yyyy, Asia/Kuala_Lumpur). */
export const TIMEZONE = "Asia/Kuala_Lumpur";

const rm = new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR", minimumFractionDigits: 2 });

/** 85000 -> "RM 850.00" */
export function formatRM(sen: number | string | bigint | null | undefined): string {
  const n = Number(sen ?? 0);
  return rm.format(n / 100).replace(/ /g, " ");
}

/** "850", "850.5", "1,234.56" -> sen (integer). Returns null for invalid input. */
export function parseRMToSen(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/rm/i, "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const sen = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(sen) ? sen : null;
}

/** Plain amount for CSV: 85000 -> "850.00" */
export function senToDecimal(sen: number | string | null | undefined): string {
  const n = Number(sen ?? 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

/** "2027-05-01" or ISO timestamp -> "01/05/2027" (Malaysia time) */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  return dateTimeFmt.format(new Date(value)).replace(",", "");
}

/** Today's date in Malaysia as YYYY-MM-DD */
export function todayKL(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

/** Mask an IC number for display: 900101-02-**** */
export function maskIc(ic: string | null | undefined): string {
  if (!ic) return "-";
  return `${ic.slice(0, 6)}-${ic.slice(6, 8)}-****`;
}

export function formatIc(ic: string | null | undefined): string {
  if (!ic) return "-";
  return `${ic.slice(0, 6)}-${ic.slice(6, 8)}-${ic.slice(8)}`;
}
