import Link from "next/link";
import { Beef, Plus, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Select } from "@/components/ui/input";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM } from "@/lib/format";
import { CAMPAIGN_STATUS, SALE_STATUS } from "@/lib/labels";

export const metadata = { title: "Korban" };

export default async function QurbanPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { userId } = await requireActiveMember();
  const { status } = await searchParams;
  const supabase = await createClient();
  let salesQuery = supabase
    .from("qurban_sales")
    .select("id, sale_no, share_count, total_sen, status, created_at, reservation_expires_at, buyers(full_name), campaigns(name)")
    .eq("member_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && status in SALE_STATUS) salesQuery = salesQuery.eq("status", status);
  const [{ data: campaigns }, { data: sales }] = await Promise.all([
    supabase.from("campaigns").select("*").neq("status", "draft").order("year", { ascending: false }),
    salesQuery,
  ]);
  const { data: progress } = await supabase.from("v_campaign_progress").select("*");
  const progressById = new Map((progress ?? []).map((p) => [p.campaign_id, p]));

  return (
    <>
      <PageHeader title="Jualan korban" description="Tempah slot korban untuk pembeli dan jejak status kelulusan."
        actions={<Button asChild size="lg"><Link href="/ahli/korban/jualan-baru"><Plus /> Tambah Jualan Korban</Link></Button>} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {campaigns?.length ? campaigns.map((c) => {
          const p = progressById.get(c.id);
          return (
            <Card key={c.id}>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle>{c.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{formatDate(c.start_date)} – {formatDate(c.closing_date)}</p>
                </div>
                <StatusBadge map={CAMPAIGN_STATUS} value={c.status} />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg bg-muted p-2"><p className="font-bold">{formatRM(c.price_per_share_sen)}</p><p className="text-xs text-muted-foreground">sebahagian</p></div>
                  <div className="rounded-lg bg-muted p-2"><p className="font-bold">{p?.cattle_count ?? 0}</p><p className="text-xs text-muted-foreground">ekor lembu</p></div>
                  <div className="rounded-lg bg-muted p-2"><p className="font-bold">{p?.available_slots ?? 0}</p><p className="text-xs text-muted-foreground">slot tersedia</p></div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Komisen {formatRM(c.commission_per_share_sen)} sebahagian · {formatRM(c.full_cattle_commission_sen)} jika anda menjual
                  kesemua 7 bahagian seekor lembu.
                </p>
                {c.status === "open" && (
                  <Button asChild className="w-full"><Link href={`/ahli/korban/jualan-baru?kempen=${c.id}`}><Plus /> Jual untuk kempen ini</Link></Button>
                )}
              </CardContent>
            </Card>
          );
        }) : <div className="md:col-span-2 xl:col-span-3"><EmptyState icon={Beef} title="Tiada kempen" description="Belum ada kempen korban dibuka." /></div>}
      </div>

      <div className="mt-8 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Sejarah jualan saya</h2>
          <form className="flex gap-2">
            <Select name="status" defaultValue={status ?? ""} className="w-48" aria-label="Tapis status">
              <option value="">Semua status</option>
              {Object.entries(SALE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Button variant="outline" type="submit">Tapis</Button>
          </form>
        </div>
        {sales?.length ? (
          <Table>
            <THead><TR><TH>No. Jualan</TH><TH>Kempen</TH><TH>Pembeli</TH><TH className="text-right">Bahagian</TH><TH className="text-right">Jumlah</TH><TH>Status</TH><TH>Tarikh</TH></TR></THead>
            <TBody>
              {sales.map((s) => {
                const buyer = s.buyers as unknown as { full_name: string } | null;
                const campaign = s.campaigns as unknown as { name: string } | null;
                return (
                  <TR key={s.id}>
                    <TD><Link className="font-medium text-primary hover:underline" href={`/ahli/korban/jualan/${s.id}`}>{s.sale_no}</Link></TD>
                    <TD>{campaign?.name}</TD>
                    <TD>{buyer?.full_name}</TD>
                    <TD className="text-right">{s.share_count}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatRM(s.total_sen)}</TD>
                    <TD><StatusBadge map={SALE_STATUS} value={s.status} /></TD>
                    <TD>{formatDate(s.created_at)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <EmptyState icon={ShoppingBag} title="Tiada jualan" description="Jualan yang anda rekodkan akan dipaparkan di sini." />}
      </div>
    </>
  );
}
