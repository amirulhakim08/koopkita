import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Log Audit" };
const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; jenis?: string; m?: string }> }) {
  await requireAdmin();
  const { q, jenis, m } = await searchParams;
  const page = Math.max(0, Number(m ?? 0) || 0);
  const supabase = await createClient();
  let query = supabase.from("audit_logs").select("*, profiles(full_name)").order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  const term = (q ?? "").replace(/[^a-z0-9._-]/gi, "").slice(0, 40);
  if (term) query = query.ilike("action", `%${term}%`);
  if (jenis && /^[a-z_]+$/.test(jenis)) query = query.eq("entity_type", jenis);
  const { data } = await query;
  const types = ["profile", "share_transaction", "campaign", "cattle", "cattle_slot", "qurban_sale", "payment_submission", "qurban_participant", "commission_payout", "system_setting", "notification", "report"];
  const qs = (n: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(jenis ? { jenis } : {}), m: String(n) })}`;
  return (
    <>
      <PageHeader title="Log audit" description="Rekod kekal bagi semua tindakan pentadbiran dan kewangan. Tidak boleh diubah atau dipadam." />
      <SearchBar q={q} placeholder="Cari tindakan (cth. sale.approved)" filters={[{ name: "jenis", value: jenis, label: "Entiti", options: types.map((t) => [t, t]) }]} />
      {data?.length ? (
        <Table>
          <THead><TR><TH>Masa</TH><TH>Pelaku</TH><TH>Tindakan</TH><TH>Entiti</TH><TH>Butiran</TH></TR></THead>
          <TBody>
            {data.map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(a.created_at)}</TD>
                <TD className="text-xs">{(a.profiles as { full_name: string } | null)?.full_name ?? "Sistem"}</TD>
                <TD className="font-mono text-xs">{a.action}</TD>
                <TD className="font-mono text-[11px] text-muted-foreground">{a.entity_type}<br />{a.entity_id}</TD>
                <TD className="max-w-md"><code className="block whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(a.details)}</code></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : <EmptyState icon={ShieldCheck} title="Tiada rekod" />}
      <div className="mt-4 flex justify-between">
        {page > 0 ? <Button asChild variant="outline" size="sm"><Link href={qs(page - 1)}>← Lebih baharu</Link></Button> : <span />}
        {data?.length === PAGE && <Button asChild variant="outline" size="sm"><Link href={qs(page + 1)}>Lebih lama →</Link></Button>}
      </div>
    </>
  );
}
