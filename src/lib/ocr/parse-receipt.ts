/**
 * Extracts the payment amount, date and bank reference from receipt text
 * (OCR output or a PDF text layer). Pure and heuristic: results are only
 * suggestions that pre-fill the form; the user always confirms them.
 */
export type ReceiptFields = { amountSen?: number; date?: string; reference?: string };

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mac: 3, mar: 3, march: 3,
  apr: 4, april: 4, mei: 5, may: 5, jun: 6, june: 6, jul: 7, julai: 7, july: 7, ogo: 8, ogos: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, november: 11,
  dis: 12, dec: 12, disember: 12, december: 12,
};

const MONEY = /(?:RM|MYR)\s*:?\s*([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/gi;
const BARE_MONEY = /\b([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2})\b/g;
const AMOUNT_KEYS = /(amount|jumlah|amaun|total|nilai|paid|dibayar|transfer amount|amount transferred)/i;
const REF_KEYS = /(reference|ref(?:erence)?\.?\s*(?:no|number|id)?|rujukan|no\.?\s*rujukan|transaction\s*(?:id|no|number|ref)|trans(?:action)?\s*ref|txn\s*(?:id|no)?|trx\s*(?:id|no)?|no\.?\s*transaksi|receipt\s*no|resit\s*no|invoice\s*no|approval\s*code|duitnow\s*ref)/i;

function toSen(raw: string): number | undefined {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const [w, f = ""] = cleaned.split(".");
  const sen = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return sen > 0 && sen < 100_000_000_00 ? sen : undefined;
}

function iso(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function findAmount(text: string): number | undefined {
  const lines = text.split(/\r?\n/);
  // 1. a currency amount on a line that names the amount
  for (const [i, line] of lines.entries()) {
    if (!AMOUNT_KEYS.test(line)) continue;
    const scope = `${line} ${lines[i + 1] ?? ""}`;
    for (const m of scope.matchAll(MONEY)) {
      const sen = toSen(m[1]);
      if (sen) return sen;
    }
    for (const m of line.matchAll(BARE_MONEY)) {
      const sen = toSen(m[1]);
      if (sen) return sen;
    }
  }
  // 2. otherwise the largest RM amount on the receipt
  const all = [...text.matchAll(MONEY)].map((m) => toSen(m[1])).filter((v): v is number => !!v);
  return all.length ? Math.max(...all) : undefined;
}

export function findDate(text: string, today = new Date()): string | undefined {
  const max = new Date(today.getTime() + 24 * 3600 * 1000);
  const candidates: string[] = [];
  for (const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const d = iso(+m[1], +m[2], +m[3]);
    if (d) candidates.push(d);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const d = iso(+m[3], +m[2], +m[1]); // Malaysian order: dd/mm/yyyy
    if (d) candidates.push(d);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{2,4})\b/g)) {
    const mon = MONTHS[m[2].toLowerCase()];
    const d = mon ? iso(+m[3], mon, +m[1]) : undefined;
    if (d) candidates.push(d);
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mon = MONTHS[m[1].toLowerCase()];
    const d = mon ? iso(+m[3], mon, +m[2]) : undefined;
    if (d) candidates.push(d);
  }
  return candidates.find((d) => new Date(`${d}T00:00:00Z`) <= max);
}

export function findReference(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const k = line.match(REF_KEYS);
    if (!k) continue;
    const after = line.slice((k.index ?? 0) + k[0].length).replace(/^[\s:.#-]+/, "");
    const scope = after.trim() ? after : lines[i + 1] ?? "";
    const tok = scope.match(/[A-Za-z0-9][A-Za-z0-9/-]{4,49}/);
    if (tok && /\d/.test(tok[0])) return tok[0].replace(/[-/]+$/, "");
  }
  // fallback: a long token with many digits (typical bank/DuitNow reference)
  const fallback = text.match(/\b(?=[A-Z0-9]*\d{6})[A-Z0-9]{10,40}\b/);
  return fallback?.[0];
}

export function parseReceipt(text: string, today = new Date()): ReceiptFields {
  const clean = text.replace(/[|]/g, " ").replace(/[ \t]+/g, " ");
  return { amountSen: findAmount(clean), date: findDate(clean, today), reference: findReference(clean) };
}
