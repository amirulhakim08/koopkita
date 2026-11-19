"use client";
import * as React from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRM, parseRMToSen, senToDecimal } from "@/lib/format";
import { invoiceTotals } from "./totals";
import { saveInvoiceAction } from "./actions";
import type { CustomerRow } from "./customer-forms";

type Item = { key: string; description: string; quantity: string; unit_price: string; discount: string };
export type DraftInput = {
  id?: string; customer_id?: string; issue_date: string; due_date: string; notes?: string | null;
  items?: { description: string; quantity: number; unit_price_sen: number; discount_sen: number }[];
};

const newItem = (): Item => ({ key: crypto.randomUUID(), description: "", quantity: "1", unit_price: "", discount: "" });

export function InvoiceEditor({ customers, draft, taxRateBp }: { customers: CustomerRow[]; draft: DraftInput; taxRateBp: number }) {
  const [items, setItems] = React.useState<Item[]>(() =>
    draft.items?.length
      ? draft.items.map((it) => ({
          key: crypto.randomUUID(), description: it.description, quantity: String(Number(it.quantity)),
          unit_price: senToDecimal(it.unit_price_sen), discount: it.discount_sen ? senToDecimal(it.discount_sen) : "",
        }))
      : [newItem()],
  );
  const update = (key: string, field: keyof Item, value: string) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, [field]: value } : x)));

  const lines = items.map((x) => ({
    quantity: Number(x.quantity) || 0, unit_price_sen: parseRMToSen(x.unit_price || "0") ?? 0, discount_sen: parseRMToSen(x.discount || "0") ?? 0,
  }));
  const totals = invoiceTotals(lines, taxRateBp);

  return (
    <ActionForm action={saveInvoiceAction} className="grid gap-6 lg:grid-cols-3">
      {draft.id && <input type="hidden" name="id" value={draft.id} />}
      <input type="hidden" name="item_count" value={items.length} />
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Pelanggan & tarikh</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="Pelanggan" htmlFor="customer_id" required className="space-y-1.5 sm:col-span-3">
              <Select id="customer_id" name="customer_id" defaultValue={draft.customer_id ?? ""}>
                <option value="" disabled>— Pilih pelanggan —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
              </Select>
            </FormField>
            {!customers.length && (
              <p className="text-sm text-muted-foreground sm:col-span-3">
                Belum ada pelanggan. <Link href="/ahli/bisnes?tab=pelanggan" className="font-semibold text-primary underline">Tambah pelanggan</Link> dahulu.
              </p>
            )}
            <FormField label="Tarikh invois" htmlFor="issue_date" required><Input id="issue_date" name="issue_date" type="date" defaultValue={draft.issue_date} /></FormField>
            <FormField label="Tarikh akhir bayaran" htmlFor="due_date" required><Input id="due_date" name="due_date" type="date" defaultValue={draft.due_date} /></FormField>
          </CardContent>
        </Card>

        <Card>
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

        <FormField label="Catatan (pilihan)" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} defaultValue={draft.notes ?? ""} /></FormField>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="border-primary/20">
          <CardHeader><CardTitle>Ringkasan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subjumlah</span><span className="tabular-nums">{formatRM(totals.subtotal)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Diskaun</span><span className="tabular-nums">-{formatRM(totals.discount)}</span></div>}
            {taxRateBp > 0 && <div className="flex justify-between"><span className="text-muted-foreground">SST ({taxRateBp / 100}%)</span><span className="tabular-nums">{formatRM(totals.tax)}</span></div>}
            <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Jumlah</span><span className="tabular-nums">{formatRM(totals.total)}</span></div>
            <p className="text-xs text-muted-foreground">Draf boleh diubah. Selepas <strong>Keluarkan</strong>, invois diberi nombor dan dikunci.</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <SubmitButton variant="outline" name="intent" value="save">Simpan draf</SubmitButton>
              <SubmitButton name="intent" value="issue" disabled={!customers.length}>Keluarkan</SubmitButton>
            </div>
          </CardContent>
        </Card>
      </div>
    </ActionForm>
  );
}
