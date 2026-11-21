import Link from "next/link";
import { Briefcase, Coins, HandCoins, Store, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatRM } from "@/lib/format";
import { MEMBER_STATUS } from "@/lib/labels";
import { ProjectCard } from "@/features/projects/project-card";
import type { Project, ProjectProgress } from "@/types/db";

export const metadata = { title: "Utama" };

type Stats = Record<string, number>;

export default async function MemberDashboard() {
  const { profile } = await requireActiveMember();
  const supabase = await createClient();
  const [{ data: stats }, { data: business }, { data: projects }, { data: progress }, { data: notifications }] = await Promise.all([
    supabase.rpc("member_dashboard_stats"),
    supabase.rpc("my_business_performance"),
    supabase.from("projects").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(2),
    supabase.rpc("project_progress"),
    supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const s = (stats ?? {}) as Stats;
  const b = (business ?? {}) as Stats & { has_business?: boolean };
  const byId = new Map(((progress ?? []) as ProjectProgress[]).map((p) => [p.project_id, p]));

  return (
    <>
      <PageHeader
        title={`Assalamualaikum, ${profile.full_name.split(" ")[0]}`}
        description={<span className="inline-flex flex-wrap items-center gap-2">No. Ahli <strong>{profile.membership_id}</strong> <StatusBadge map={MEMBER_STATUS} value={profile.status} /></span>}
        actions={
          <>
            <Button asChild size="lg" className="flex-1 sm:flex-none"><Link href="/ahli/projek"><Briefcase /> Lihat Projek</Link></Button>
            <Button asChild size="lg" variant="outline" className="flex-1 sm:flex-none"><Link href="/ahli/wallet"><Wallet /> Buka Wallet</Link></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard emphasis label="Modal syer saya" value={formatRM(s.approved_share_sen)} icon={Coins}
          hint={Number(s.pending_share_sen) > 0 ? `${formatRM(s.pending_share_sen)} menunggu semakan` : undefined} />
        <StatCard label="Projek saya" value={formatRM(s.project_capital_sen)} icon={Briefcase}
          hint={`${s.projects_joined ?? 0} projek${Number(s.project_pending_sen) > 0 ? ` · ${formatRM(s.project_pending_sen)} menunggu` : ""}`} />
        <StatCard label="Dividen projek saya" value={formatRM(s.dividend_total_sen)} icon={HandCoins} hint={`Tersedia ${formatRM(s.dividend_available_sen)}`} />
        <StatCard label="Jualan bisnes bulan ini" value={formatRM(b.sales_month_sen)} icon={Store}
          hint={b.has_business ? `Belum dibayar pelanggan ${formatRM(b.outstanding_sen)}` : "Belum ada profil bisnes"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Projek dibuka</CardTitle>
            <Link href="/ahli/projek" className="text-sm font-medium text-primary hover:underline">Lihat semua</Link>
          </CardHeader>
          <CardContent>
            {projects?.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {(projects as Project[]).map((p) => <ProjectCard key={p.id} project={p} progress={byId.get(p.id)} href={`/ahli/projek/${p.id}`} joinable />)}
              </div>
            ) : <EmptyState icon={Briefcase} title="Tiada projek dibuka" description="Projek koperasi akan dipaparkan di sini apabila dibuka." />}
          </CardContent>
        </Card>

        <Card className="min-w-0">
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
    </>
  );
}
