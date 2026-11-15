import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { saveCampaignAction } from "@/features/qurban/actions";
import { senToDecimal } from "@/lib/format";
import type { Campaign } from "@/types/db";

export function CampaignForm({ campaign, defaultExpiryHours = 48, locked = false }: { campaign?: Campaign; defaultExpiryHours?: number; locked?: boolean }) {
  const year = new Date().getFullYear() + 1;
  return (
    <ActionForm action={saveCampaignAction} className="space-y-4">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <FormField label="Nama kempen" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={campaign?.name ?? `Korban Aidiladha ${year}`} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Tahun" htmlFor="year" required><Input id="year" name="year" type="number" defaultValue={campaign?.year ?? year} readOnly={locked} /></FormField>
        <FormField label="Tarikh mula" htmlFor="start_date" required><Input id="start_date" name="start_date" type="date" defaultValue={campaign?.start_date} /></FormField>
        <FormField label="Tarikh tutup" htmlFor="closing_date" required><Input id="closing_date" name="closing_date" type="date" defaultValue={campaign?.closing_date} /></FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Harga sebahagian (RM)" htmlFor="price_per_share" required>
          <Input id="price_per_share" name="price_per_share" inputMode="decimal" defaultValue={senToDecimal(campaign?.price_per_share_sen ?? 85000)} readOnly={locked} />
        </FormField>
        <FormField label="Tempoh tempahan tanpa bayaran (jam)" htmlFor="reservation_expiry_hours" required>
          <Input id="reservation_expiry_hours" name="reservation_expiry_hours" type="number" min={1} max={720} defaultValue={campaign?.reservation_expiry_hours ?? defaultExpiryHours} />
        </FormField>
        <FormField label="Komisen sebahagian (RM)" htmlFor="commission_per_share" required>
          <Input id="commission_per_share" name="commission_per_share" inputMode="decimal" defaultValue={senToDecimal(campaign?.commission_per_share_sen ?? 4000)} readOnly={locked} />
        </FormField>
        <FormField label="Komisen seekor penuh — 7 bahagian (RM)" htmlFor="full_cattle_commission" hint="Menggantikan 7 × komisen sebahagian, bukan tambahan." required>
          <Input id="full_cattle_commission" name="full_cattle_commission" inputMode="decimal" defaultValue={senToDecimal(campaign?.full_cattle_commission_sen ?? 30000)} readOnly={locked} />
        </FormField>
      </div>
      <FormField label="Keterangan" htmlFor="description"><Textarea id="description" name="description" rows={2} defaultValue={campaign?.description ?? ""} /></FormField>
      {locked && <p className="text-xs text-muted-foreground">Harga, kadar komisen dan tahun dikunci kerana jualan telah direkodkan.</p>}
      <SubmitButton>{campaign ? "Simpan perubahan" : "Cipta kempen"}</SubmitButton>
    </ActionForm>
  );
}
