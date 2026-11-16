import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { loadSale, ParticipantsTable, PaymentsList, SaleOverview } from "@/features/qurban/sale-details";
import { ApproveSaleForm, CancelSaleForm, PaymentReviewForm, ReassignSlotForm, RejectSaleForm } from "@/features/qurban/sale-admin-forms";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM } from "@/lib/format";
import { COMMISSION_TYPE } from "@/lib/labels";

export const metadata = { title: "Semak Jualan" };

export default async function AdminSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireAdmin();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const bundle = await loadSale(id);
  if (!bundle) notFound();
  const { sale } = bundle;
  const open = sale.status === "pending_payment" || sale.status === "pending_review";
  const own = sale.member_id === userId;
  const pendingPayments = bundle.payments.filter((p) => p.status === "pending").length;
  const fullyPaid = bundle.verifiedSen >= Number(sale.total_sen);

  let slotOptions: { id: string; label: string }[] = [];
  if (open) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("cattle_slots")
      .select("id, slot_no, cattle!inner(code, campaign_id, seq)")
      .eq("status", "available")
      .eq("cattle.campaign_id", sale.campaign_id)
      .limit(300);
    slotOptions = (data ?? [])
      .map((s) => ({ id: s.id, label: `${(s.cattle as unknown as { code: string }).code} · slot ${s.slot_no}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <>
      <Link href="/admin/jualan" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Jualan korban</Link>
      <PageHeader title="Semak jualan" />
      {own && <Alert tone="warning" className="mb-6">Ini jualan anda sendiri. Pengasingan tugas: jualan ini mesti disemak oleh Super Admin lain.</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SaleOverview bundle={bundle} showMember />
          <Card>
            <CardHeader><CardTitle>Bukti bayaran pelanggan</CardTitle><CardDescription>Padankan jumlah, tarikh dan rujukan dengan penyata bank koperasi.</CardDescription></CardHeader>
            <CardContent>
              <PaymentsList bundle={bundle} renderActions={(p) => (p.status === "pending" && !own ? <PaymentReviewForm paymentId={p.id} /> : null)} />
            </CardContent>
          </Card>
          <div className="space-y-3">
            <h2 className="font-semibold">Peserta & slot</h2>
            <ParticipantsTable bundle={bundle} />
            {open && !own && slotOptions.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Ubah peruntukan slot (override)</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {bundle.participants.filter((p) => p.cattle_slots).map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{p.position}. {p.participant_name} — <span className="font-mono text-xs">{p.cattle_slots!.cattle.code}/{p.cattle_slots!.slot_no}</span></span>
                      <ReassignSlotForm participantId={p.id} options={slotOptions} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
          {bundle.commission.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Entri komisen</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {bundle.commission.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="flex items-center gap-2"><StatusBadge map={COMMISSION_TYPE} value={e.entry_type} /> <span className="text-xs text-muted-foreground">{formatDate(e.created_at)}</span></span>
                      <span className="flex-1 text-xs">{e.description}</span>
                      <strong className={Number(e.amount_sen) < 0 ? "text-danger" : "text-success"}>{formatRM(e.amount_sen)}</strong>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {open && !own && (
            <Card>
              <CardHeader><CardTitle>Keputusan</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {pendingPayments > 0 && <Alert tone="warning">Sahkan atau tolak {pendingPayments} bukti bayaran dahulu.</Alert>}
                {!fullyPaid && pendingPayments === 0 && (
                  <Alert tone="info">Bayaran belum penuh: {formatRM(bundle.verifiedSen)} daripada {formatRM(sale.total_sen)} disahkan. Komisen tidak dijana sehingga dibayar penuh.</Alert>
                )}
                <ApproveSaleForm saleId={sale.id} disabled={!fullyPaid || pendingPayments > 0} />
                <div className="border-t pt-4"><RejectSaleForm saleId={sale.id} /></div>
              </CardContent>
            </Card>
          )}
          {(open || sale.status === "approved") && !own && (
            <Card>
              <CardHeader><CardTitle>Batal jualan</CardTitle><CardDescription>Slot akan dilepaskan. Bayaran yang telah diterima perlu dipulangkan di luar sistem.</CardDescription></CardHeader>
              <CardContent><CancelSaleForm saleId={sale.id} approved={sale.status === "approved"} /></CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
