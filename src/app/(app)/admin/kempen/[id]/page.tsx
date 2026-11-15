import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { CampaignForm } from "@/features/qurban/campaign-form";
import { CampaignStatusButtons, CattleNotesForm, SlotToggle } from "@/features/qurban/admin-forms";
import { addCattleAction } from "@/features/qurban/actions";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CAMPAIGN_STATUS, SLOT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Campaign } from "@/types/db";

export const metadata = { title: "Butiran Kempen" };

const slotColor: Record<string, string> = {
  available: "bg-white border-dashed",
  reserved: "bg-warning-soft border-warning/30 text-warning",
  confirmed: "bg-primary text-primary-foreground border-primary",
  cancelled: "bg-danger-soft border-danger/30 text-danger line-through",
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign) notFound();
  const c = campaign as Campaign;
  const [{ data: cattle }, { count: salesCount }, { data: progress }] = await Promise.all([
    supabase.from("cattle").select("id, code, seq, notes, cattle_slots(id, slot_no, status, sale_id, qurban_sales!cattle_slots_sale_id_fkey(sale_no, profiles!qurban_sales_member_id_fkey(full_name)))").eq("campaign_id", id).order("seq"),
    supabase.from("qurban_sales").select("id", { count: "exact", head: true }).eq("campaign_id", id),
    supabase.from("v_campaign_progress").select("*").eq("campaign_id", id).maybeSingle(),
  ]);

  return (
    <>
      <Link href="/admin/kempen" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Kempen</Link>
      <PageHeader title={c.name} description={<StatusBadge map={CAMPAIGN_STATUS} value={c.status} />}
        actions={<><CampaignStatusButtons id={c.id} status={c.status} /><Button asChild variant="outline"><Link href={`/api/eksport/peruntukan-lembu?kempen=${c.id}`}>Eksport peruntukan</Link></Button></>} />

      <div className="mb-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
        {[["Lembu", progress?.cattle_count], ["Jumlah slot", progress?.total_slots], ["Disahkan", progress?.confirmed_slots], ["Ditempah", progress?.reserved_slots], ["Tersedia", progress?.available_slots]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border bg-white p-3"><p className="text-xl font-bold">{(v as number) ?? 0}</p><p className="text-xs text-muted-foreground">{l}</p></div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Lembu & slot</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(SLOT_STATUS).map(([k, v]) => <span key={k} className={cn("rounded border px-2 py-0.5", slotColor[k])}>{v.label}</span>)}
            </div>
          </div>
          {(cattle ?? []).map((k) => {
            const slots = [...(k.cattle_slots ?? [])].sort((a, b) => a.slot_no - b.slot_no);
            return (
              <Card key={k.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono font-semibold">{k.code}</p>
                    <CattleNotesForm cattleId={k.id} notes={k.notes} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {slots.map((s) => {
                      const sale = s.qurban_sales as unknown as { sale_no: string; profiles: { full_name: string } | null } | null;
                      return (
                        <div key={s.id} className={cn("flex min-h-20 flex-col justify-between rounded-lg border p-2 text-[11px]", slotColor[s.status])}>
                          <span className="font-bold">#{s.slot_no}</span>
                          {sale ? (
                            <Link href={`/admin/jualan/${s.sale_id}`} className="truncate underline" title={sale.profiles?.full_name}>{sale.sale_no}</Link>
                          ) : (s.status === "available" || s.status === "cancelled") && c.status !== "completed" ? (
                            <SlotToggle slotId={s.id} cancelled={s.status === "cancelled"} />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!cattle?.length && <p className="text-sm text-muted-foreground">Belum ada lembu didaftarkan.</p>}
        </div>

        <div className="space-y-6">
          {(c.status === "draft" || c.status === "open") && (
            <Card>
              <CardHeader><CardTitle>Tambah lembu</CardTitle><CardDescription>Setiap lembu menerima ID unik (cth. KITA-{c.year}-001) dan 7 slot.</CardDescription></CardHeader>
              <CardContent>
                <ActionForm action={addCattleAction} className="space-y-3" resetOnSuccess>
                  <input type="hidden" name="campaign_id" value={c.id} />
                  <FormField label="Bilangan lembu" htmlFor="count" required><Input id="count" name="count" type="number" min={1} max={200} defaultValue={1} /></FormField>
                  <FormField label="Catatan (pilihan)" htmlFor="notes"><Input id="notes" name="notes" /></FormField>
                  <SubmitButton className="w-full">Tambah</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Tetapan kempen</CardTitle></CardHeader>
            <CardContent><CampaignForm campaign={c} locked={(salesCount ?? 0) > 0} /></CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
