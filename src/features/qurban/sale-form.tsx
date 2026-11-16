"use client";
import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { ActionForm, FieldError, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSaleAction } from "@/features/qurban/actions";
import { estimateCommission } from "@/features/commission/calculator";
import { formatRM } from "@/lib/format";
import { QURBAN_TYPE } from "@/lib/labels";

type CampaignOption = {
  id: string; name: string; price_per_share_sen: number; commission_per_share_sen: number;
  full_cattle_commission_sen: number; available: number; reservation_expiry_hours: number;
};

export function SaleForm({ campaigns, defaultCampaignId }: { campaigns: CampaignOption[]; defaultCampaignId?: string }) {
  const [campaignId, setCampaignId] = React.useState(defaultCampaignId && campaigns.some((c) => c.id === defaultCampaignId) ? defaultCampaignId : campaigns[0]?.id);
  const [count, setCount] = React.useState(1);
  const campaign = campaigns.find((c) => c.id === campaignId);
  const max = Math.min(campaign?.available ?? 0, 70);
  const total = (campaign?.price_per_share_sen ?? 0) * count;
  const commission = campaign
    ? estimateCommission(count, { commissionPerShareSen: campaign.commission_per_share_sen, fullCattleCommissionSen: campaign.full_cattle_commission_sen, sharesPerCattle: 7 })
    : 0;
  const setClamped = (n: number) => setCount(Math.max(1, Math.min(max || 1, n)));

  return (
    <ActionForm action={createSaleAction} className="grid gap-6 lg:grid-cols-3">
      <IdempotencyKey />
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>1. Kempen & bilangan bahagian</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Kempen" htmlFor="campaign_id" required>
              <Select id="campaign_id" name="campaign_id" value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setCount(1); }}>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.available} slot tersedia</option>)}
              </Select>
            </FormField>
            <FormField label="Bilangan bahagian" htmlFor="share_count" hint={`1 ekor lembu = 7 bahagian. Maksimum ${max} bahagian tersedia.`} required>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => setClamped(count - 1)} aria-label="Kurang"><Minus /></Button>
                <Input id="share_count" name="share_count" type="number" min={1} max={max} value={count}
                  onChange={(e) => setClamped(Number(e.target.value) || 1)} className="w-24 text-center text-lg font-bold" />
                <Button type="button" variant="outline" size="icon" onClick={() => setClamped(count + 1)} aria-label="Tambah"><Plus /></Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setClamped(7)} disabled={max < 7}>Seekor penuh (7)</Button>
              </div>
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>2. Maklumat pembeli</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nama penuh pembeli" htmlFor="buyer_full_name" required className="space-y-1.5 sm:col-span-2"><Input id="buyer_full_name" name="buyer_full_name" /></FormField>
            <FormField label="No. telefon" htmlFor="buyer_phone" required><Input id="buyer_phone" name="buyer_phone" type="tel" /></FormField>
            <FormField label="E-mel (pilihan)" htmlFor="buyer_email"><Input id="buyer_email" name="buyer_email" type="email" /></FormField>
            <FormField label="Alamat (pilihan)" htmlFor="buyer_address" className="space-y-1.5 sm:col-span-2"><Textarea id="buyer_address" name="buyer_address" rows={2} /></FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Peserta korban</CardTitle>
            <CardDescription>Satu nama bagi setiap bahagian.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldError name="participants" />
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[2rem_1fr_10rem_1fr] sm:items-start">
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary">{i + 1}</span>
                <FormField label="Nama peserta" htmlFor={`p-${i}-name`} name={`participants.${i}.participant_name`} required>
                  <Input id={`p-${i}-name`} name={`participants.${i}.participant_name`} />
                </FormField>
                <FormField label="Jenis" htmlFor={`p-${i}-type`}>
                  <Select id={`p-${i}-type`} name={`participants.${i}.qurban_type`} defaultValue="korban_sunat">
                    {Object.entries(QURBAN_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </FormField>
                <FormField label="Bagi pihak (pilihan)" htmlFor={`p-${i}-behalf`}>
                  <Input id={`p-${i}-behalf`} name={`participants.${i}.on_behalf_of`} placeholder="cth. Allahyarham bapa" />
                </FormField>
              </div>
            ))}
          </CardContent>
        </Card>

        <FormField label="Catatan (pilihan)" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} placeholder="Maklumat tambahan untuk koperasi" /></FormField>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="border-primary/20">
          <CardHeader><CardTitle>Ringkasan</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Harga sebahagian</span><span>{formatRM(campaign?.price_per_share_sen)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bilangan bahagian</span><span>× {count}</span></div>
            <div className="flex justify-between border-t pt-3 text-base font-bold"><span>Jumlah jualan</span><span className="tabular-nums">{formatRM(total)}</span></div>
            <div className="rounded-lg bg-success-soft p-3 text-success">
              <p className="text-xs">Anggaran komisen selepas diluluskan</p>
              <p className="text-lg font-bold">{formatRM(commission)}</p>
              <p className="text-[11px] opacity-80">Insentif seekor penuh hanya jika kesemua 7 bahagian lembu yang sama dijual oleh anda.</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Slot akan ditempah selama {campaign?.reservation_expiry_hours ?? 48} jam. Muat naik bukti bayaran sebelum tamat tempoh.
            </p>
            <SubmitButton className="w-full" size="lg" disabled={!campaign || max < 1}>Tempah slot</SubmitButton>
          </CardContent>
        </Card>
      </div>
    </ActionForm>
  );
}
