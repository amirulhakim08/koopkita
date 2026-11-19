"use client";
import * as React from "react";
import { BookOpen, Check, PencilLine, Plus, Trash2, X } from "lucide-react";
import { FieldError } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRM, parseRMToSen, senToDecimal } from "@/lib/format";
import { invoiceTotals } from "./totals";

export type CatalogOption = { id: string; name: string; price_sen: number };
export type LineItem = {
  key: string; description: string; quantity: string; unit_price: string; discount: string;
  fromCatalog: boolean; saveToCatalog: boolean;
  pending: { name: string; price: string } | null; // catalogue item chosen, price not yet confirmed
};
export type SavedLine = { description: string; quantity: number; unit_price_sen: number; discount_sen: number };

const newItem = (): LineItem => ({
  key: crypto.randomUUID(), description: "", quantity: "1", unit_price: "", discount: "", fromCatalog: false, saveToCatalog: false, pending: null,
});

/** Line items being edited, plus their totals in sen (same arithmetic as the database). */
export function useLineItems(saved: SavedLine[] | undefined, taxRateBp: number) {
  const [items, setItems] = React.useState<LineItem[]>(() =>
    saved?.length
      ? saved.map((it) => ({
          ...newItem(), description: it.description, quantity: String(Number(it.quantity)),
          unit_price: senToDecimal(it.unit_price_sen), discount: it.discount_sen ? senToDecimal(it.discount_sen) : "",
        }))
      : [newItem()],
  );
  const lines = items.map((x) => ({
    quantity: Number(x.quantity) || 0, unit_price_sen: parseRMToSen(x.unit_price || "0") ?? 0, discount_sen: parseRMToSen(x.discount || "0") ?? 0,
  }));
  return { items, setItems, lines, totals: invoiceTotals(lines, taxRateBp) };
}

function matchCatalog(catalog: CatalogOption[], query: string, limit = 8) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((c) => words.every((w) => c.name.toLowerCase().includes(w))).slice(0, limit);
}

/** Editable list of items; field names items.N.* are read by the server actions. */
export function LineItemsCard({ state, catalog = [] }: { state: ReturnType<typeof useLineItems>; catalog?: CatalogOption[] }) {
  const { items, setItems, lines } = state;
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const patch = (key: string, p: Partial<LineItem>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const inCatalog = (name: string) => catalog.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <Card>
      <input type="hidden" name="item_count" value={items.length} />
      <CardHeader className="flex-row items-center justify-between"><CardTitle>Item</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <FieldError name="items" />
        {items.map((it, i) => {
          const gross = Math.round(lines[i].quantity * lines[i].unit_price_sen);
          const options = catalog.length ? matchCatalog(catalog, it.description) : [];
          const showList = openKey === it.key && catalog.length > 0 && !it.pending;
          const pendingSen = it.pending ? parseRMToSen(it.pending.price || "") : null;
          return (
            <div key={it.key} className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_5rem_7rem_6rem_6rem_2rem] sm:items-end">
                <FormField label={`Perkara ${i + 1}`} htmlFor={`d-${it.key}`} name={`items.${i}.description`}>
                  <div className="relative">
                    <Input id={`d-${it.key}`} name={`items.${i}.description`} value={it.description} autoComplete="off"
                      placeholder={catalog.length ? "Cari dalam katalog atau taip sendiri" : "cth. Baja organik 25kg"}
                      onChange={(e) => { patch(it.key, { description: e.target.value, fromCatalog: false }); setOpenKey(it.key); }}
                      onFocus={() => setOpenKey(it.key)} onBlur={() => setTimeout(() => setOpenKey((k) => (k === it.key ? null : k)), 150)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); if (e.key === "Escape") setOpenKey(null); }} />
                    {showList && (
                      <ul role="listbox" aria-label="Katalog" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white p-1 shadow-lg">
                        {options.map((c) => (
                          <li key={c.id}>
                            <button type="button" role="option" aria-selected={false}
                              onClick={() => { patch(it.key, { pending: { name: c.name, price: senToDecimal(c.price_sen) } }); setOpenKey(null); }}
                              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                              <span className="flex items-center gap-2 font-medium"><BookOpen className="size-3.5 text-muted-foreground" />{c.name}</span>
                              <span className="text-xs tabular-nums text-muted-foreground">{formatRM(c.price_sen)}</span>
                            </button>
                          </li>
                        ))}
                        {!options.length && <li className="px-3 py-2 text-xs text-muted-foreground">Tiada dalam katalog.</li>}
                        <li>
                          <button type="button" role="option" aria-selected={false} onClick={() => setOpenKey(null)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-muted">
                            <PencilLine className="size-4" /> Lain-lain: taip sendiri{it.description.trim() ? ` "${it.description.trim()}"` : ""}
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>
                  {it.pending && (
                <div ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3" role="group" aria-label="Sahkan harga">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-sm font-semibold">{it.pending.name}</p>
                    <p className="text-xs text-muted-foreground">Sahkan harga untuk dokumen ini. Harga dalam katalog tidak berubah.</p>
                  </div>
                  <div className="w-32 space-y-1">
                    <Label htmlFor={`cp-${it.key}`}>Harga (RM)</Label>
                    <Input id={`cp-${it.key}`} inputMode="decimal" value={it.pending.price} autoFocus
                      onChange={(e) => patch(it.key, { pending: { ...it.pending!, price: e.target.value } })}
                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
                  </div>
                  <Button type="button" size="sm" disabled={pendingSen === null}
                    onClick={() => patch(it.key, { description: it.pending!.name, unit_price: it.pending!.price, fromCatalog: true, saveToCatalog: false, pending: null })}>
                    <Check /> Sahkan harga
                  </Button>
                  <Button type="button" size="sm" variant="ghost" aria-label="Batal pilihan katalog" onClick={() => patch(it.key, { pending: null })}><X /></Button>
                </div>
              )}
                </FormField>
                <FormField label="Unit" htmlFor={`q-${it.key}`} name={`items.${i}.quantity`}>
                  <Input id={`q-${it.key}`} name={`items.${i}.quantity`} inputMode="decimal" value={it.quantity} onChange={(e) => patch(it.key, { quantity: e.target.value })} />
                </FormField>
                <FormField label="Harga (RM)" htmlFor={`p-${it.key}`} name={`items.${i}.unit_price`}>
                  <Input id={`p-${it.key}`} name={`items.${i}.unit_price`} inputMode="decimal" value={it.unit_price} onChange={(e) => patch(it.key, { unit_price: e.target.value })} placeholder="0.00" />
                </FormField>
                <FormField label="Diskaun (RM)" htmlFor={`x-${it.key}`} name={`items.${i}.discount`}>
                  <Input id={`x-${it.key}`} name={`items.${i}.discount`} inputMode="decimal" value={it.discount} onChange={(e) => patch(it.key, { discount: e.target.value })} placeholder="0.00" />
                </FormField>
                <div className="text-right text-sm font-semibold tabular-nums sm:pb-2.5">{formatRM(gross - lines[i].discount_sen)}</div>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-danger" aria-label={`Buang item ${i + 1}`}
                  disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}><Trash2 /></Button>
              </div>

              {!it.pending && !it.fromCatalog && it.description.trim() && !inCatalog(it.description) && (
                <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" name={`items.${i}.save_catalog`} checked={it.saveToCatalog}
                    onChange={(e) => patch(it.key, { saveToCatalog: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                  Simpan ke katalog untuk kegunaan akan datang
                </label>
              )}
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
