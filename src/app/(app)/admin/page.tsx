import Link from "next/link";
import { AlertCircle, Briefcase, Building2, Clock, Coins, HandCoins, Landmark, TrendingUp, UserCheck, UserPlus, Users, Wallet, Banknote } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ProjectCapitalChart, ShareGrowthChart } from "@/features/dashboard/charts";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBankSettings } from "@/lib/queries";
import { formatRM } from "@/lib/format";

export const metadata = { title: "Papan Pemuka Admin" };

type Stats = {
  total_members: number; active_members: number; pending_approvals: number; approved_share_sen: number; pending_share_count: number;
  pending_share_sen: number; projects_total: number; projects_open: number; projects_active: number; project_target_sen: number;
  project_capital_sen: number; active_capital_sen: number; pending_participations: number; profit_declared_sen: number;
  profit_received_sen: number; coop_profit_sen: number; member_dividend_sen: number; dividend_paid_sen: number; dividend_unpaid_sen: number;
  pending_withdrawals: number;
  share_capital_by_month: { month: string; amount_sen: number }[];
};

export default async function AdminDashboard() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, { data: projects }, bank, { data: finance }, { data: progress }] = await Promise.all([
    supabase.rpc("admin_dashboard_stats"),
    supabase.from("projects").select("id, name, target_sen, status").in("status", ["open", "full", "active"]).order("created_at", { ascending: false }).limit(8),
    getBankSettings(),
    supabase.rpc("admin_finance_summary", { p_from: null, p_to: null }),
    supabase.rpc("project_progress"),
  ]);
  const collected = new Map(((progress ?? []) as { project_id: string; approved_sen: number }[]).map((p) => [p.project_id, Number(p.approved_sen)]));
  const funds = finance as { total_funds_sen: number; funds_excl_share_sen: number } | null;
  if (error || !data) return <Alert tone="danger">Statistik tidak dapat dimuatkan.</Alert>;
  const s = data as Stats;

  return (
    <>
      <PageHeader title="Papan pemuka" description="Gambaran keseluruhan keahlian, modal syer, projek dan kewangan koperasi." />
      {!bank.accountNo && (
        <Alert tone="info" title="Akaun bank koperasi belum ditetapkan" className="mb-6">
          Ahli tidak akan melihat nombor akaun koperasi semasa membayar modal syer atau menyertai projek.{" "}
          <Link href="/admin/tetapan" className="font-semibold underline">Tetapkan</Link>
        </Alert>
      )}
      {(s.pending_approvals > 0 || s.pending_share_count > 0 || s.pending_participations > 0 || s.pending_withdrawals > 0) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: s.pending_approvals, label: "permohonan ahli menunggu", href: "/admin/ahli?status=menunggu", icon: UserPlus },
            { n: s.pending_share_count, label: "bayaran syer belum disemak", href: "/admin/saham", icon: Coins },
            { n: s.pending_participations, label: "bayaran projek belum disemak", href: "/admin/projek", icon: AlertCircle },
            { n: s.pending_withdrawals, label: "permohonan pengeluaran dividen", href: "/admin/projek/pengeluaran", icon: Wallet },
          ].filter((x) => x.n > 0).map((x) => (
            <Link key={x.href} href={x.href} className="flex items-center gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm hover:shadow-sm">
              <x.icon className="size-5 text-warning" /><span><strong className="text-base">{x.n}</strong> {x.label}</span>
            </Link>
          ))}
        </div>
      )}

      {funds && (
        <Link href="/admin/kewangan" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary p-5 text-primary-foreground hover:shadow-md">
          <span className="flex items-center gap-3">
            <span className="rounded-lg bg-white/10 p-2"><Landmark className="size-5" /></span>
            <span>
              <span className="block text-xs uppercase tracking-wide text-primary-foreground/75">Jumlah dana koperasi</span>
              <span className="text-2xl font-bold tabular-nums">{formatRM(funds.total_funds_sen)}</span>
            </span>
          </span>
          <span className="text-sm text-primary-foreground/80">Selain modal syer: <strong className="text-primary-foreground">{formatRM(funds.funds_excl_share_sen)}</strong> · Lihat kewangan →</span>
        </Link>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Keahlian & modal syer</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Jumlah ahli" value={s.total_members} icon={Users} />
        <StatCard label="Ahli aktif" value={s.active_members} icon={UserCheck} />
        <StatCard label="Menunggu kelulusan" value={s.pending_approvals} icon={UserPlus} />
        <StatCard emphasis label="Modal syer diluluskan" value={formatRM(s.approved_share_sen)} icon={Coins} />
        <StatCard label="Bayaran syer belum disemak" value={s.pending_share_count} hint={`${formatRM(s.pending_share_sen)} · perlu disahkan admin`} icon={Clock} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projek pelaburan</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Jumlah projek" value={s.projects_total} hint={`${s.projects_open} dibuka · ${s.projects_active} berjalan`} icon={Briefcase} />
        <StatCard label="Jumlah sasaran modal" value={formatRM(s.project_target_sen)} icon={Building2} />
        <StatCard emphasis label="Modal berjaya dikumpul" value={formatRM(s.project_capital_sen)} icon={Banknote} />
        <StatCard label="Modal aktif dilaburkan" value={formatRM(s.active_capital_sen)} icon={Landmark} />
        <StatCard label="Keuntungan diumumkan" value={formatRM(s.profit_declared_sen)} icon={TrendingUp} />
        <StatCard label="Keuntungan diterima koperasi" value={formatRM(s.profit_received_sen)} hint={`Milik koperasi ${formatRM(s.coop_profit_sen)}`} icon={Coins} />
        <StatCard label="Dividen ahli" value={formatRM(s.member_dividend_sen)} hint={`Dibayar ${formatRM(s.dividend_paid_sen)}`} icon={HandCoins} />
        <StatCard label="Dividen belum dibayar" value={formatRM(s.dividend_unpaid_sen)} hint={`${s.pending_withdrawals} permohonan menunggu`} icon={Clock} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Modal projek</CardTitle></CardHeader><CardContent>
          <ProjectCapitalChart data={(projects ?? []).map((p) => ({
            name: p.name, collected: collected.get(p.id) ?? 0, remaining: Math.max(Number(p.target_sen) - (collected.get(p.id) ?? 0), 0),
          }))} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Pertumbuhan modal syer</CardTitle></CardHeader><CardContent><ShareGrowthChart data={s.share_capital_by_month} /></CardContent></Card>
      </div>
    </>
  );
}
