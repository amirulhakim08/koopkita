/** Invoice arithmetic in integer sen — mirrors app_private.recalc_invoice. */
export type LineInput = { quantity: number; unit_price_sen: number; discount_sen?: number };

export function lineGross(l: LineInput): number {
  return Math.round(l.quantity * l.unit_price_sen);
}

export function invoiceTotals(lines: LineInput[], taxRateBp = 0) {
  const subtotal = lines.reduce((a, l) => a + lineGross(l), 0);
  const discount = lines.reduce((a, l) => a + (l.discount_sen ?? 0), 0);
  const tax = Math.round(((subtotal - discount) * taxRateBp) / 10000);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

/** Status shown to people: an unpaid invoice past its due date is "overdue". */
export function displayStatus(status: string, dueDate: string, todayIso: string): string {
  return (status === "issued" || status === "partially_paid") && dueDate < todayIso ? "overdue" : status;
}
