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

/** Basis points -> percentage text: 1000 -> "10%", 650 -> "6.5%", 25 -> "0.25%" */
export function formatPct(bp: number | string | null | undefined): string {
  const n = Number(bp ?? 0) / 100;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/** "10", "6.5", "6,5%" -> basis points (integer). Returns null for invalid input. */
export function parsePctToBp(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace("%", "").replace(",", ".").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const MONTHS_MS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

/** "2026-11-21" -> "21 November 2026" */
export function formatDateLong(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "-";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_MS[m - 1]} ${y}`;
}

/** "20:30:00" -> "8:30 malam", "09:00" -> "9:00 pagi", "13:15" -> "1:15 tengah hari" */
export function formatTimeMs(value: string | null | undefined): string {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return "-";
  const [h, m] = value.split(":").map(Number);
  const part = h < 12 ? "pagi" : h < 14 ? "tengah hari" : h < 19 ? "petang" : "malam";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${part}`;
}

/** Time of an ISO timestamp in Malaysia, 24-hour: "20:47" */
export function formatTimeKL(value: string | Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
