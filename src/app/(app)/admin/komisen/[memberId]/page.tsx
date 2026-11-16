import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { FileLink } from "@/components/file-link";
import { PayoutForm, ReversePayoutForm } from "@/features/commission/payout-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM } from "@/lib/format";
import { COMMISSION_TYPE } from "@/lib/labels";
import type { CommissionEntry, CommissionPayout } from "@/types/db";
import { hasValidBank } from "@/features/commission/payout-request";

export const metadata = { title: "Komisen Ahli" };

export default async function MemberCommissionPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { userId } = await requireAdmin();
  const { memberId } = await params;
  if (!z.string().uuid().safeParse(memberId).success) notFound();
  const supabase = await createClient();
  const [{ data: summary }, { data: profile }, { data: ledger }, { data: payouts }, { data: items }, { data: pendingReq }] = await Promise.all([
    supabase.from("v_commission_summary").select("*").eq("member_id", memberId).maybeSingle(),
    supabase.from("profiles").select("full_name, membership_id, bank_name, bank_account_no, bank_account_holder").eq("id", memberId).maybeSingle(),
    supabase.from("commission_ledger").select("*").eq("member_id", memberId).order("created_at"),
    supabase.from("commission_payouts").select("*").eq("member_id", memberId).order("created_at", { ascending: false }),
    supabase.from("commission_payout_items").select("ledger_entry_id, amount_sen, commission_payouts!inner(member_id)").eq("commission_payouts.member_id", memberId),
    supabase.from("commission_payout_requests").select("*").eq("member_id", memberId).eq("status", "pending").maybeSingle(),
  ]);
  if (!profile || !summary) notFound();
  const entries = (ledger ?? []) as CommissionEntry[];
  const reversed = new Set(entries.filter((e) => e.reverses_id).map((e) => e.reverses_id));
  const paidByEntry = new Map<string, number>();
  for (const i of items ?? []) paidByEntry.set(i.ledger_entry_id, (paidByEntry.get(i.ledger_entry_id) ?? 0) + Number(i.amount_sen));
  const unpaid = entries
    .filter((e) => e.amount_sen > 0 && !reversed.has(e.id))
    .map((e) => ({ id: e.id, description: e.description, created_at: e.created_at, unpaid_sen: Number(e.amount_sen) - (paidByEntry.get(e.id) ?? 0) }))
    .filter((e) => e.unpaid_sen > 0);
  const outstanding = Number(summary.outstanding_sen);
  const reversedPayouts = new Set((payouts ?? []).filter((p) => p.reverses_id).map((p) => p.reverses_id));

  return (
    <>
      <Link href="/admin/komisen" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Komisen</Link>
      <PageHeader title={profile.full_name} description={profile.membership_id ?? ""} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Diperoleh (bersih)" value={formatRM(summary.earned_sen)} />
        <StatCard label="Dibayar" value={formatRM(summary.paid_sen)} />
        <StatCard emphasis label="Tertunggak" value={formatRM(outstanding)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="space-y-3">
            <h2 className="font-semibold">Lejar komisen</h2>
            <Table>
              <THead><TR><TH>Tarikh</TH><TH>Jenis</TH><TH>Keterangan</TH><TH className="text-right">Jumlah</TH><TH className="text-right">Dibayar</TH></TR></THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD className="text-xs">{formatDate(e.created_at)}</TD>
                    <TD><StatusBadge map={COMMISSION_TYPE} value={e.entry_type} />{reversed.has(e.id) && <Badge tone="danger" className="ml-1">Dibalikkan</Badge>}</TD>
                    <TD className="max-w-sm text-xs">{e.description}</TD>
                    <TD className={`text-right font-semibold tabular-nums ${e.amount_sen < 0 ? "text-danger" : ""}`}>{formatRM(e.amount_sen)}</TD>
                    <TD className="text-right tabular-nums text-xs">{paidByEntry.get(e.id) ? formatRM(paidByEntry.get(e.id)) : "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Sejarah bayaran</h2>
            {payouts?.length ? (
              <Table>
                <THead><TR><TH>No.</TH><TH>Tarikh</TH><TH>Rujukan</TH><TH className="text-right">Jumlah</TH><TH>Bukti</TH><TH /></TR></THead>
                <TBody>
                  {(payouts as CommissionPayout[]).map((p) => (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs">{p.payout_no}</TD>
                      <TD className="text-xs">{formatDate(p.payment_date)}</TD>
                      <TD className="font-mono text-xs">{p.transaction_ref}{p.notes && <p className="font-sans text-muted-foreground">{p.notes}</p>}</TD>
                      <TD className={`text-right font-semibold tabular-nums ${p.amount_sen < 0 ? "text-danger" : ""}`}>{formatRM(p.amount_sen)}</TD>
                      <TD><FileLink bucket="payout-proofs" path={p.proof_path} label="Bukti" /></TD>
                      <TD>{!p.reverses_id && !reversedPayouts.has(p.id) && <ReversePayoutForm payoutId={p.id} />}{reversedPayouts.has(p.id) && <Badge tone="danger">Dibalikkan</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : <p className="text-sm text-muted-foreground">Belum ada bayaran.</p>}
          </section>
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Rekod bayaran komisen</CardTitle>
            <CardDescription>
              Akaun ahli: {profile.bank_name ?? "-"} · <span className="font-mono">{profile.bank_account_no ?? "-"}</span> · {profile.bank_account_holder ?? "-"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingReq && (
              <Alert tone="warning" title={`Ahli memohon pemindahan ${formatRM(pendingReq.amount_sen)}`} className="mb-4">
                Ke {pendingReq.bank_name} <span className="font-mono">{pendingReq.bank_account_no}</span> ({pendingReq.bank_account_holder}).
                {pendingReq.notes ? ` Catatan: “${pendingReq.notes}”` : ""} Permohonan ditanda dibayar secara automatik apabila baki menjadi sifar.
              </Alert>
            )}
            {memberId === userId ? (
              <Alert tone="info">Bayaran komisen kepada diri sendiri mesti direkodkan oleh Super Admin lain.</Alert>
            ) : outstanding > 0 && !hasValidBank(profile) ? (
              <Alert tone="warning">Ahli belum menetapkan akaun bank yang sah dalam profil. Bayaran tidak boleh direkodkan sehingga akaun bank dilengkapkan.</Alert>
            ) : outstanding > 0 ? (
              <PayoutForm memberId={memberId} adminId={userId} outstandingSen={outstanding} entries={unpaid} />
            ) : (
              <Alert tone="success">Tiada baki tertunggak.</Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
