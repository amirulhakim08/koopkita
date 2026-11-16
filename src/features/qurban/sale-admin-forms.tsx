"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { approveSaleAction, cancelSaleAction, reassignSlotAction, rejectSaleAction, reviewSalePaymentAction } from "@/features/qurban/actions";

export function PaymentReviewForm({ paymentId }: { paymentId: string }) {
  return (
    <ActionForm action={reviewSalePaymentAction} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <input type="hidden" name="payment_id" value={paymentId} />
      <Input name="notes" placeholder="Catatan / sebab" className="h-8 text-xs sm:w-48" aria-label="Catatan" />
      <SubmitButton size="sm" name="decision" value="verify">Sahkan</SubmitButton>
      <SubmitButton size="sm" variant="outline" className="text-danger" name="decision" value="reject">Tolak</SubmitButton>
    </ActionForm>
  );
}

export function ApproveSaleForm({ saleId, disabled }: { saleId: string; disabled?: boolean }) {
  return (
    <ActionForm action={approveSaleAction} className="space-y-3">
      <input type="hidden" name="sale_id" value={saleId} />
      <FormField label="Catatan (pilihan)" htmlFor="approve_notes" name="notes"><Input id="approve_notes" name="notes" /></FormField>
      <SubmitButton className="w-full" disabled={disabled}>Luluskan jualan</SubmitButton>
    </ActionForm>
  );
}

export function RejectSaleForm({ saleId }: { saleId: string }) {
  return (
    <ActionForm action={rejectSaleAction} className="space-y-3">
      <input type="hidden" name="sale_id" value={saleId} />
      <FormField label="Sebab penolakan" htmlFor="reject_notes" name="notes" required><Textarea id="reject_notes" name="notes" rows={2} /></FormField>
      <SubmitButton variant="destructive" className="w-full">Tolak jualan</SubmitButton>
    </ActionForm>
  );
}

export function CancelSaleForm({ saleId, approved }: { saleId: string; approved: boolean }) {
  return (
    <ActionForm action={cancelSaleAction} className="space-y-3">
      <input type="hidden" name="sale_id" value={saleId} />
      {approved && <p className="text-xs text-danger">Komisen jualan ini (dan insentif seekor penuh berkaitan) akan dibalikkan secara automatik dengan entri pembalikan.</p>}
      <FormField label="Sebab pembatalan" htmlFor="cancel_reason" name="reason" required><Textarea id="cancel_reason" name="reason" rows={2} /></FormField>
      <SubmitButton variant="destructive" className="w-full">Batal jualan</SubmitButton>
    </ActionForm>
  );
}

export function ReassignSlotForm({ participantId, options }: { participantId: string; options: { id: string; label: string }[] }) {
  if (!options.length) return null;
  return (
    <ActionForm action={reassignSlotAction} showInlineError={false} className="flex gap-1">
      <input type="hidden" name="participant_id" value={participantId} />
      <Select name="target_slot_id" defaultValue="" className="h-8 text-xs" aria-label="Slot sasaran">
        <option value="" disabled>Pindah ke…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </Select>
      <SubmitButton size="sm" variant="outline" pendingText="…">Pindah</SubmitButton>
    </ActionForm>
  );
}
