import Link from "next/link";
import {
  AlertCircle, Beef, BadgeCheck, CircleDollarSign, Clock, HandCoins, Layers, Coins, ShoppingBag, Trophy, UserCheck, UserPlus, Users, Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CampaignProgressChart, CommissionChart, SalesChart, ShareGrowthChart } from "@/features/dashboard/charts";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBankSettings } from "@/lib/queries";
import { formatRM } from "@/lib/format";

export const metadata = { title: "Papan Pemuka Admin" };

type Stats = {
  total_members: number; active_members: number; pending_approvals: number; approved_share_sen: number; pending_share_count: number;
  pending_share_sen: number; active_campaigns: number; total_cattle: number; available_slots: number; confirmed_sales: number;
  confirmed_shares: number; sales_revenue_sen: number; pending_sales: number; commission_earned_sen: number; commission_paid_sen: number;
  commission_outstanding_sen: number;
  leaderboard: { full_name: string; membership_id: string; shares: number; revenue_sen: number }[];
  sales_by_month: { month: string; shares: number; revenue_sen: number }[];
  share_capital_by_month: { month: string; amount_sen: number }[];
  commission_by_type: { entry_type: string; amount_sen: number }[];
};

export default async function AdminDashboard() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, { data: progress }, bank] = await Promise.all([
    supabase.rpc("admin_dashboard_stats"),
    supabase.from("v_campaign_progress").select("*").in("status", ["open", "closed"]).order("year", { ascending: false }).limit(6),
    getBankSettings(),
  ]);
  if (error || !data) return <Alert tone="danger">Statistik tidak dapat dimuatkan.</Alert>;
  const s = data as Stats;

  return (
    <>
      <PageHeader title="Papan pemuka" description="Gambaran keseluruhan keahlian, modal syer, jualan korban dan komisen." />
      {!bank.accountNo && (
        <Alert tone="info" title="Akaun bank koperasi belum ditetapkan" className="mb-6">
          Jualan tetap boleh direkodkan, tetapi ahli tidak akan melihat nombor akaun koperasi pada arahan pembayaran.{" "}
          <Link href="/admin/tetapan" className="font-semibold underline">Tetapkan</Link>
        </Alert>
      )}
      {(s.pending_approvals > 0 || s.pending_share_count > 0 || s.pending_sales > 0) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { n: s.pending_approvals, label: "permohonan ahli menunggu", href: "/admin/ahli?status=menunggu", icon: UserPlus },
            { n: s.pending_share_count, label: "bayaran syer menunggu", href: "/admin/saham", icon: Coins },
            { n: s.pending_sales, label: "jualan korban menunggu", href: "/admin/jualan?status=pending_review", icon: AlertCircle },
          ].filter((x) => x.n > 0).map((x) => (
            <Link key={x.href} href={x.href} className="flex items-center gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm hover:shadow-sm">
              <x.icon className="size-5 text-warning" /><span><strong className="text-base">{x.n}</strong> {x.label}</span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Keahlian & modal syer</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Jumlah ahli" value={s.total_members} icon={Users} />
        <StatCard label="Ahli aktif" value={s.active_members} icon={UserCheck} />
        <StatCard label="Menunggu kelulusan" value={s.pending_approvals} icon={UserPlus} />
        <StatCard emphasis label="Modal syer diluluskan" value={formatRM(s.approved_share_sen)} icon={Coins} />
        <StatCard label="Bayaran syer menunggu" value={s.pending_share_count} hint={formatRM(s.pending_share_sen)} icon={Clock} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Perniagaan korban</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <StatCard label="Kempen aktif" value={s.active_campaigns} icon={Beef} />
        <StatCard label="Jumlah lembu" value={s.total_cattle} icon={Layers} />
        <StatCard label="Bahagian tersedia" value={s.available_slots} icon={Layers} />
        <StatCard label="Jualan disahkan" value={s.confirmed_sales} hint={`${s.confirmed_shares} bahagian`} icon={BadgeCheck} />
        <StatCard emphasis label="Hasil jualan" value={formatRM(s.sales_revenue_sen)} icon={ShoppingBag} />
        <StatCard label="Jualan menunggu" value={s.pending_sales} icon={AlertCircle} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Komisen</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Komisen diperoleh" value={formatRM(s.commission_earned_sen)} icon={CircleDollarSign} />
        <StatCard emphasis label="Komisen tertunggak" value={formatRM(s.commission_outstanding_sen)} icon={Wallet} />
        <StatCard label="Komisen dibayar" value={formatRM(s.commission_paid_sen)} icon={HandCoins} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Prestasi jualan (bulanan)</CardTitle></CardHeader><CardContent><SalesChart data={s.sales_by_month} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Pertumbuhan modal syer</CardTitle></CardHeader><CardContent><ShareGrowthChart data={s.share_capital_by_month} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Taburan komisen</CardTitle></CardHeader><CardContent><CommissionChart data={s.commission_by_type} /></CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Kemajuan kempen</CardTitle></CardHeader>
          <CardContent>
            <CampaignProgressChart data={(progress ?? []).map((p) => ({
              name: p.name, confirmed: Number(p.confirmed_slots), reserved: Number(p.reserved_slots), available: Number(p.available_slots),
            }))} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center gap-2"><Trophy className="size-5 text-[var(--chart-4)]" /><CardTitle>Papan pendahulu jualan ahli</CardTitle></CardHeader>
        <CardContent>
          {s.leaderboard.length ? (
            <Table>
              <THead><TR><TH>#</TH><TH>Ahli</TH><TH className="text-right">Bahagian</TH><TH className="text-right">Nilai jualan</TH></TR></THead>
              <TBody>
                {s.leaderboard.map((l, i) => (
                  <TR key={l.membership_id}>
                    <TD className="font-bold">{i + 1}</TD>
                    <TD><p className="font-medium">{l.full_name}</p><p className="text-xs text-muted-foreground">{l.membership_id}</p></TD>
                    <TD className="text-right">{l.shares}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatRM(l.revenue_sen)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">Belum ada jualan diluluskan.</p>}
        </CardContent>
      </Card>
    </>
  );
}
