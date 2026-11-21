import Link from "next/link";
import { AlertCircle, Briefcase, Clock, HandCoins, PiggyBank, Plus, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRM } from "@/lib/format";
import { PROJECT_STATUS } from "@/lib/labels";
import { FundingBar, ProjectStatus, fundingPct } from "@/features/projects/project-card";
import type { Project, ProjectProgress } from "@/types/db";

export const metadata = { title: "Pengurusan Projek" };

export default async function AdminProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin();
  const { q, status } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("projects").select("*").order("created_at", { ascending: false });
  if (status && status in PROJECT_STATUS) query = query.eq("status", status);
  if (q?.trim()) query = query.or(`name.ilike.%${q.trim().replace(/[%,()]/g, "")}%,code.ilike.%${q.trim().replace(/[%,()]/g, "")}%`);
  const [{ data: projects }, { data: progress }, { data: stats }] = await Promise.all([
    query, supabase.rpc("project_progress"), supabase.rpc("admin_dashboard_stats"),
  ]);
  const byId = new Map(((progress ?? []) as ProjectProgress[]).map((p) => [p.project_id, p]));
  const s = (stats ?? {}) as Record<string, number>;

  return (
    <>
      <PageHeader title="Pengurusan Projek" description="Cipta projek, sahkan bayaran ahli, rekod pelaburan dan umumkan keuntungan."
        actions={<>
          <Button asChild variant="outline"><Link href="/admin/projek/pengeluaran"><Wallet /> Pengeluaran dividen{s.pending_withdrawals ? ` (${s.pending_withdrawals})` : ""}</Link></Button>
          <Button asChild><Link href="/admin/projek/baharu"><Plus /> Projek Baharu</Link></Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Jumlah projek" value={s.projects_total ?? 0} hint={`${s.projects_open ?? 0} dibuka · ${s.projects_active ?? 0} berjalan`} icon={Briefcase} />
        <StatCard emphasis label="Dana terkumpul" value={formatRM(s.project_capital_sen)} hint={`Sasaran ${formatRM(s.project_target_sen)}`} icon={PiggyBank} />
        <StatCard label="Modal dilaburkan (aktif)" value={formatRM(s.active_capital_sen)} icon={TrendingUp} />
        <StatCard label="Pendapatan koperasi" value={formatRM(s.coop_profit_sen)} hint={`Keuntungan diterima ${formatRM(s.profit_received_sen)}`} icon={HandCoins} />
      </div>
      {(s.pending_participations ?? 0) > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-warning/25 bg-warning-soft p-3 text-sm"><AlertCircle className="size-4 text-warning" />
          <strong>{s.pending_participations}</strong> bayaran projek menunggu semakan. Buka projek berkaitan (tanda <Clock className="inline size-3.5" />).</p>
      )}

      <div className="mt-6">
        <SearchBar q={q} placeholder="Cari nama atau kod projek" filters={[{ name: "status", value: status, label: "Status", options: Object.entries(PROJECT_STATUS).map(([k, v]) => [k, v.label]) }]} />
        {projects?.length ? (
          <Table>
            <THead><TR><TH>Projek</TH><TH className="text-right">Sasaran</TH><TH className="text-right">Terkumpul</TH><TH className="w-40">Kemajuan</TH><TH className="text-right">Peserta</TH><TH>Status</TH><TH></TH></TR></THead>
            <TBody>
              {(projects as Project[]).map((p) => {
                const pr = byId.get(p.id);
                const approved = Number(pr?.approved_sen ?? 0);
                return (
                  <TR key={p.id}>
                    <TD><Link href={`/admin/projek/${p.id}`} className="font-medium hover:underline">{p.name}</Link><span className="block text-xs text-muted-foreground">{p.code} · {p.partner}</span></TD>
                    <TD className="text-right tabular-nums">{formatRM(p.target_sen)}</TD>
                    <TD className="text-right tabular-nums">{formatRM(approved)}</TD>
                    <TD><FundingBar target={Number(p.target_sen)} approved={approved} pending={Number(pr?.pending_sen ?? 0)} /><span className="text-xs text-muted-foreground">{fundingPct(Number(p.target_sen), approved)}%</span></TD>
                    <TD className="text-right">{pr?.participants ?? 0}{Number(pr?.pending_count) > 0 && <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-warning"><Clock className="size-3" />{pr?.pending_count}</span>}</TD>
                    <TD><ProjectStatus status={p.status} target={Number(p.target_sen)} approved={approved} /></TD>
                    <TD><div className="flex gap-1">
                      <Button asChild size="sm" variant="outline"><Link href={`/admin/projek/${p.id}`}>Urus</Link></Button>
                      {Number(pr?.pending_count) > 0 && <Button asChild size="sm"><Link href={`/admin/projek/${p.id}?tab=bayaran`}>Semak Bayaran</Link></Button>}
                      {["active", "matured"].includes(p.status) && <Button asChild size="sm" variant="outline"><Link href={`/admin/projek/${p.id}?tab=keuntungan`}>Urus Dividen</Link></Button>}
                    </div></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <EmptyState icon={Briefcase} title="Belum ada projek" description="Cipta projek pertama untuk dibuka kepada ahli." action={<Button asChild><Link href="/admin/projek/baharu"><Plus /> Projek Baharu</Link></Button>} />}
      </div>
    </>
  );
}
