"use client";
import * as React from "react";
import { BookOpen, Check, PencilLine, Plus, Trash2, X } from "lucide-react";
import { FieldError } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRM, parseRMToSen, senToDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { invoiceTotals } from "./totals";

export type CatalogOption = { id: string; name: string; price_sen: number };
export type LineItem = {
  key: string; description: string; quantity: string; unit_price: string; discount: string;
  fromCatalog: boolean; saveToCatalog: boolean;
};
export type SavedLine = { description: string; quantity: number; unit_price_sen: number; discount_sen: number };

const newItem = (): LineItem => ({
  key: crypto.randomUUID(), description: "", quantity: "1", unit_price: "", discount: "", fromCatalog: false, saveToCatalog: false,
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

type BatchEntry = { id: string; name: string; price: string };

/** Editable list of items; field names items.N.* are read by the server actions. */
export function LineItemsCard({ state, catalog = [] }: { state: ReturnType<typeof useLineItems>; catalog?: CatalogOption[] }) {
  const { items, setItems, lines } = state;
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  // catalogue items picked for a row, waiting for the member to confirm their prices
  const [batch, setBatch] = React.useState<{ key: string; entries: BatchEntry[] } | null>(null);
  const patch = (key: string, p: Partial<LineItem>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const inCatalog = (name: string) => catalog.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const close = () => { setOpenKey(null); setSelected([]); };
  const toggle = (id: string) => setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  function choose(key: string) {
    const entries = selected.map((id) => catalog.find((c) => c.id === id)!).filter(Boolean)
      .map((c) => ({ id: c.id, name: c.name, price: senToDecimal(c.price_sen) }));
    if (entries.length) setBatch({ key, entries });
    close();
  }

  /** First item goes into the row that was tapped, the rest into the next empty rows (added when needed). */
  function confirmBatch() {
    if (!batch) return;
    setItems((xs) => {
      const out = [...xs];
      let idx = out.findIndex((x) => x.key === batch.key);
      batch.entries.forEach((e, n) => {
        if (n > 0) {
          let j = out.findIndex((x, k) => k > idx && !x.description.trim() && !x.unit_price.trim());
          if (j === -1) { out.splice(idx + 1, 0, newItem()); j = idx + 1; }
          idx = j;
        }
        out[idx] = { ...out[idx], description: e.name, unit_price: e.price, fromCatalog: true, saveToCatalog: false };
      });
      return out.slice(0, 100);
    });
    setBatch(null);
  }
  const batchValid = batch?.entries.every((e) => parseRMToSen(e.price || "") !== null) ?? false;

  return (
    <Card>
      <input type="hidden" name="item_count" value={items.length} />
      <CardHeader className="flex-row items-center justify-between"><CardTitle>Item</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <FieldError name="items" />
        {items.map((it, i) => {
          const gross = Math.round(lines[i].quantity * lines[i].unit_price_sen);
          const options = catalog.length ? matchCatalog(catalog, it.fromCatalog ? "" : it.description, 100) : [];
          const showList = openKey === it.key && catalog.length > 0 && !batch;
          return (
            <div key={it.key} className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_5rem_7rem_6rem_6rem_2rem] sm:items-end">
                <FormField label={`Perkara ${i + 1}`} htmlFor={`d-${it.key}`} name={`items.${i}.description`}>
                  <div className="relative">
                    <Input id={`d-${it.key}`} name={`items.${i}.description`} value={it.description} autoComplete="off"
                      placeholder={catalog.length ? "Pilih daripada katalog atau taip sendiri" : "cth. Baja organik 25kg"}
                      onChange={(e) => { patch(it.key, { description: e.target.value, fromCatalog: false }); setOpenKey(it.key); }}
                      onFocus={() => { if (openKey !== it.key) { setSelected([]); setOpenKey(it.key); } }}
                      onBlur={() => setTimeout(() => setOpenKey((k) => (k === it.key ? null : k)), 200)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); if (e.key === "Escape") close(); }} />
                    {showList && (
                      <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-white shadow-lg"
                        onMouseDown={(e) => e.preventDefault()}>
                        <button type="button" onClick={close}
                          className="flex w-full items-center gap-2 border-b px-4 py-3 text-left text-sm font-semibold text-primary hover:bg-muted">
                          <PencilLine className="size-4" /> Lain-lain: taip sendiri
                        </button>
                        <p className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Atau pilih daripada katalog: tanda satu atau lebih item, kemudian tekan <strong>Pilih</strong>.</p>
                        <ul role="listbox" aria-label="Katalog" aria-multiselectable className="max-h-64 overflow-auto p-1">
                          {options.map((c) => {
                            const on = selected.includes(c.id);
                            return (
                              <li key={c.id}>
                                <button type="button" role="option" aria-selected={on} onClick={() => toggle(c.id)}
                                  className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted", on && "bg-primary/5")}>
                                  <span className="flex items-center gap-2.5 font-medium">
                                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-white")}>
                                      {on && <Check className="size-3.5" />}
                                    </span>
                                    {c.name}
                                  </span>
                                  <span className="text-xs tabular-nums text-muted-foreground">{formatRM(c.price_sen)}</span>
                                </button>
                              </li>
                            );
                          })}
                          {!options.length && <li className="px-3 py-2 text-xs text-muted-foreground">Tiada dalam katalog.</li>}
                        </ul>
                        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 p-2">
                          <p className="min-w-0 flex-1 px-1 text-xs text-muted-foreground" aria-live="polite" data-testid="catalog-chosen">
                            {selected.length ? <>Ditanda: <strong className="text-foreground">{selected.map((id) => catalog.find((c) => c.id === id)?.name).filter(Boolean).join(", ")}</strong></> : "Belum ada item ditanda."}
                          </p>
                          <Button type="button" size="sm" className="shrink-0" disabled={!selected.length} onClick={() => choose(it.key)}>
                            <BookOpen /> Pilih{selected.length ? ` (${selected.length})` : ""}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  {batch?.key === it.key && (
                    <div ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })} role="group" aria-label="Sahkan harga"
                      className="mt-2 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="text-xs text-muted-foreground">Sahkan harga untuk dokumen ini. Harga dalam katalog tidak berubah.</p>
                      {batch.entries.map((e, n) => (
                        <div key={e.id} className="flex items-center justify-between gap-3">
                          <Label htmlFor={`cp-${e.id}`} className="min-w-0 flex-1 text-sm font-semibold">{e.name}</Label>
                          <div className="flex w-32 items-center gap-1">
                            <span className="text-xs text-muted-foreground">RM</span>
                            <Input id={`cp-${e.id}`} inputMode="decimal" value={e.price} aria-label={`Harga ${e.name}`} autoFocus={n === 0}
                              onChange={(ev) => setBatch((b) => b && { ...b, entries: b.entries.map((x) => (x.id === e.id ? { ...x, price: ev.target.value } : x)) })}
                              onKeyDown={(ev) => { if (ev.key === "Enter") ev.preventDefault(); }} />
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <Button type="button" size="sm" disabled={!batchValid} onClick={confirmBatch}><Check /> Sahkan harga</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setBatch(null)}><X /> Batal</Button>
                      </div>
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

              {batch?.key !== it.key && !it.fromCatalog && it.description.trim() && !inCatalog(it.description) && (
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
