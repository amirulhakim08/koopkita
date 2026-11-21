"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ReceiptUpload } from "@/components/receipt-upload";
import { FileLink } from "@/components/file-link";
import { formatPct } from "@/lib/format";
import { PROJECT_CATEGORY } from "@/lib/labels";
import type { Project } from "@/types/db";
import { saveProjectAction } from "./actions";

const rm = (sen: number | null | undefined) => (sen == null ? "" : (Number(sen) / 100).toFixed(2));
const pct = (bp: number | null | undefined) => (bp == null ? "" : formatPct(bp).replace("%", ""));

/** Create or edit a project. Funding rules are editable only while the project is a draft. */
export function ProjectForm({ project: p, adminId }: { project?: Project; adminId: string }) {
  const locked = !!p && p.status !== "draft";
  return (
    <ActionForm action={saveProjectAction} className="space-y-6">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Card>
        <CardHeader><CardTitle>Maklumat projek</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nama projek" htmlFor="name" required className="space-y-1.5 sm:col-span-2">
            <Input id="name" name="name" defaultValue={p?.name} placeholder="cth. Pelaburan KOPSYA 2027" />
          </FormField>
          <FormField label="Organisasi pelaburan / rakan kongsi" htmlFor="partner" required>
            <Input id="partner" name="partner" defaultValue={p?.partner} placeholder="cth. KOPSYA" />
          </FormField>
          <FormField label="Kategori" htmlFor="category" required>
            <Select id="category" name="category" defaultValue={p?.category ?? "pelaburan"}>
              {Object.entries(PROJECT_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </FormField>
          <FormField label="Penerangan projek" htmlFor="description" className="space-y-1.5 sm:col-span-2">
            <Textarea id="description" name="description" rows={4} defaultValue={p?.description ?? ""} placeholder="Tujuan dana, cara pelaburan dan maklumat penting untuk ahli." />
          </FormField>
          <div className="space-y-1.5 sm:col-span-2">
            <ReceiptUpload userId={adminId} bucket="payout-proofs" name="new_document_path" label="Dokumen sokongan (pilihan, PDF atau gambar)" required={false} />
            {p?.document_path && <p className="text-xs text-muted-foreground">Dokumen semasa: <FileLink bucket="payout-proofs" path={p.document_path} label="Lihat" /> (muat naik fail baharu untuk menggantikan)</p>}
            {p?.document_path && <input type="hidden" name="document_path" value={p.document_path} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pembiayaan</CardTitle>
          <CardDescription>
            Setiap penyertaan mesti gandaan jumlah gandaan. Jumlah seorang ahli mesti sekurang-kurangnya minimum.
            {locked && " Peraturan pembiayaan tidak boleh diubah selepas projek diterbitkan."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Sasaran modal (RM)" htmlFor="target" required>
            <Input id="target" name="target" inputMode="decimal" defaultValue={rm(p?.target_sen)} placeholder="20000.00" readOnly={locked} />
          </FormField>
          <FormField label="Had seorang ahli (RM, pilihan)" htmlFor="max_per_member">
            <Input id="max_per_member" name="max_per_member" inputMode="decimal" defaultValue={rm(p?.max_per_member_sen)} placeholder="5000.00" readOnly={locked} />
          </FormField>
          <FormField label="Minimum penyertaan (RM)" htmlFor="min" required>
            <Input id="min" name="min" inputMode="decimal" defaultValue={rm(p?.min_sen)} placeholder="500.00" readOnly={locked} />
          </FormField>
          <FormField label="Gandaan penyertaan (RM)" htmlFor="step" required hint="cth. RM500: ahli boleh sertai RM500, RM1,000, RM1,500 …">
            <Input id="step" name="step" inputMode="decimal" defaultValue={rm(p?.step_sen)} placeholder="500.00" readOnly={locked} />
          </FormField>
          <FormField label="Tarikh buka (pilihan)" htmlFor="open_date">
            <Input id="open_date" name="open_date" type="date" defaultValue={p?.open_date ?? ""} />
          </FormField>
          <FormField label="Tarikh tutup (pilihan)" htmlFor="close_date">
            <Input id="close_date" name="close_date" type="date" defaultValue={p?.close_date ?? ""} />
          </FormField>
          <FormField label="Tempoh pelaburan (bulan)" htmlFor="duration_months">
            <Input id="duration_months" name="duration_months" inputMode="numeric" defaultValue={p?.duration_months ?? ""} placeholder="12" />
          </FormField>
          <FormField label="Jangkaan tarikh matang (pilihan)" htmlFor="maturity_date">
            <Input id="maturity_date" name="maturity_date" type="date" defaultValue={p?.maturity_date ?? ""} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bahagian koperasi daripada keuntungan</CardTitle>
          <CardDescription>
            Nilai lalai setiap pengumuman: koperasi mengambil bahagian kadar keuntungan yang melebihi ambang, sehingga had (dalam mata peratusan).
            Contoh ambang 6% dan had 1: untung 10% → ahli 9%, koperasi 1%; untung 6.5% → ahli 6%, koperasi 0.5%; untung 5% → ahli 5%.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Ambang (%)" htmlFor="coop_threshold" required>
            <Input id="coop_threshold" name="coop_threshold" inputMode="decimal" defaultValue={pct(p?.coop_threshold_bp ?? 600)} readOnly={locked} />
          </FormField>
          <FormField label="Had bahagian koperasi (mata peratusan)" htmlFor="coop_cap" required>
            <Input id="coop_cap" name="coop_cap" inputMode="decimal" defaultValue={pct(p?.coop_cap_bp ?? 100)} readOnly={locked} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terma dan risiko</CardTitle>
          <CardDescription>Wajib sebelum diterbitkan. Ahli mesti bersetuju sebelum menyertai; versi terma yang dipersetujui direkodkan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Terma dan syarat" htmlFor="terms">
            <Textarea id="terms" name="terms" rows={6} defaultValue={p?.terms ?? ""} />
          </FormField>
          <FormField label="Pendedahan risiko" htmlFor="risk_disclosure">
            <Textarea id="risk_disclosure" name="risk_disclosure" rows={4} defaultValue={p?.risk_disclosure ?? ""}
              placeholder="cth. Pulangan lepas bukan jaminan pulangan masa hadapan. Modal boleh berkurang." />
          </FormField>
          {locked && <Alert tone="info">Mengubah terma akan mencipta versi baharu (versi semasa: {p?.terms_version}). Penyertaan lama kekal dengan versi yang dipersetujui.</Alert>}
        </CardContent>
      </Card>

      <SubmitButton size="lg" className="w-full sm:w-auto">{p ? "Simpan perubahan" : "Simpan sebagai draf"}</SubmitButton>
    </ActionForm>
  );
}
