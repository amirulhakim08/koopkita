"use client";
import { ActionForm, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ReceiptUpload } from "@/components/receipt-upload";
import { PAYMENT_METHODS } from "@/lib/labels";
import { senToDecimal, todayKL } from "@/lib/format";
import { cancelInvoiceAction, deleteDraftAction, recordPaymentAction, reversePaymentAction, setShareAction } from "./actions";

export function RecordPaymentForm({ invoiceId, balanceSen, userId }: { invoiceId: string; balanceSen: number; userId: string }) {
  return (
    <ActionForm action={recordPaymentAction} className="space-y-3" resetOnSuccess>
      <IdempotencyKey />
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <ReceiptUpload userId={userId} bucket="business-proofs" name="proof_path" label="Bukti bayaran (pilihan)" required={false}
        autofill={{ amount: "amount", date: "paid_on", reference: "reference" }} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Jumlah diterima (RM)" htmlFor="amount" required hint={`Baki: RM ${senToDecimal(balanceSen)}`}>
          <Input id="amount" name="amount" inputMode="decimal" defaultValue={senToDecimal(balanceSen)} />
        </FormField>
        <FormField label="Tarikh bayaran" htmlFor="paid_on" required><Input id="paid_on" name="paid_on" type="date" max={todayKL()} defaultValue={todayKL()} /></FormField>
        <FormField label="Kaedah" htmlFor="method" required>
          <Select id="method" name="method" defaultValue="bank_transfer">
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FormField>
        <FormField label="Rujukan (pilihan)" htmlFor="reference"><Input id="reference" name="reference" maxLength={100} /></FormField>
      </div>
      <SubmitButton className="w-full">Rekod bayaran & jana resit</SubmitButton>
    </ActionForm>
  );
}

export function ReversePaymentForm({ paymentId }: { paymentId: string }) {
  return (
    <ActionForm action={reversePaymentAction} showInlineError={false} className="flex gap-1">
      <input type="hidden" name="id" value={paymentId} />
      <Input name="reason" placeholder="Sebab pembalikan" className="h-8 text-xs" aria-label="Sebab pembalikan" />
      <SubmitButton size="sm" variant="outline" className="text-danger" pendingText="…">Balikkan</SubmitButton>
    </ActionForm>
  );
}

export function CancelInvoiceForm({ invoiceId }: { invoiceId: string }) {
  return (
    <ActionForm action={cancelInvoiceAction} className="space-y-2">
      <input type="hidden" name="id" value={invoiceId} />
      <FormField label="Sebab pembatalan" htmlFor="cancel-reason" name="reason" required><Textarea id="cancel-reason" name="reason" rows={2} /></FormField>
      <SubmitButton variant="destructive" size="sm">Batal invois</SubmitButton>
    </ActionForm>
  );
}

export function DeleteDraftForm({ invoiceId }: { invoiceId: string }) {
  return (
    <ActionForm action={deleteDraftAction} showInlineError={false}>
      <input type="hidden" name="id" value={invoiceId} />
      <SubmitButton variant="ghost" size="sm" className="text-danger">Padam draf</SubmitButton>
    </ActionForm>
  );
}

export function ShareLinkControls({ kind, id, enabled }: { kind: "invoice" | "receipt"; id: string; enabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(enabled ? [["disable", "Matikan pautan"], ["regenerate", "Jana pautan baharu"]] : [["enable", "Aktifkan pautan"]]).map(([mode, label]) => (
        <ActionForm key={mode} action={setShareAction} showInlineError={false}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="mode" value={mode} />
          <SubmitButton size="sm" variant="ghost" className="h-7 px-2 text-xs" pendingText="…">{label}</SubmitButton>
        </ActionForm>
      ))}
    </div>
  );
}
