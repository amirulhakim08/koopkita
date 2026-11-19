"use client";
import { ActionForm, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceiptUpload } from "@/components/receipt-upload";
import { PAYMENT_METHODS } from "@/lib/labels";
import { todayKL } from "@/lib/format";
import { createDirectReceiptAction } from "./actions";
import { CustomerPicker } from "./customer-picker";
import { LineItemsCard, TotalsRows, useLineItems, type CatalogOption } from "./line-items";
import type { CustomerLite } from "./customer-match";

/** Receipt for a sale paid on the spot: no invoice needed. */
export function DirectReceiptEditor({ customers, catalog, taxRateBp, userId, defaultNotes }: {
  customers: CustomerLite[]; catalog: CatalogOption[]; taxRateBp: number; userId: string; defaultNotes?: string | null;
}) {
  const lineItems = useLineItems(undefined, taxRateBp);
  const today = todayKL();
  return (
    <ActionForm action={createDirectReceiptAction} className="grid gap-6 lg:grid-cols-3">
      <IdempotencyKey />
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Pelanggan & bayaran</CardTitle></CardHeader>
          <CardContent className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2"><CustomerPicker customers={customers} allowWalkIn /></div>
            <FormField label="Tarikh jualan" htmlFor="paid_on" required><Input id="paid_on" name="paid_on" type="date" max={today} defaultValue={today} /></FormField>
            <FormField label="Kaedah bayaran" htmlFor="method" required>
              <Select id="method" name="method" defaultValue="cash">
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </FormField>
            <FormField label="Rujukan (pilihan)" htmlFor="reference" className="space-y-1.5 sm:col-span-2" hint="cth. nombor transaksi DuitNow">
              <Input id="reference" name="reference" maxLength={100} />
            </FormField>
            <div className="min-w-0 sm:col-span-2">
              <ReceiptUpload userId={userId} bucket="business-proofs" name="proof_path" label="Bukti bayaran (pilihan)" required={false}
                autofill={{ date: "paid_on", reference: "reference" }} />
            </div>
          </CardContent>
        </Card>

        <LineItemsCard state={lineItems} catalog={catalog} />

        <FormField label="Catatan pada resit (pilihan)" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} defaultValue={defaultNotes ?? ""} /></FormField>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="border-primary/20">
          <CardHeader><CardTitle>Ringkasan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <TotalsRows totals={lineItems.totals} taxRateBp={taxRateBp} totalLabel="Jumlah diterima" />
            <p className="text-xs text-muted-foreground">Untuk jualan yang sudah dibayar. Resit diberi nombor dan dikunci selepas dijana.</p>
            <SubmitButton className="w-full">Jana resit</SubmitButton>
          </CardContent>
        </Card>
      </div>
    </ActionForm>
  );
}
