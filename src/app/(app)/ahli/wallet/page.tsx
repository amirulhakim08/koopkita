import Link from "next/link";
import { Briefcase, Clock, Coins, HandCoins, Landmark, Store, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { FileLink } from "@/components/file-link";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM } from "@/lib/format";
import { PROJECT_STATUS, WITHDRAWAL_STATUS } from "@/lib/labels";
import { BusinessChart } from "@/features/dashboard/charts";
import { CancelWithdrawalButton } from "@/features/projects/member-forms";
import type { MemberProjectWallet, ProjectWithdrawal } from "@/types/db";

export const metadata = { title: "Wallet" };

type Business = {
  has_business: boolean; sales_month_sen?: number; sales_year_sen?: number; received_month_sen?: number; received_year_sen?: number;
  outstanding_sen?: number; open_invoices?: number; by_month?: { month: string; sales_sen: number; received_sen: number }[];
};

/** Summary of the member's own money with the cooperative. Nothing here is a spendable balance. */
export default async function WalletPage() {
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  const [{ data: share }, { data: business }, { data: wallet }, { data: withdrawals }] = await Promise.all([
    supabase.from("v_share_balances").select("*").eq("member_id", userId).maybeSingle(),
    supabase.rpc("my_business_performance"),
    supabase.rpc("member_project_wallet"),
    supabase.from("project_withdrawals").select("*, projects(name)").eq("member_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  const b = (business ?? { has_business: false }) as Business;
  const projects = (wallet ?? []) as MemberProjectWallet[];
  const sum = (k: keyof MemberProjectWallet) => projects.reduce((s, p) => s + Number(p[k] ?? 0), 0);
  const capital = sum("capital_sen") - sum("capital_returned_sen");
  const dividends = sum("dividend_declared_sen");
  const unpaid = dividends - sum("withdrawn_sen");

  return (
    <>
      <PageHeader title="Wallet" description="Ringkasan kewangan anda bersama koperasi. Modal, dividen dan hasil bisnes dipaparkan berasingan." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <a href="#modal-syer"><StatCard label="Modal syer" value={formatRM(share?.approved_sen)} icon={Landmark} /></a>
        <a href="#bisnes"><StatCard label="Jualan bisnes (tahun ini)" value={formatRM(b.sales_year_sen)} icon={Store} /></a>
        <a href="#projek"><StatCard emphasis label="Modal projek" value={formatRM(capital)} icon={Briefcase} hint={sum("pending_capital_sen") ? `${formatRM(sum("pending_capital_sen"))} menunggu` : undefined} /></a>
        <a href="#projek"><StatCard label="Dividen projek" value={formatRM(dividends)} icon={TrendingUp} hint={`Tersedia ${formatRM(sum("available_sen"))}`} /></a>
        <a href="#pengeluaran"><StatCard label="Bayaran belum diterima" value={formatRM(unpaid)} icon={Clock} hint="Dividen yang belum dibayar kepada anda" /></a>
      </div>

      <section id="modal-syer" className="mt-8 scroll-mt-20">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div><CardTitle>Modal Syer</CardTitle><CardDescription>Modal syer ialah pegangan keahlian, bukan wang tunai yang boleh dikeluarkan.</CardDescription></div>
            <Button asChild variant="outline" size="sm"><Link href="/ahli/saham">Buka Syer</Link></Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Diluluskan</p><p className="text-lg font-bold tabular-nums">{formatRM(share?.approved_sen)}</p></div>
            <div><p className="text-xs text-muted-foreground">Menunggu semakan</p><p className="text-lg font-bold tabular-nums">{formatRM(share?.pending_sen)}</p></div>
            <div><p className="text-xs text-muted-foreground">Transaksi menunggu</p><p className="text-lg font-bold tabular-nums">{share?.pending_count ?? 0}</p></div>
          </CardContent>
        </Card>
      </section>

      <section id="bisnes" className="mt-6 scroll-mt-20">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div><CardTitle>Prestasi Bisnes</CardTitle><CardDescription>Daripada invois dan resit Bisnes Saya. Wang ini milik anda, bukan kewangan koperasi.</CardDescription></div>
            <Button asChild variant="outline" size="sm"><Link href="/ahli/bisnes">Buka Bisnes</Link></Button>
          </CardHeader>
          <CardContent>
            {b.has_business ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><p className="text-xs text-muted-foreground">Jualan bulan ini</p><p className="text-lg font-bold tabular-nums">{formatRM(b.sales_month_sen)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Diterima bulan ini</p><p className="text-lg font-bold tabular-nums">{formatRM(b.received_month_sen)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Diterima tahun ini</p><p className="text-lg font-bold tabular-nums">{formatRM(b.received_year_sen)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Belum dibayar pelanggan</p><p className="text-lg font-bold tabular-nums">{formatRM(b.outstanding_sen)}</p>
                    <p className="text-xs text-muted-foreground">{b.open_invoices ?? 0} invois terbuka</p></div>
                </div>
                <div className="mt-4"><BusinessChart data={b.by_month ?? []} /></div>
              </>
            ) : <EmptyState icon={Store} title="Belum ada profil bisnes" description="Daftar bisnes anda untuk mengeluarkan sebut harga, invois dan resit." action={<Button asChild><Link href="/ahli/bisnes">Mula Bisnes Saya</Link></Button>} />}
          </CardContent>
        </Card>
      </section>

      <section id="projek" className="mt-6 scroll-mt-20">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div><CardTitle>Wallet Projek</CardTitle><CardDescription>Modal dan dividen setiap projek. Dividen boleh dipohon selepas wang diterima koperasi.</CardDescription></div>
            <Button asChild variant="outline" size="sm"><Link href="/ahli/projek">Lihat Projek</Link></Button>
          </CardHeader>
          <CardContent>
            {projects.length ? (
              <ul className="space-y-3">
                {projects.map((p) => (
                  <li key={p.project_id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.code} · {p.partner}</p></div>
                      <StatusBadge map={PROJECT_STATUS} value={p.status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-muted-foreground">Modal</dt><dd className="font-semibold tabular-nums">{formatRM(p.capital_sen)}</dd>
                        {Number(p.pending_capital_sen) > 0 && <dd className="text-xs text-warning">+{formatRM(p.pending_capital_sen)} menunggu</dd>}
                        {Number(p.capital_returned_sen) > 0 && <dd className="text-xs text-muted-foreground">{formatRM(p.capital_returned_sen)} dipulangkan</dd>}</div>
                      <div><dt className="text-xs text-muted-foreground">Dividen</dt><dd className="font-semibold tabular-nums">{formatRM(p.dividend_declared_sen)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Dikeluarkan</dt><dd className="font-semibold tabular-nums">{formatRM(p.withdrawn_sen)}</dd>
                        {Number(p.withdrawal_pending_sen) > 0 && <dd className="text-xs text-warning">{formatRM(p.withdrawal_pending_sen)} diproses</dd>}</div>
                      <div><dt className="text-xs text-muted-foreground">Tersedia</dt><dd className="font-bold tabular-nums text-primary">{formatRM(p.available_sen)}</dd></div>
                    </dl>
                    <Button asChild size="sm" className="mt-3 w-full sm:w-auto" variant={Number(p.available_sen) > 0 ? "default" : "outline"}>
                      <Link href={`/ahli/projek/${p.project_id}`}>{Number(p.available_sen) > 0 ? "Mohon Pengeluaran" : "Lihat projek"}</Link></Button>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={HandCoins} title="Belum menyertai projek" description="Projek yang anda sertai akan dipaparkan di sini." />}
          </CardContent>
        </Card>
      </section>

      <section id="pengeluaran" className="mt-6 scroll-mt-20">
        <Card>
          <CardHeader><CardTitle>Sejarah pengeluaran</CardTitle></CardHeader>
          <CardContent>
            {withdrawals?.length ? (
              <Table>
                <THead><TR><TH>No.</TH><TH>Projek</TH><TH className="text-right">Jumlah</TH><TH>Status</TH><TH>Resit</TH></TR></THead>
                <TBody>
                  {(withdrawals as (ProjectWithdrawal & { projects: { name: string } | null })[]).map((w) => (
                    <TR key={w.id}>
                      <TD><span className="font-mono text-xs">{w.withdrawal_no}</span><span className="block text-xs text-muted-foreground">{formatDate(w.created_at)}</span></TD>
                      <TD>{w.projects?.name}</TD>
                      <TD className="text-right font-semibold tabular-nums">{formatRM(w.amount_sen)}</TD>
                      <TD><StatusBadge map={WITHDRAWAL_STATUS} value={w.status} />{w.status === "rejected" && w.review_notes && <p className="text-xs text-danger">Sebab: {w.review_notes}</p>}
                        {w.status === "pending" && <CancelWithdrawalButton id={w.id} />}</TD>
                      <TD>{w.proof_path ? <FileLink bucket="payout-proofs" path={w.proof_path} label="Resit" /> : w.paid_on ? formatDate(w.paid_on) : "-"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : <EmptyState icon={Coins} title="Tiada pengeluaran" description="Permohonan pengeluaran dividen akan dipaparkan di sini." />}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
