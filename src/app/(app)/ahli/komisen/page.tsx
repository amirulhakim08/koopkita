import { CircleDollarSign, HandCoins, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { FileLink } from "@/components/file-link";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM } from "@/lib/format";
import { COMMISSION_TYPE } from "@/lib/labels";
import type { CommissionEntry, CommissionPayout } from "@/types/db";

export const metadata = { title: "Komisen" };

export default async function CommissionPage() {
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  const [{ data: summary }, { data: ledger }, { data: payouts }] = await Promise.all([
    supabase.from("v_commission_summary").select("*").eq("member_id", userId).maybeSingle(),
    supabase.from("commission_ledger").select("*, qurban_sales(sale_no)").eq("member_id", userId).order("created_at", { ascending: false }),
    supabase.from("commission_payouts").select("*").eq("member_id", userId).order("created_at", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title="Komisen jualan" description="Komisen hanya dijana selepas jualan diluluskan dan dibayar penuh. Bayaran dibuat secara pindahan bank oleh koperasi." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Jumlah diperoleh" value={formatRM(summary?.earned_sen)} icon={CircleDollarSign}
          hint={Number(summary?.reversed_sen) > 0 ? `Selepas pembalikan ${formatRM(summary?.reversed_sen)}` : undefined} />
        <StatCard label="Telah dibayar" value={formatRM(summary?.paid_sen)} icon={HandCoins} />
        <StatCard emphasis label="Tertunggak" value={formatRM(summary?.outstanding_sen)} icon={Wallet} />
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="font-semibold">Lejar komisen</h2>
        {ledger?.length ? (
          <Table>
            <THead><TR><TH>Tarikh</TH><TH>Jenis</TH><TH>Keterangan</TH><TH>Jualan</TH><TH className="text-right">Jumlah</TH></TR></THead>
            <TBody>
              {(ledger as (CommissionEntry & { qurban_sales: { sale_no: string } | null })[]).map((e) => (
                <TR key={e.id}>
                  <TD>{formatDate(e.created_at)}</TD>
                  <TD><StatusBadge map={COMMISSION_TYPE} value={e.entry_type} /></TD>
                  <TD className="max-w-md text-sm">{e.description}</TD>
                  <TD className="font-mono text-xs">{e.qurban_sales?.sale_no ?? "-"}</TD>
                  <TD className={`text-right font-semibold tabular-nums ${e.amount_sen < 0 ? "text-danger" : "text-success"}`}>{formatRM(e.amount_sen)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={CircleDollarSign} title="Belum ada komisen" description="Komisen akan muncul selepas jualan anda diluluskan." />}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-semibold">Sejarah bayaran</h2>
        {payouts?.length ? (
          <Table>
            <THead><TR><TH>No. Bayaran</TH><TH>Tarikh</TH><TH>Rujukan bank</TH><TH className="text-right">Jumlah</TH><TH>Bukti</TH></TR></THead>
            <TBody>
              {(payouts as CommissionPayout[]).map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.payout_no} {p.reverses_id && <Badge tone="danger">Pembalikan</Badge>}</TD>
                  <TD>{formatDate(p.payment_date)}</TD>
                  <TD className="font-mono text-xs">{p.transaction_ref}</TD>
                  <TD className={`text-right font-semibold tabular-nums ${p.amount_sen < 0 ? "text-danger" : ""}`}>{formatRM(p.amount_sen)}</TD>
                  <TD><FileLink bucket="payout-proofs" path={p.proof_path} label="Bukti" /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={HandCoins} title="Belum ada bayaran" description="Bayaran komisen yang direkodkan oleh Super Admin akan dipaparkan di sini." />}
      </section>
    </>
  );
}
