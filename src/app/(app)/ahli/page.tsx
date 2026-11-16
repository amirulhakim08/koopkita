import Link from "next/link";
import { Beef, BadgeCheck, CircleDollarSign, HandCoins, Coins, Plus, ShoppingBag, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatRM } from "@/lib/format";
import { MEMBER_STATUS, SALE_STATUS } from "@/lib/labels";

export const metadata = { title: "Utama" };

type Stats = Record<string, number>;

export default async function MemberDashboard() {
  const { profile } = await requireActiveMember();
  const supabase = await createClient();
  const [{ data: stats }, { data: campaigns }, { data: sales }, { data: notifications }] = await Promise.all([
    supabase.rpc("member_dashboard_stats"),
    supabase.from("v_campaign_progress").select("*").eq("status", "open").order("year", { ascending: false }),
    supabase.from("qurban_sales").select("id, sale_no, share_count, total_sen, status, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const s = (stats ?? {}) as Stats;
  const outstanding = Number(s.commission_earned_sen ?? 0) - Number(s.commission_paid_sen ?? 0);

  return (
    <>
      <PageHeader
        title={`Assalamualaikum, ${profile.full_name.split(" ")[0]}`}
        description={<span className="inline-flex flex-wrap items-center gap-2">No. Ahli <strong>{profile.membership_id}</strong> <StatusBadge map={MEMBER_STATUS} value={profile.status} /></span>}
        actions={
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/ahli/korban/jualan-baru"><Plus /> Tambah Jualan Korban</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard emphasis label="Modal syer diluluskan" value={formatRM(s.approved_share_sen)} icon={Coins}
          hint={Number(s.pending_share_sen) > 0 ? `${formatRM(s.pending_share_sen)} menunggu semakan` : undefined} />
        <StatCard label="Jualan disahkan" value={s.confirmed_sales ?? 0} icon={BadgeCheck} hint={`${s.shares_sold ?? 0} bahagian dijual`} />
        <StatCard label="Nilai jualan" value={formatRM(s.sales_value_sen)} icon={ShoppingBag} />
        <StatCard label="Jualan dalam proses" value={s.pending_sales ?? 0} icon={Beef} />
        <StatCard label="Komisen diperoleh" value={formatRM(s.commission_earned_sen)} icon={CircleDollarSign} />
        <StatCard label="Komisen tertunggak" value={formatRM(outstanding)} icon={Wallet} />
        <StatCard label="Komisen dibayar" value={formatRM(s.commission_paid_sen)} icon={HandCoins} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Kempen korban aktif</CardTitle>
            <Link href="/ahli/korban" className="text-sm font-medium text-primary hover:underline">Lihat semua</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaigns?.length ? campaigns.map((c) => {
              const sold = Number(c.confirmed_slots) + Number(c.reserved_slots);
              const pct = Number(c.total_slots) ? Math.round((sold / Number(c.total_slots)) * 100) : 0;
              return (
                <div key={c.campaign_id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{formatRM(c.price_per_share_sen)} sebahagian · {c.available_slots} slot tersedia</p>
                    </div>
                    <Button asChild size="sm"><Link href={`/ahli/korban/jualan-baru?kempen=${c.campaign_id}`}><Plus /> Jual</Link></Button>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{pct}% telah ditempah/disahkan</p>
                </div>
              );
            }) : <EmptyState icon={Beef} title="Tiada kempen aktif" description="Kempen korban akan dipaparkan di sini apabila dibuka." />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Notifikasi</CardTitle>
            <Link href="/ahli/notifikasi" className="text-sm font-medium text-primary hover:underline">Semua</Link>
          </CardHeader>
          <CardContent>
            {notifications?.length ? (
              <ul className="space-y-3">
                {notifications.map((n) => (
                  <li key={n.id} className="flex gap-3">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-border" : "bg-primary"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Tiada notifikasi.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Jualan terkini</CardTitle>
          <Link href="/ahli/korban" className="text-sm font-medium text-primary hover:underline">Sejarah jualan</Link>
        </CardHeader>
        <CardContent>
          {sales?.length ? (
            <ul className="divide-y">
              {sales.map((s) => (
                <li key={s.id}>
                  <Link href={`/ahli/korban/jualan/${s.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40">
                    <div>
                      <p className="font-medium">{s.sale_no}</p>
                      <p className="text-xs text-muted-foreground">{s.share_count} bahagian · {formatDate(s.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatRM(s.total_sen)}</p>
                      <StatusBadge map={SALE_STATUS} value={s.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShoppingBag} title="Belum ada jualan" description="Mulakan jualan korban pertama anda."
              action={<Button asChild><Link href="/ahli/korban/jualan-baru"><Plus /> Tambah Jualan Korban</Link></Button>} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
