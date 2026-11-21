import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { BankSelect } from "@/components/bank-select";
import { Input, Select, Textarea } from "@/components/ui/input";
import { registerAction } from "@/features/auth/actions";
import { MALAYSIAN_STATES } from "@/lib/labels";

export const metadata: Metadata = { title: "Daftar Keahlian" };

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Daftar Keahlian</h1>
        <p className="text-sm text-muted-foreground">
          Permohonan anda akan disemak oleh Super Admin selepas e-mel disahkan.
        </p>
      </div>
      <ActionForm action={registerAction} className="space-y-5">
        <fieldset className="space-y-4">
          <legend className="mb-2 text-sm font-semibold text-primary">Maklumat peribadi</legend>
          <FormField label="Nama penuh (seperti dalam MyKad)" htmlFor="full_name" required>
            <Input id="full_name" name="full_name" autoComplete="name" required />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="No. Kad Pengenalan" htmlFor="ic_number" hint="12 digit, contoh 900101021234" required>
              <Input id="ic_number" name="ic_number" inputMode="numeric" maxLength={14} required />
            </FormField>
            <FormField label="No. telefon" htmlFor="phone" required>
              <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0123456789" required />
            </FormField>
          </div>
          <FormField label="Alamat" htmlFor="address" required>
            <Textarea id="address" name="address" autoComplete="street-address" rows={2} required />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Negeri" htmlFor="state" required>
              <Select id="state" name="state" defaultValue="Kedah" required>
                {MALAYSIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </FormField>
            <FormField label="Poskod" htmlFor="postcode" required>
              <Input id="postcode" name="postcode" inputMode="numeric" maxLength={5} autoComplete="postal-code" required />
            </FormField>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-2 text-sm font-semibold text-primary">Akaun bank (pilihan — diperlukan untuk menerima dividen projek)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nama bank" htmlFor="bank_name">
              <BankSelect />
            </FormField>
            <FormField label="No. akaun" htmlFor="bank_account_no">
              <Input id="bank_account_no" name="bank_account_no" inputMode="numeric" />
            </FormField>
          </div>
          <FormField label="Nama pemegang akaun" htmlFor="bank_account_holder">
            <Input id="bank_account_holder" name="bank_account_holder" />
          </FormField>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-2 text-sm font-semibold text-primary">Akaun log masuk</legend>
          <FormField label="E-mel" htmlFor="email" required>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Kata laluan" htmlFor="password" hint="Min. 10 aksara, huruf besar, kecil & nombor" required>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </FormField>
            <FormField label="Sahkan kata laluan" htmlFor="confirm_password" required>
              <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required />
            </FormField>
          </div>
        </fieldset>

        <FormField label="" htmlFor="consent" name="consent">
          <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <input type="checkbox" id="consent" name="consent" className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              Saya bersetuju data peribadi saya diproses oleh koperasi bagi tujuan pengurusan keahlian, syer dan
              perniagaan koperasi selaras dengan Akta Perlindungan Data Peribadi 2010.
            </span>
          </label>
        </FormField>

        <SubmitButton className="w-full" size="lg">Hantar Permohonan</SubmitButton>
      </ActionForm>
      <p className="text-center text-sm text-muted-foreground">
        Sudah mempunyai akaun? <Link href="/log-masuk" className="font-semibold text-primary hover:underline">Log masuk</Link>
      </p>
    </div>
  );
}
