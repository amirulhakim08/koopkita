"use client";
import * as React from "react";
import { ActionForm, FieldError, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { ReceiptUpload } from "@/components/receipt-upload";
import { recordPayoutAction, reversePayoutAction } from "@/features/commission/actions";
import { formatDate, formatRM, senToDecimal, todayKL } from "@/lib/format";

type Entry = { id: string; description: string; created_at: string; unpaid_sen: number };

export function PayoutForm({ memberId, adminId, outstandingSen, entries }: { memberId: string; adminId: string; outstandingSen: number; entries: Entry[] }) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const selectedTotal = entries.filter((e) => selected.includes(e.id)).reduce((a, e) => a + e.unpaid_sen, 0);
  const suggested = selected.length ? Math.min(selectedTotal, outstandingSen) : outstandingSen;
  const [amount, setAmount] = React.useState(senToDecimal(outstandingSen));
  const [lastSuggested, setLastSuggested] = React.useState(suggested);
  if (suggested !== lastSuggested) {
    setLastSuggested(suggested);
    setAmount(senToDecimal(suggested));
  }

  return (
    <ActionForm action={recordPayoutAction} className="space-y-4" onSuccess={() => setSelected([])}>
      <IdempotencyKey />
      <input type="hidden" name="member_id" value={memberId} />
      {entries.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Entri komisen (pilihan — kosongkan untuk peruntukan automatik ikut tarikh)</legend>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {entries.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-xs hover:bg-muted">
                <input type="checkbox" name="entry_ids" value={e.id} className="mt-0.5 accent-[var(--primary)]"
                  checked={selected.includes(e.id)} onChange={(ev) => setSelected((s) => (ev.target.checked ? [...s, e.id] : s.filter((x) => x !== e.id)))} />
                <span className="flex-1">{e.description}<span className="block text-muted-foreground">{formatDate(e.created_at)}</span></span>
                <strong className="tabular-nums">{formatRM(e.unpaid_sen)}</strong>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Jumlah dibayar (RM)" htmlFor="amount" hint={`Tertunggak ${formatRM(outstandingSen)} · bayaran separa dibenarkan`} required>
          <Input id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label="Tarikh pindahan" htmlFor="payment_date" required>
          <Input id="payment_date" name="payment_date" type="date" max={todayKL()} defaultValue={todayKL()} />
        </FormField>
      </div>
      <FormField label="Rujukan transaksi bank" htmlFor="transaction_ref" required><Input id="transaction_ref" name="transaction_ref" /></FormField>
      <ReceiptUpload userId={adminId} bucket="payout-proofs" name="proof_path" label="Bukti pindahan (pilihan)" required={false} />
      <FormField label="Catatan" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} /></FormField>
      <label className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
        <input type="checkbox" name="bank_transfer_confirmed" className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>Saya mengesahkan pindahan bank sebanyak jumlah di atas <strong>telah berjaya dibuat</strong> kepada akaun ahli.</span>
      </label>
      <FieldError name="bank_transfer_confirmed" />
      <SubmitButton className="w-full">Rekod bayaran komisen</SubmitButton>
    </ActionForm>
  );
}

export function ReversePayoutForm({ payoutId }: { payoutId: string }) {
  return (
    <ActionForm action={reversePayoutAction} showInlineError={false} className="flex gap-1">
      <input type="hidden" name="payout_id" value={payoutId} />
      <Input name="reason" placeholder="Sebab pembalikan" className="h-8 text-xs" aria-label="Sebab pembalikan" />
      <SubmitButton size="sm" variant="outline" className="text-danger" pendingText="…">Balikkan</SubmitButton>
    </ActionForm>
  );
}
