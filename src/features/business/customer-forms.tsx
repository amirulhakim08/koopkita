"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { deleteCustomerAction, saveCustomerAction } from "./actions";

export type CustomerRow = { id: string; name: string; phone: string | null; email: string | null; address: string | null };

export function CustomerForm({ customer, onDone }: { customer?: CustomerRow; onDone?: () => void }) {
  const p = customer?.id ?? "new";
  return (
    <ActionForm action={saveCustomerAction} className="space-y-3" resetOnSuccess={!customer} onSuccess={onDone}>
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nama pelanggan" htmlFor={`c-name-${p}`} name="name" required><Input id={`c-name-${p}`} name="name" defaultValue={customer?.name ?? ""} /></FormField>
        <FormField label="No. telefon" htmlFor={`c-phone-${p}`} name="phone"><Input id={`c-phone-${p}`} name="phone" type="tel" defaultValue={customer?.phone ?? ""} /></FormField>
        <FormField label="E-mel" htmlFor={`c-email-${p}`} name="email"><Input id={`c-email-${p}`} name="email" type="email" defaultValue={customer?.email ?? ""} /></FormField>
        <FormField label="Alamat" htmlFor={`c-address-${p}`} name="address"><Textarea id={`c-address-${p}`} name="address" rows={1} defaultValue={customer?.address ?? ""} /></FormField>
      </div>
      <SubmitButton size="sm">{customer ? "Simpan" : "Tambah pelanggan"}</SubmitButton>
    </ActionForm>
  );
}

export function DeleteCustomerButton({ id }: { id: string }) {
  return (
    <ActionForm action={deleteCustomerAction} showInlineError={false}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost" className="text-danger" pendingText="…">Padam</SubmitButton>
    </ActionForm>
  );
}
