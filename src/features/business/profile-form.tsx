"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { BankSelect } from "@/components/bank-select";
import { LogoUpload } from "./logo-upload";
import { saveBusinessAction } from "./actions";

export type BusinessRow = {
  id: string; name: string; ssm_no: string | null; phone: string; email: string | null; address: string | null;
  bank_name: string | null; bank_account_no: string | null; bank_account_holder: string | null; logo_path: string | null;
  sst_enabled: boolean; sst_rate_bp: number; sst_reg_no: string | null; default_notes: string | null; default_terms?: string | null;
  ssm_verified_at: string | null; suspended_at: string | null; suspend_reason: string | null;
};

export function BusinessProfileForm({ userId, business }: { userId: string; business: BusinessRow | null }) {
  const [sst, setSst] = React.useState(business?.sst_enabled ?? false);
  return (
    <ActionForm action={saveBusinessAction} className="space-y-5">
      <LogoUpload userId={userId} currentPath={business?.logo_path ?? null} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nama syarikat / bisnes" htmlFor="name" required className="space-y-1.5 sm:col-span-2">
          <Input id="name" name="name" defaultValue={business?.name ?? ""} maxLength={150} />
        </FormField>
        <FormField label="No. SSM (pilihan)" htmlFor="ssm_no" hint="cth. 202403123456 atau 1234567-X">
          <Input id="ssm_no" name="ssm_no" defaultValue={business?.ssm_no ?? ""} />
        </FormField>
        <FormField label="No. telefon" htmlFor="phone" required><Input id="phone" name="phone" type="tel" defaultValue={business?.phone ?? ""} /></FormField>
        <FormField label="E-mel (pilihan)" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={business?.email ?? ""} /></FormField>
        <FormField label="Alamat (pilihan)" htmlFor="address" className="space-y-1.5 sm:col-span-2">
          <Textarea id="address" name="address" rows={2} defaultValue={business?.address ?? ""} />
        </FormField>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-primary">Akaun bank bisnes (dipaparkan pada invois)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Bank" htmlFor="bank_name"><BankSelect defaultValue={business?.bank_name} /></FormField>
          <FormField label="No. akaun" htmlFor="bank_account_no"><Input id="bank_account_no" name="bank_account_no" inputMode="numeric" defaultValue={business?.bank_account_no ?? ""} /></FormField>
          <FormField label="Nama akaun" htmlFor="bank_account_holder"><Input id="bank_account_holder" name="bank_account_holder" defaultValue={business?.bank_account_holder ?? ""} /></FormField>
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="sst_enabled" checked={sst} onChange={(e) => setSst(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          Bisnes berdaftar SST (kenakan cukai pada invois)
        </label>
        {sst && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Kadar SST (%)" htmlFor="sst_rate" required><Input id="sst_rate" name="sst_rate" inputMode="decimal" defaultValue={business?.sst_rate_bp ? business.sst_rate_bp / 100 : 6} /></FormField>
            <FormField label="No. pendaftaran SST" htmlFor="sst_reg_no"><Input id="sst_reg_no" name="sst_reg_no" defaultValue={business?.sst_reg_no ?? ""} /></FormField>
          </div>
        )}
      </fieldset>
      <FormField label="Nota tetap pada invois (pilihan)" htmlFor="default_notes" hint="Dimasukkan secara automatik pada setiap invois baharu dan boleh diubah setiap kali. Cth. Terima kasih atas sokongan anda.">
        <Textarea id="default_notes" name="default_notes" rows={2} defaultValue={business?.default_notes ?? ""} />
      </FormField>
      <FormField label="Terma & syarat tetap pada sebut harga (pilihan)" htmlFor="default_terms" name="default_terms" hint="Dimasukkan secara automatik pada setiap sebut harga baharu. Cth. Deposit 30% sebelum kerja dimulakan. Baki dibayar selepas kerja siap.">
        <Textarea id="default_terms" name="default_terms" rows={3} maxLength={2000} defaultValue={business?.default_terms ?? ""} />
      </FormField>
      <SubmitButton>Simpan profil bisnes</SubmitButton>
    </ActionForm>
  );
}
