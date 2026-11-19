"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { FieldError } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRM, parseRMToSen, senToDecimal } from "@/lib/format";
import { invoiceTotals } from "./totals";

export type LineItem = { key: string; description: string; quantity: string; unit_price: string; discount: string };
export type SavedLine = { description: string; quantity: number; unit_price_sen: number; discount_sen: number };

const newItem = (): LineItem => ({ key: crypto.randomUUID(), description: "", quantity: "1", unit_price: "", discount: "" });

/** Line items being edited, plus their totals in sen (same arithmetic as the database). */
export function useLineItems(saved: SavedLine[] | undefined, taxRateBp: number) {
  const [items, setItems] = React.useState<LineItem[]>(() =>
    saved?.length
      ? saved.map((it) => ({
          key: crypto.randomUUID(), description: it.description, quantity: String(Number(it.quantity)),
          unit_price: senToDecimal(it.unit_price_sen), discount: it.discount_sen ? senToDecimal(it.discount_sen) : "",
        }))
      : [newItem()],
  );
  const lines = items.map((x) => ({
    quantity: Number(x.quantity) || 0, unit_price_sen: parseRMToSen(x.unit_price || "0") ?? 0, discount_sen: parseRMToSen(x.discount || "0") ?? 0,
  }));
  return { items, setItems, lines, totals: invoiceTotals(lines, taxRateBp) };
}

/** Editable list of items; field names items.N.* are read by the server actions. */
export function LineItemsCard({ state }: { state: ReturnType<typeof useLineItems> }) {
  const { items, setItems, lines } = state;
  const update = (key: string, field: keyof LineItem, value: string) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, [field]: value } : x)));
  return (
    <Card>
      <input type="hidden" name="item_count" value={items.length} />
      <CardHeader className="flex-row items-center justify-between"><CardTitle>Item</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <FieldError name="items" />
        {items.map((it, i) => {
          const gross = Math.round(lines[i].quantity * lines[i].unit_price_sen);
          return (
            <div key={it.key} className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_5rem_7rem_6rem_6rem_2rem] sm:items-end">
              <FormField label={`Perkara ${i + 1}`} htmlFor={`d-${it.key}`} name={`items.${i}.description`}>
                <Input id={`d-${it.key}`} name={`items.${i}.description`} value={it.description} onChange={(e) => update(it.key, "description", e.target.value)} placeholder="cth. Baja organik 25kg" />
              </FormField>
              <FormField label="Kuantiti" htmlFor={`q-${it.key}`} name={`items.${i}.quantity`}>
                <Input id={`q-${it.key}`} name={`items.${i}.quantity`} inputMode="decimal" value={it.quantity} onChange={(e) => update(it.key, "quantity", e.target.value)} />
              </FormField>
              <FormField label="Harga (RM)" htmlFor={`p-${it.key}`} name={`items.${i}.unit_price`}>
                <Input id={`p-${it.key}`} name={`items.${i}.unit_price`} inputMode="decimal" value={it.unit_price} onChange={(e) => update(it.key, "unit_price", e.target.value)} placeholder="0.00" />
              </FormField>
              <FormField label="Diskaun (RM)" htmlFor={`x-${it.key}`} name={`items.${i}.discount`}>
                <Input id={`x-${it.key}`} name={`items.${i}.discount`} inputMode="decimal" value={it.discount} onChange={(e) => update(it.key, "discount", e.target.value)} placeholder="0.00" />
              </FormField>
              <div className="text-right text-sm font-semibold tabular-nums sm:pb-2.5">{formatRM(gross - lines[i].discount_sen)}</div>
              <Button type="button" variant="ghost" size="icon" className="size-8 text-danger" aria-label={`Buang item ${i + 1}`}
                disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}><Trash2 /></Button>
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={() => setItems((xs) => [...xs, newItem()])} disabled={items.length >= 100}>
          <Plus /> Tambah item
        </Button>
      </CardContent>
    </Card>
  );
}

/** Subtotal / discount / SST / total rows. */
export function TotalsRows({ totals, taxRateBp, totalLabel = "Jumlah" }: { totals: ReturnType<typeof invoiceTotals>; taxRateBp: number; totalLabel?: string }) {
  return (
    <>
      <div className="flex justify-between"><span className="text-muted-foreground">Subjumlah</span><span className="tabular-nums">{formatRM(totals.subtotal)}</span></div>
      {totals.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Diskaun</span><span className="tabular-nums">-{formatRM(totals.discount)}</span></div>}
      {taxRateBp > 0 && <div className="flex justify-between"><span className="text-muted-foreground">SST ({taxRateBp / 100}%)</span><span className="tabular-nums">{formatRM(totals.tax)}</span></div>}
      <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>{totalLabel}</span><span className="tabular-nums">{formatRM(totals.total)}</span></div>
    </>
  );
}
