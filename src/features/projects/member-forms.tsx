"use client";
import * as React from "react";
import { ActionForm, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatRM } from "@/lib/format";
import { cancelWithdrawalAction, requestWithdrawalAction } from "./actions";

/** Full or partial withdrawal of a project's available dividend to the member's own bank account. */
export function WithdrawForm({ projectId, availableSen, bankLabel }: { projectId: string; availableSen: number; bankLabel: string }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState((availableSen / 100).toFixed(2));
  if (!open) {
    return <Button className="w-full" onClick={() => setOpen(true)}>Mohon Pengeluaran</Button>;
  }
  return (
    <ActionForm action={requestWithdrawalAction} className="space-y-3 rounded-lg border bg-muted/30 p-3" onSuccess={() => setOpen(false)}>
      <IdempotencyKey />
      <input type="hidden" name="project_id" value={projectId} />
      <FormField label="Jumlah pengeluaran (RM)" htmlFor={`amount-${projectId}`} name="amount" hint={`Tersedia ${formatRM(availableSen)}`} required>
        <div className="flex gap-2">
          <Input id={`amount-${projectId}`} name="amount" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button type="button" variant="outline" onClick={() => setValue((availableSen / 100).toFixed(2))}>Semua</Button>
        </div>
      </FormField>
      <FormField label="Catatan (pilihan)" htmlFor={`notes-${projectId}`} name="notes">
        <Input id={`notes-${projectId}`} name="notes" maxLength={500} />
      </FormField>
      <p className="text-xs text-muted-foreground">Dipindahkan ke akaun {bankLabel}. Jumlah ini dikunci sehingga permohonan diproses.</p>
      <div className="flex gap-2">
        <SubmitButton className="flex-1">Hantar permohonan</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
      </div>
    </ActionForm>
  );
}

export function CancelWithdrawalButton({ id }: { id: string }) {
  return (
    <ActionForm action={cancelWithdrawalAction} showInlineError={false}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost" className="text-danger" pendingText="…">Batalkan</SubmitButton>
    </ActionForm>
  );
}
