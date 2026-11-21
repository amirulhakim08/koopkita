import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { FileLink } from "@/components/file-link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatRM } from "@/lib/format";
import { WITHDRAWAL_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { WithdrawalPaidForm, WithdrawalReviewForm } from "@/features/projects/admin-forms";
import type { ProjectWithdrawal } from "@/types/db";

export const metadata = { title: "Pengeluaran Dividen" };

type Row = ProjectWithdrawal & { member: { full_name: string; membership_id: string | null; phone: string | null } | null; project: { name: string; code: string } | null };

const FILTERS = [["tindakan", "Perlu tindakan"], ["paid", "Telah dibayar"], ["rejected", "Ditolak"], ["semua", "Semua"]] as const;

export default async function WithdrawalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { userId } = await requireAdmin();
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "tindakan";
  const supabase = await createClient();
  let q = supabase.from("project_withdrawals")
    .select("*, member:profiles!project_withdrawals_member_id_fkey(full_name, membership_id, phone), project:projects(name, code)")
    .order("created_at", { ascending: filter === "tindakan" }).limit(300);
  if (filter === "tindakan") q = q.in("status", ["pending", "approved"]);
  else if (filter !== "semua") q = q.eq("status", filter);
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <>
      <Link href="/admin/projek" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Pengurusan Projek</Link>
      <PageHeader title="Pengeluaran dividen" description="Lulus atau tolak permohonan ahli. Selepas Bendahari membuat pindahan, rekod tarikh, rujukan dan resit di sini." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Tapis status">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/admin/projek/pengeluaran?status=${k}`} aria-current={filter === k ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", filter === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{label}</Link>
        ))}
      </nav>
      <Card>
        <CardHeader><CardTitle>Permohonan</CardTitle><CardDescription>Aliran: Menunggu Semakan → Diluluskan (maklumkan Bendahari) → Telah Dibayar. Jika ditolak, jumlah kembali ke baki ahli.</CardDescription></CardHeader>
        <CardContent>
          {rows.length ? (
            <Table>
              <THead><TR><TH>No. / tarikh</TH><TH>Ahli</TH><TH>Projek</TH><TH className="text-right">Jumlah</TH><TH>Akaun bank ahli</TH><TH>Status</TH><TH>Tindakan</TH></TR></THead>
              <TBody>
                {rows.map((w) => (
                  <TR key={w.id}>
                    <TD><span className="font-mono text-xs">{w.withdrawal_no}</span><span className="block text-xs text-muted-foreground">{formatDateTime(w.created_at)}</span></TD>
                    <TD><Link href={`/admin/ahli/${w.member_id}`} className="font-medium hover:underline">{w.member?.full_name}</Link><span className="block text-xs text-muted-foreground">{w.member?.membership_id} · {w.member?.phone}</span></TD>
                    <TD><Link href={`/admin/projek/${w.project_id}`} className="hover:underline">{w.project?.name}</Link></TD>
                    <TD className="text-right font-semibold tabular-nums">{formatRM(w.amount_sen)}</TD>
                    <TD className="text-xs"><p className="font-medium">{w.bank_name}</p><p className="font-mono">{w.bank_account_no}</p><p>{w.bank_account_holder}</p></TD>
                    <TD><StatusBadge map={WITHDRAWAL_STATUS} value={w.status} />{w.notes && <p className="text-xs text-muted-foreground">Catatan ahli: {w.notes}</p>}
                      {w.review_notes && w.status === "rejected" && <p className="text-xs text-danger">{w.review_notes}</p>}</TD>
                    <TD>
                      {(w.status === "pending" || w.status === "approved") ? (
                        <div className="flex flex-col gap-2">
                          {w.status === "approved" && <WithdrawalPaidForm id={w.id} adminId={userId} />}
                          <WithdrawalReviewForm id={w.id} status={w.status} />
                        </div>
                      ) : w.status === "paid" ? (
                        <span className="text-xs">{formatDate(w.paid_on)} · {w.transaction_ref}{w.proof_path && <span className="block"><FileLink bucket="payout-proofs" path={w.proof_path} label="Resit" /></span>}</span>
                      ) : "-"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState icon={Wallet} title="Tiada permohonan" description={filter === "tindakan" ? "Tiada permohonan yang perlu tindakan." : undefined} />}
        </CardContent>
      </Card>
    </>
  );
}
