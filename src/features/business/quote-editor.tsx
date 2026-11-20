"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { saveQuoteAction } from "./actions";
import { CustomerPicker } from "./customer-picker";
import { LineItemsCard, TotalsRows, useLineItems, type CatalogOption, type SavedLine } from "./line-items";
import type { CustomerLite } from "./customer-match";

export type QuoteDraftInput = {
  id?: string; customer_id?: string; issue_date: string; valid_until: string; scope?: string | null; terms?: string | null;
  items?: SavedLine[];
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Sebut harga: customer, validity, scope of work, items and terms. */
export function QuoteEditor({ customers, catalog, draft, taxRateBp }: {
  customers: CustomerLite[]; catalog: CatalogOption[]; draft: QuoteDraftInput; taxRateBp: number;
}) {
  const lineItems = useLineItems(draft.items, taxRateBp);
  const [issue, setIssue] = React.useState(draft.issue_date);
  const [valid, setValid] = React.useState(draft.valid_until);
  const days = daysBetween(issue, valid);

  return (
    <ActionForm action={saveQuoteAction} className="grid gap-6 lg:grid-cols-3">
      {draft.id && <input type="hidden" name="id" value={draft.id} />}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Pelanggan &amp; tarikh</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><CustomerPicker customers={customers} defaultId={draft.customer_id} /></div>
            <FormField label="Tarikh sebut harga" htmlFor="issue_date" required>
              <Input id="issue_date" name="issue_date" type="date" value={issue} onChange={(e) => { const d = daysBetween(issue, valid); setIssue(e.target.value); if (e.target.value) setValid(addDays(e.target.value, Math.max(d, 0))); }} />
            </FormField>
            <FormField label="Sah sehingga" htmlFor="valid_until" required>
              <Input id="valid_until" name="valid_until" type="date" value={valid} min={issue} onChange={(e) => setValid(e.target.value)} />
            </FormField>
            <div className="flex flex-wrap gap-2 sm:col-span-2" role="group" aria-label="Tempoh sah">
              {[14, 30, 60].map((n) => (
                <button key={n} type="button" onClick={() => setValid(addDays(issue, n))}
                  className={cn("rounded-full border px-3 py-1 text-sm", days === n ? "border-primary bg-primary text-primary-foreground" : "bg-white hover:bg-muted")}>
                  {n} hari
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Skop kerja</CardTitle></CardHeader>
          <CardContent>
            <FormField label="Terangkan kerja yang akan dibuat (pilihan)" htmlFor="scope" name="scope">
              <Textarea id="scope" name="scope" rows={3} maxLength={2000} defaultValue={draft.scope ?? ""}
                placeholder="cth. Mengecat semula 6 bilik darjah dan koridor Blok B, termasuk membaiki dinding retak." />
            </FormField>
          </CardContent>
        </Card>

        <LineItemsCard state={lineItems} catalog={catalog} />

        <Card>
          <CardHeader><CardTitle>Terma &amp; syarat</CardTitle></CardHeader>
          <CardContent>
            <FormField label="Terma (pilihan)" htmlFor="terms" name="terms" hint="Diisi daripada terma tetap dalam Profil Bisnes. Boleh diubah untuk sebut harga ini.">
              <Textarea id="terms" name="terms" rows={3} maxLength={2000} defaultValue={draft.terms ?? ""}
                placeholder="cth. Deposit 30% sebelum kerja dimulakan. Baki dibayar selepas kerja siap." />
            </FormField>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="border-primary/20">
          <CardHeader><CardTitle>Ringkasan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <TotalsRows totals={lineItems.totals} taxRateBp={taxRateBp} />
            <p className="text-xs text-muted-foreground">Draf boleh diubah. Selepas <strong>Keluarkan</strong>, sebut harga diberi nombor dan dikunci.</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <SubmitButton variant="outline" name="intent" value="save">Simpan draf</SubmitButton>
              <SubmitButton name="intent" value="send">Keluarkan</SubmitButton>
            </div>
          </CardContent>
        </Card>
      </div>
    </ActionForm>
  );
}
