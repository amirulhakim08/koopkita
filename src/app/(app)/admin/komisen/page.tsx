import Link from "next/link";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRM } from "@/lib/format";

export const metadata = { title: "Komisen" };

export default async function AdminCommissionPage() {
  await requireAdmin();
  const supabase = await createClient();
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
