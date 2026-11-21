import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/queries";
import { saveSettingsAction } from "@/features/settings/actions";
import { LogoUpload } from "@/features/business/logo-upload";
import { senToDecimal } from "@/lib/format";

export const metadata = { title: "Tetapan" };

export default async function SettingsPage() {
  const { userId } = await requireAdmin();
  const s = await getSettings();
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
  const num = (k: string) => Number(s[k] ?? 0);
  return (
    <>
      <PageHeader title="Tetapan sistem" description="Semua perubahan direkodkan dalam log audit." />
      <ActionForm action={saveSettingsAction} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Akaun bank rasmi koperasi</CardTitle>
            <CardDescription>Dipaparkan kepada ahli pada skrin arahan pembayaran. Masukkan butiran rasmi sahaja.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!str("coop_bank_account_no") && <Alert tone="info">Belum ditetapkan. Ahli akan diminta mengikut arahan pegawai koperasi untuk pembayaran modal syer dan projek.</Alert>}
            <FormField label="Nama bank" htmlFor="coop_bank_name"><Input id="coop_bank_name" name="coop_bank_name" defaultValue={str("coop_bank_name")} /></FormField>
            <FormField label="Nama pemegang akaun" htmlFor="coop_bank_account_name"><Input id="coop_bank_account_name" name="coop_bank_account_name" defaultValue={str("coop_bank_account_name")} /></FormField>
            <FormField label="Nombor akaun" htmlFor="coop_bank_account_no"><Input id="coop_bank_account_no" name="coop_bank_account_no" inputMode="numeric" defaultValue={str("coop_bank_account_no")} /></FormField>
            <FormField label="Arahan pembayaran tambahan" htmlFor="coop_payment_instructions"><Textarea id="coop_payment_instructions" name="coop_payment_instructions" rows={3} defaultValue={str("coop_payment_instructions")} /></FormField>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Maklumat koperasi</CardTitle><CardDescription>Nama, logo dan maklumat hubungan rasmi koperasi.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <LogoUpload userId={userId} currentPath={str("coop_logo_path") || null} name="coop_logo_path" label="Logo koperasi" />
              <FormField label="Nama koperasi" htmlFor="coop_name"><Input id="coop_name" name="coop_name" defaultValue={str("coop_name")} /></FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="No. pendaftaran koperasi" htmlFor="coop_reg_no"><Input id="coop_reg_no" name="coop_reg_no" defaultValue={str("coop_reg_no")} /></FormField>
                <FormField label="Telefon" htmlFor="coop_phone"><Input id="coop_phone" name="coop_phone" defaultValue={str("coop_phone")} /></FormField>
              </div>
              <FormField label="E-mel" htmlFor="coop_email"><Input id="coop_email" name="coop_email" type="email" defaultValue={str("coop_email")} /></FormField>
              <FormField label="Alamat" htmlFor="coop_address"><Textarea id="coop_address" name="coop_address" rows={2} defaultValue={str("coop_address")} /></FormField>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Had modal syer</CardTitle><CardDescription>Ikut undang-undang kecil koperasi.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <FormField label="Bayaran minimum (RM)" htmlFor="share_min_payment_sen"><Input id="share_min_payment_sen" name="share_min_payment_sen" inputMode="decimal" defaultValue={senToDecimal(num("share_min_payment_sen"))} /></FormField>
              <FormField label="Modal minimum (RM)" htmlFor="share_min_total_sen"><Input id="share_min_total_sen" name="share_min_total_sen" inputMode="decimal" defaultValue={senToDecimal(num("share_min_total_sen"))} /></FormField>
              <FormField label="Modal maksimum (RM)" htmlFor="share_max_total_sen"><Input id="share_max_total_sen" name="share_max_total_sen" inputMode="decimal" defaultValue={senToDecimal(num("share_max_total_sen"))} /></FormField>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Keselamatan</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <input type="checkbox" name="admin_mfa_required" defaultChecked={s.admin_mfa_required !== false} className="mt-0.5 size-4 accent-[var(--primary)]" />
                <span><strong>Wajibkan MFA untuk Super Admin</strong><br /><span className="text-muted-foreground">Sangat disyorkan. Hanya matikan untuk pembangunan tempatan.</span></span>
              </label>
            </CardContent>
          </Card>
          <SubmitButton size="lg" className="w-full">Simpan tetapan</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
