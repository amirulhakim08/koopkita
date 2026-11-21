import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { BankSelect } from "@/components/bank-select";
import { Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { requireActiveMember } from "@/lib/auth";
import { updateOwnProfileAction } from "@/features/members/actions";
import { formatDate, maskIc } from "@/lib/format";
import { MALAYSIAN_STATES, MEMBER_STATUS } from "@/lib/labels";

export const metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { profile: p } = await requireActiveMember();
  return (
    <>
      <PageHeader title="Profil saya" description="Kemas kini maklumat hubungan dan akaun bank untuk bayaran dividen." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Keahlian</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-muted-foreground">No. Ahli</dt><dd className="text-lg font-bold text-primary">{p.membership_id}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd><StatusBadge map={MEMBER_STATUS} value={p.status} /></dd></div>
              <div><dt className="text-muted-foreground">E-mel</dt><dd>{p.email}</dd></div>
              <div><dt className="text-muted-foreground">No. Kad Pengenalan</dt><dd>{maskIc(p.ic_number)}</dd></div>
              <div><dt className="text-muted-foreground">Tarikh diluluskan</dt><dd>{formatDate(p.approved_at)}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">Untuk menukar No. Kad Pengenalan atau e-mel, sila hubungi pejabat koperasi.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Maklumat peribadi</CardTitle>
            <CardDescription>Maklumat ini hanya boleh dilihat oleh anda dan Super Admin. Akaun bank yang lengkap dan sah diperlukan untuk memohon pengeluaran dividen.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateOwnProfileAction} className="space-y-4">
              <FormField label="Nama penuh" htmlFor="full_name" required><Input id="full_name" name="full_name" defaultValue={p.full_name} /></FormField>
              <FormField label="No. telefon" htmlFor="phone" required><Input id="phone" name="phone" type="tel" defaultValue={p.phone ?? ""} /></FormField>
              <FormField label="Alamat" htmlFor="address" required><Textarea id="address" name="address" rows={2} defaultValue={p.address ?? ""} /></FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Negeri" htmlFor="state" required>
                  <Select id="state" name="state" defaultValue={p.state ?? "Kedah"}>{MALAYSIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
                </FormField>
                <FormField label="Poskod" htmlFor="postcode" required><Input id="postcode" name="postcode" inputMode="numeric" defaultValue={p.postcode ?? ""} /></FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Nama bank" htmlFor="bank_name"><BankSelect defaultValue={p.bank_name} /></FormField>
                <FormField label="No. akaun" htmlFor="bank_account_no"><Input id="bank_account_no" name="bank_account_no" inputMode="numeric" defaultValue={p.bank_account_no ?? ""} /></FormField>
                <FormField label="Nama pemegang akaun" htmlFor="bank_account_holder"><Input id="bank_account_holder" name="bank_account_holder" defaultValue={p.bank_account_holder ?? ""} /></FormField>
              </div>
              <SubmitButton>Simpan perubahan</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
