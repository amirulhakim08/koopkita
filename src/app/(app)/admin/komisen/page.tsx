import Link from "next/link";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatRM } from "@/lib/format";
import { RejectPayoutRequestForm } from "@/features/commission/payout-form";

export const metadata = { title: "Komisen" };

export default async function AdminCommissionPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("commission_payout_requests")
    .select("*, profiles!commission_payout_requests_member_id_fkey(full_name, membership_id)")
    .eq("status", "pending")
    .order("created_at");
  const { data } = await supabase.from("v_commission_summary").select("*").or("earned_sen.neq.0,paid_sen.neq.0").order("outstanding_sen", { ascending: false });
  const rows = data ?? [];
  const sum = (k: "earned_sen" | "paid_sen" | "outstanding_sen") => rows.reduce((a, r) => a + Number(r[k]), 0);
  return (
    <>
      <PageHeader title="Komisen ahli" description="Bayaran komisen dibuat secara pindahan bank di luar sistem, kemudian direkodkan di sini."
        actions={<>
          <Button asChild variant="outline"><Link href="/admin/komisen/bayaran">Sejarah bayaran</Link></Button>
          <Button asChild variant="outline"><Link href="/api/eksport/komisen">Eksport komisen</Link></Button>
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Jumlah diperoleh" value={formatRM(sum("earned_sen"))} />
        <StatCard label="Jumlah dibayar" value={formatRM(sum("paid_sen"))} />
        <StatCard emphasis label="Jumlah tertunggak" value={formatRM(sum("outstanding_sen"))} icon={Wallet} />
      </div>
      <section className="mb-8 space-y-3">
        <h2 className="font-semibold">Permohonan pemindahan ({requests?.length ?? 0})</h2>
        {requests?.length ? (
          <Table>
            <THead><TR><TH>Ahli</TH><TH>Akaun bank</TH><TH className="text-right">Dipohon</TH><TH>Tarikh</TH><TH>Tindakan</TH></TR></THead>
            <TBody>
              {requests.map((r) => (
                <TR key={r.id}>
                  <TD><p className="font-medium">{r.profiles?.full_name}</p><p className="text-xs text-muted-foreground">{r.profiles?.membership_id}</p>{r.notes && <p className="text-xs">“{r.notes}”</p>}</TD>
                  <TD className="text-xs"><p>{r.bank_name}</p><p className="font-mono">{r.bank_account_no}</p><p>{r.bank_account_holder}</p></TD>
                  <TD className="text-right font-semibold tabular-nums">{formatRM(r.amount_sen)}</TD>
                  <TD className="text-xs">{formatDateTime(r.created_at)}</TD>
                  <TD className="space-y-2">
                    <Button asChild size="sm"><Link href={`/admin/komisen/${r.member_id}`}>Rekod pemindahan</Link></Button>
                    <RejectPayoutRequestForm requestId={r.id} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">Tiada permohonan pemindahan yang menunggu.</p>}
      </section>

      <h2 className="mb-3 font-semibold">Baki komisen ahli</h2>
      {rows.length ? (
        <Table>
          <THead><TR><TH>Ahli</TH><TH className="text-right">Diperoleh</TH><TH className="text-right">Dibalikkan</TH><TH className="text-right">Dibayar</TH><TH className="text-right">Tertunggak</TH><TH /></TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.member_id}>
                <TD><p className="font-medium">{r.full_name}</p><p className="text-xs text-muted-foreground">{r.membership_id}</p></TD>
                <TD className="text-right tabular-nums">{formatRM(r.gross_sen)}</TD>
                <TD className="text-right tabular-nums text-danger">{Number(r.reversed_sen) ? formatRM(-r.reversed_sen) : "-"}</TD>
                <TD className="text-right tabular-nums">{formatRM(r.paid_sen)}</TD>
                <TD className={`text-right font-bold tabular-nums ${Number(r.outstanding_sen) < 0 ? "text-danger" : ""}`}>{formatRM(r.outstanding_sen)}</TD>
                <TD className="text-right"><Button asChild size="sm" variant={Number(r.outstanding_sen) > 0 ? "default" : "outline"}><Link href={`/admin/komisen/${r.member_id}`}>{Number(r.outstanding_sen) > 0 ? "Rekod bayaran" : "Lihat"}</Link></Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : <EmptyState icon={Wallet} title="Belum ada komisen" description="Komisen dijana apabila jualan korban diluluskan." />}
    </>
  );
}
