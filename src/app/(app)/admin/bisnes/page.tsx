import Link from "next/link";
import { Download, Store } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SuspendBusinessForm, VerifyBusinessButton } from "@/features/business/admin-forms";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM, todayKL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { logoUrl } from "@/lib/storage-url";

export const metadata = { title: "Bisnes Ahli" };

type Row = {
  business_id: string; name: string; ssm_no: string | null; ssm_verified: boolean; suspended: boolean; suspend_reason: string | null;
  phone: string; logo_path: string | null; owner_name: string; membership_id: string | null; created_at: string;
  invoice_count: number; invoiced_sen: number; direct_count: number; direct_sales_sen: number; total_sales_sen: number;
  received_sen: number; outstanding_sen: number;
};

const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Preset periods: this month (default), this year, all time. */
function periods(today: string) {
  return [
    { key: "bulan", label: "Bulan ini", from: `${today.slice(0, 7)}-01`, to: today },
    { key: "tahun", label: "Tahun ini", from: `${today.slice(0, 4)}-01-01`, to: today },
    { key: "semua", label: "Semua", from: undefined, to: undefined },
  ];
}

export default async function AdminBusinessPage({ searchParams }: { searchParams: Promise<{ tempoh?: string; dari?: string; hingga?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayKL();
  const presets = periods(today);
  const custom = isDate(sp.dari) || isDate(sp.hingga);
  const preset = custom ? undefined : presets.find((p) => p.key === sp.tempoh) ?? presets[0];
  const from = custom ? isDate(sp.dari) : preset!.from;
  const to = custom ? isDate(sp.hingga) : preset!.to;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_business_report", { p_from: from ?? null, p_to: to ?? null });
  if (error) return <Alert tone="danger">Data bisnes tidak dapat dimuatkan.</Alert>;
  const rows = (data ?? []) as Row[];
  const pendingSsm = rows.filter((r) => r.ssm_no && !r.ssm_verified).length;
  const sum = (k: "total_sales_sen" | "invoiced_sen" | "direct_sales_sen" | "received_sen" | "outstanding_sen") => rows.reduce((a, r) => a + Number(r[k]), 0);
  const range = from || to ? `${from ? formatDate(from) : "awal"} – ${to ? formatDate(to) : "kini"}` : "Semua tempoh";
  const exportQs = new URLSearchParams({ ...(from ? { dari: from } : {}), ...(to ? { hingga: to } : {}) }).toString();
  return (
    <>
      <PageHeader title="Bisnes ahli" description="Sahkan SSM dan pantau jualan bisnes ahli. Butiran pelanggan, item dan katalog ahli tidak dipaparkan (privasi)."
        actions={<Button asChild variant="outline"><a href={`/api/eksport/bisnes-ahli${exportQs ? `?${exportQs}` : ""}`}><Download /> Eksport CSV</a></Button>} />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {presets.map((p) => (
          <Link key={p.key} href={`/admin/bisnes?tempoh=${p.key}`}
            className={cn("rounded-full border px-3 py-1 text-sm", preset?.key === p.key ? "border-primary bg-primary text-primary-foreground" : "bg-white hover:bg-muted")}>{p.label}</Link>
        ))}
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs">Dari<Input type="date" name="dari" defaultValue={custom ? from : ""} max={today} className="h-9" /></label>
          <label className="text-xs">Hingga<Input type="date" name="hingga" defaultValue={custom ? to : ""} max={today} className="h-9" /></label>
          <Button type="submit" size="sm" variant="outline">Tapis</Button>
        </form>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Tempoh: <strong className="text-foreground">{range}</strong></p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard emphasis label="Jumlah jualan" value={formatRM(sum("total_sales_sen"))} hint={`Invois ${formatRM(sum("invoiced_sen"))} · Jualan langsung ${formatRM(sum("direct_sales_sen"))}`} />
        <StatCard label="Jumlah diterima" value={formatRM(sum("received_sen"))} />
        <StatCard label="Belum dibayar (kini)" value={formatRM(sum("outstanding_sen"))} />
        <StatCard label="Bisnes berdaftar" value={rows.length} icon={Store} hint={pendingSsm ? `${pendingSsm} menunggu pengesahan SSM` : undefined} />
      </div>
      {rows.length ? (
        <Table>
          <THead><TR><TH>Bisnes</TH><TH>No. SSM</TH><TH className="text-right">Invois</TH><TH className="text-right">Jualan langsung</TH><TH className="text-right">Jumlah jualan</TH><TH className="text-right">Diterima</TH><TH className="text-right">Belum dibayar</TH><TH>SSM</TH><TH>Modul</TH></TR></THead>
          <TBody>
            {rows.map((r) => {
              const logo = logoUrl(r.logo_path);
              return (
                <TR key={r.business_id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {logo ? <img src={logo} alt="" className="size-8 rounded object-contain" /> : <span className="flex size-8 items-center justify-center rounded bg-secondary text-primary"><Store className="size-4" /></span>}
                      <div className="min-w-40"><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.owner_name} · {r.membership_id}</p><p className="text-xs text-muted-foreground">{r.phone}</p></div>
                    </div>
                  </TD>
                  <TD className="font-mono text-xs">{r.ssm_no ?? "—"}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">{formatRM(r.invoiced_sen)}<p className="text-xs text-muted-foreground">{r.invoice_count} invois</p></TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">{formatRM(r.direct_sales_sen)}<p className="text-xs text-muted-foreground">{r.direct_count} resit</p></TD>
                  <TD className="whitespace-nowrap text-right font-semibold tabular-nums">{formatRM(r.total_sales_sen)}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">{formatRM(r.received_sen)}</TD>
                  <TD className={cn("whitespace-nowrap text-right tabular-nums", Number(r.outstanding_sen) > 0 && "text-warning")}>{formatRM(r.outstanding_sen)}</TD>
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
