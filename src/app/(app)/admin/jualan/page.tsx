import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { expireReservationsAction } from "@/features/qurban/actions";
import { formatDate, formatRM } from "@/lib/format";
import { SALE_STATUS } from "@/lib/labels";
import { searchTerm } from "@/lib/utils";

export const metadata = { title: "Jualan Korban" };

export default async function AdminSalesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; kempen?: string }> }) {
  await requireAdmin();
  const { q, status, kempen } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("qurban_sales")
    .select("id, sale_no, share_count, total_sen, status, created_at, submitted_at, campaign_id, campaigns(name), buyers(full_name, phone), profiles!qurban_sales_member_id_fkey(full_name, membership_id)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status && status in SALE_STATUS) query = query.eq("status", status);
  if (kempen && /^[0-9a-f-]{36}$/.test(kempen)) query = query.eq("campaign_id", kempen);
  const term = searchTerm(q);
  if (term) query = query.ilike("sale_no", `%${term}%`);
  const [{ data: sales }, { data: campaigns }] = await Promise.all([query, supabase.from("campaigns").select("id, name").order("year", { ascending: false })]);

  return (
    <>
      <PageHeader title="Jualan korban" description="Sahkan bayaran pelanggan dengan rekod bank koperasi sebelum meluluskan jualan."
        actions={<>
          <ActionForm action={expireReservationsAction} showInlineError={false}>
            <SubmitButton variant="outline">Proses tempahan tamat</SubmitButton>
          </ActionForm>
          <Button asChild variant="outline"><Link href="/api/eksport/jualan">Eksport CSV</Link></Button>
        </>} />
      <SearchBar q={q} placeholder="Cari no. jualan (cth. QS-2027-00001)" filters={[
        { name: "status", value: status, label: "Status", options: Object.entries(SALE_STATUS).map(([k, v]) => [k, v.label]) },
        { name: "kempen", value: kempen, label: "Kempen", options: (campaigns ?? []).map((c) => [c.id, c.name]) },
      ]} />
      {sales?.length ? (
        <Table>
          <THead><TR><TH>No. Jualan</TH><TH>Ahli</TH><TH>Pembeli</TH><TH>Kempen</TH><TH className="text-right">Bhg</TH><TH className="text-right">Jumlah</TH><TH>Status</TH><TH>Tarikh</TH></TR></THead>
          <TBody>
            {sales.map((s) => {
              const m = s.profiles as unknown as { full_name: string; membership_id: string } | null;
              const b = s.buyers as unknown as { full_name: string; phone: string } | null;
              const c = s.campaigns as unknown as { name: string } | null;
              return (
                <TR key={s.id}>
                  <TD><Link href={`/admin/jualan/${s.id}`} className="font-medium text-primary hover:underline">{s.sale_no}</Link></TD>
                  <TD><p>{m?.full_name}</p><p className="text-xs text-muted-foreground">{m?.membership_id}</p></TD>
                  <TD><p>{b?.full_name}</p><p className="text-xs text-muted-foreground">{b?.phone}</p></TD>
                  <TD className="text-xs">{c?.name}</TD>
                  <TD className="text-right">{s.share_count}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatRM(s.total_sen)}</TD>
                  <TD><StatusBadge map={SALE_STATUS} value={s.status} /></TD>
                  <TD className="text-xs">{formatDate(s.created_at)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : <EmptyState icon={ShoppingBag} title="Tiada jualan dijumpai" />}
    </>
  );
}
