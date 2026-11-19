import { Store } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SuspendBusinessForm, VerifyBusinessButton } from "@/features/business/admin-forms";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM } from "@/lib/format";
import { logoUrl } from "@/lib/storage-url";

export const metadata = { title: "Bisnes Ahli" };

type Row = {
  business_id: string; name: string; ssm_no: string | null; ssm_verified: boolean; suspended: boolean; suspend_reason: string | null;
  phone: string; logo_path: string | null; owner_name: string; membership_id: string | null; invoice_count: number;
  invoiced_sen: number; received_sen: number; outstanding_sen: number; created_at: string;
};

export default async function AdminBusinessPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_business_overview");
  if (error) return <Alert tone="danger">Data bisnes tidak dapat dimuatkan.</Alert>;
  const rows = (data ?? []) as Row[];
  const pendingSsm = rows.filter((r) => r.ssm_no && !r.ssm_verified).length;
  const sum = (k: "invoiced_sen" | "received_sen") => rows.reduce((a, r) => a + Number(r[k]), 0);
  return (
    <>
      <PageHeader title="Bisnes ahli" description="Sahkan SSM dan pantau aktiviti bisnes ahli. Butiran pelanggan dan item invois ahli tidak dipaparkan (privasi)." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Bisnes berdaftar" value={rows.length} icon={Store} />
        <StatCard label="Menunggu pengesahan SSM" value={pendingSsm} />
        <StatCard label="Jumlah diinvois" value={formatRM(sum("invoiced_sen"))} />
        <StatCard emphasis label="Jumlah diterima" value={formatRM(sum("received_sen"))} />
      </div>
      {rows.length ? (
        <Table>
          <THead><TR><TH>Bisnes</TH><TH>Ahli</TH><TH>No. SSM</TH><TH className="text-right">Invois</TH><TH className="text-right">Diinvois</TH><TH className="text-right">Diterima</TH><TH>SSM</TH><TH>Modul</TH></TR></THead>
          <TBody>
            {rows.map((r) => {
              const logo = logoUrl(r.logo_path);
              return (
                <TR key={r.business_id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {logo ? <img src={logo} alt="" className="size-8 rounded object-contain" /> : <span className="flex size-8 items-center justify-center rounded bg-secondary text-primary"><Store className="size-4" /></span>}
                      <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.phone} · sejak {formatDate(r.created_at)}</p></div>
                    </div>
                  </TD>
                  <TD className="text-xs">{r.owner_name}<p className="text-muted-foreground">{r.membership_id}</p></TD>
                  <TD className="font-mono text-xs">{r.ssm_no ?? "—"}</TD>
                  <TD className="text-right">{r.invoice_count}</TD>
                  <TD className="text-right tabular-nums">{formatRM(r.invoiced_sen)}</TD>
                  <TD className="text-right tabular-nums">{formatRM(r.received_sen)}</TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1">
                      {r.ssm_no ? (r.ssm_verified ? <Badge tone="success">✓ Disahkan</Badge> : <Badge tone="warning">Belum</Badge>) : <Badge tone="info">Tiada SSM</Badge>}
                      {r.ssm_no && <VerifyBusinessButton id={r.business_id} verified={r.ssm_verified} />}
                    </div>
                  </TD>
                  <TD>
                    {r.suspended && <Badge tone="danger" className="mb-1">Digantung</Badge>}
                    <SuspendBusinessForm id={r.business_id} suspended={r.suspended} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : <EmptyState icon={Store} title="Belum ada bisnes didaftarkan" description="Ahli boleh mendaftar bisnes melalui menu Bisnes Saya." />}
    </>
  );
}
