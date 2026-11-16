import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM } from "@/lib/format";
import { MEMBER_STATUS } from "@/lib/labels";
import { searchTerm } from "@/lib/utils";

export const metadata = { title: "Ahli" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin();
  const { q, status } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, membership_id, full_name, email, phone, state, status, role, created_at").order("created_at", { ascending: false }).limit(300);
  if (status === "menunggu") query = query.in("status", ["pending_approval", "pending_verification"]);
  else if (status && status in MEMBER_STATUS) query = query.eq("status", status);
  const term = searchTerm(q);
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,membership_id.ilike.%${term}%,phone.ilike.%${term}%`);
  const [{ data: members }, { data: balances }] = await Promise.all([query, supabase.from("v_share_balances").select("member_id, approved_sen")]);
  const bal = new Map((balances ?? []).map((b) => [b.member_id, b.approved_sen]));

  return (
    <>
      <PageHeader title="Pengurusan ahli" description="Semak permohonan, urus status dan maklumat ahli."
        actions={<Button asChild variant="outline"><Link href="/api/eksport/ahli">Eksport CSV</Link></Button>} />
      <SearchBar q={q} placeholder="Cari nama, e-mel, no. ahli atau telefon"
        filters={[{ name: "status", value: status, label: "Status", options: [["menunggu", "Menunggu kelulusan (semua)"], ...Object.entries(MEMBER_STATUS).map(([k, v]) => [k, v.label] as [string, string])] }]} />
      {members?.length ? (
        <Table>
          <THead><TR><TH>No. Ahli</TH><TH>Nama</TH><TH>Hubungan</TH><TH>Negeri</TH><TH className="text-right">Modal syer</TH><TH>Status</TH><TH>Daftar</TH></TR></THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD className="font-mono text-xs">{m.membership_id ?? "-"}</TD>
                <TD>
                  <Link href={`/admin/ahli/${m.id}`} className="font-medium text-primary hover:underline">{m.full_name}</Link>
                  {m.role === "super_admin" && <span className="ml-2 rounded bg-secondary px-1.5 text-[10px] font-semibold uppercase">Admin</span>}
                </TD>
                <TD className="text-xs"><p>{m.email}</p><p className="text-muted-foreground">{m.phone}</p></TD>
                <TD>{m.state ?? "-"}</TD>
                <TD className="text-right tabular-nums">{formatRM(bal.get(m.id) ?? 0)}</TD>
                <TD><StatusBadge map={MEMBER_STATUS} value={m.status} /></TD>
                <TD>{formatDate(m.created_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : <EmptyState icon={Users} title="Tiada ahli dijumpai" />}
    </>
  );
}
