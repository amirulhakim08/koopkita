import Link from "next/link";
import { Beef } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { CampaignForm } from "@/features/qurban/campaign-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/queries";
import { formatDate, formatRM } from "@/lib/format";
import { CAMPAIGN_STATUS } from "@/lib/labels";

export const metadata = { title: "Kempen Korban" };

export default async function CampaignsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: campaigns }, { data: progress }, settings] = await Promise.all([
    supabase.from("campaigns").select("*").order("year", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("v_campaign_progress").select("*"),
    getSettings(),
  ]);
  const p = new Map((progress ?? []).map((x) => [x.campaign_id, x]));
  return (
    <>
      <PageHeader title="Kempen korban" description="Cipta kempen tahunan, daftar lembu dan pantau peruntukan slot." />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          {campaigns?.length ? (
            <Table>
              <THead><TR><TH>Kempen</TH><TH>Tempoh</TH><TH className="text-right">Harga</TH><TH className="text-right">Lembu</TH><TH className="text-right">Disahkan / Ditempah / Tersedia</TH><TH>Status</TH></TR></THead>
              <TBody>
                {campaigns.map((c) => {
                  const x = p.get(c.id);
                  return (
                    <TR key={c.id}>
                      <TD><Link href={`/admin/kempen/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link></TD>
                      <TD className="text-xs">{formatDate(c.start_date)} – {formatDate(c.closing_date)}</TD>
                      <TD className="text-right">{formatRM(c.price_per_share_sen)}</TD>
                      <TD className="text-right">{x?.cattle_count ?? 0}</TD>
                      <TD className="text-right tabular-nums">{x?.confirmed_slots ?? 0} / {x?.reserved_slots ?? 0} / {x?.available_slots ?? 0}</TD>
                      <TD><StatusBadge map={CAMPAIGN_STATUS} value={c.status} /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : <EmptyState icon={Beef} title="Belum ada kempen" description="Cipta kempen korban pertama di sebelah." />}
        </div>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Kempen baharu</CardTitle></CardHeader>
          <CardContent><CampaignForm defaultExpiryHours={Number(settings.reservation_expiry_hours ?? 48)} /></CardContent>
        </Card>
      </div>
    </>
  );
}
