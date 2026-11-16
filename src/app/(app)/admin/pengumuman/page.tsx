import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { sendAnnouncementAction } from "@/features/notifications/actions";

export const metadata = { title: "Pengumuman" };

export default async function AnnouncementPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Pengumuman" description="Hantar notifikasi dalam aplikasi kepada semua ahli aktif." />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Pengumuman baharu</CardTitle><CardDescription>Contoh: pembukaan kempen korban, tarikh penyembelihan, mesyuarat agung.</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={sendAnnouncementAction} className="space-y-4" resetOnSuccess>
            <FormField label="Tajuk" htmlFor="title" required><Input id="title" name="title" maxLength={150} /></FormField>
            <FormField label="Mesej" htmlFor="body" required><Textarea id="body" name="body" rows={5} maxLength={2000} /></FormField>
            <FormField label="Pautan dalaman (pilihan)" htmlFor="link" hint="cth. /ahli/korban"><Input id="link" name="link" /></FormField>
            <SubmitButton>Hantar kepada semua ahli</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
