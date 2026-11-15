import Link from "next/link";
import { ArrowLeft, HandCoins } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { FileLink } from "@/components/file-link";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatRM } from "@/lib/format";

export const metadata = { title: "Sejarah Bayaran Komisen" };

export default async function PayoutHistoryPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("commission_payouts")
    .select("*, member:profiles!commission_payouts_member_id_fkey(full_name, membership_id), recorder:profiles!commission_payouts_recorded_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(500);
  return (
    <>
      <Link href="/admin/komisen" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Komisen</Link>
      <PageHeader title="Sejarah bayaran komisen" actions={<Button asChild variant="outline"><Link href="/api/eksport/bayaran-komisen">Eksport CSV</Link></Button>} />
      {data?.length ? (
        <Table>
          <THead><TR><TH>No.</TH><TH>Ahli</TH><TH>Tarikh pindahan</TH><TH>Rujukan</TH><TH className="text-right">Jumlah</TH><TH>Direkod oleh</TH><TH>Bukti</TH></TR></THead>
          <TBody>
            {data.map((p) => (
              <TR key={p.id}>
                <TD className="font-mono text-xs">{p.payout_no} {p.reverses_id && <Badge tone="danger">Pembalikan</Badge>}</TD>
                <TD><Link href={`/admin/komisen/${p.member_id}`} className="hover:underline">{p.member?.full_name}</Link><p className="text-xs text-muted-foreground">{p.member?.membership_id}</p></TD>
                <TD>{formatDate(p.payment_date)}</TD>
                <TD className="font-mono text-xs">{p.transaction_ref}</TD>
                <TD className={`text-right font-semibold tabular-nums ${p.amount_sen < 0 ? "text-danger" : ""}`}>{formatRM(p.amount_sen)}</TD>
                <TD className="text-xs">{p.recorder?.full_name}<p className="text-muted-foreground">{formatDateTime(p.created_at)}</p></TD>
                <TD><FileLink bucket="payout-proofs" path={p.proof_path} label="Bukti" /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : <EmptyState icon={HandCoins} title="Belum ada bayaran direkodkan" />}
    </>
  );
}
