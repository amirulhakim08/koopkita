"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveInvoiceAction } from "./actions";
import { CustomerPicker } from "./customer-picker";
import { LineItemsCard, TotalsRows, useLineItems, type SavedLine } from "./line-items";
import type { CustomerLite } from "./customer-match";

export type DraftInput = {
  id?: string; customer_id?: string; issue_date: string; due_date: string; notes?: string | null;
  items?: SavedLine[];
};

export function InvoiceEditor({ customers, draft, taxRateBp }: { customers: CustomerLite[]; draft: DraftInput; taxRateBp: number }) {
  const lineItems = useLineItems(draft.items, taxRateBp);

  return (
    <ActionForm action={saveInvoiceAction} className="grid gap-6 lg:grid-cols-3">
      {draft.id && <input type="hidden" name="id" value={draft.id} />}
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Pelanggan & tarikh</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3"><CustomerPicker customers={customers} defaultId={draft.customer_id} /></div>
            <FormField label="Tarikh invois" htmlFor="issue_date" required><Input id="issue_date" name="issue_date" type="date" defaultValue={draft.issue_date} /></FormField>
            <FormField label="Tarikh akhir bayaran" htmlFor="due_date" required><Input id="due_date" name="due_date" type="date" defaultValue={draft.due_date} /></FormField>
          </CardContent>
        </Card>

        <LineItemsCard state={lineItems} />

        <FormField label="Catatan (pilihan)" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} defaultValue={draft.notes ?? ""} /></FormField>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="border-primary/20">
          <CardHeader><CardTitle>Ringkasan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <TotalsRows totals={lineItems.totals} taxRateBp={taxRateBp} />
            <p className="text-xs text-muted-foreground">Draf boleh diubah. Selepas <strong>Keluarkan</strong>, invois diberi nombor dan dikunci.</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <SubmitButton variant="outline" name="intent" value="save">Simpan draf</SubmitButton>
              <SubmitButton name="intent" value="issue">Keluarkan</SubmitButton>
            </div>
          </CardContent>
        </Card>
      </div>
    </ActionForm>
  );
}
