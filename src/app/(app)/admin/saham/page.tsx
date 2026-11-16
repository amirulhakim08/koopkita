import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { FileLink } from "@/components/file-link";
import { Button } from "@/components/ui/button";
import { ActionForm, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ShareReviewForm } from "@/features/shares/review-forms";
import { createShareAdjustmentAction } from "@/features/shares/actions";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatRM } from "@/lib/format";
import { REVIEW_STATUS } from "@/lib/labels";
import { searchTerm } from "@/lib/utils";

export const metadata = { title: "Modal Saham" };

type Row = {
  id: string; amount_sen: number; payment_date: string | null; transaction_ref: string | null; receipt_path: string | null; status: string;
  duplicate_flag: boolean; duplicate_reason: string | null; txn_type: string; reason: string | null; review_notes: string | null; created_at: string;
  profiles: { full_name: string; membership_id: string | null } | null;
};

export default async function AdminSharesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin();
  const { q, status } = await searchParams;
  const supabase = await createClient();
  const select = "*, profiles!share_transactions_member_id_fkey(full_name, membership_id)";
  let history = supabase.from("share_transactions").select(select).order("created_at", { ascending: false }).limit(300);
  if (status && status in REVIEW_STATUS) history = history.eq("status", status);
  const term = searchTerm(q);
  if (term) history = history.ilike("transaction_ref", `%${term}%`);
  const [{ data: pending }, { data: all }, { data: balances }, { data: members }] = await Promise.all([
    supabase.from("share_transactions").select(select).eq("status", "pending").order("created_at"),
    history,
    supabase.from("v_share_balances").select("*").gt("approved_sen", 0).order("approved_sen", { ascending: false }).limit(50),
    supabase.from("profiles").select("id, full_name, membership_id").eq("status", "active").order("full_name"),
  ]);

  return (
    <>
      <PageHeader title="Modal saham" description="Sahkan setiap bayaran dengan penyata bank koperasi sebelum meluluskan."
        actions={<>
          <Button asChild variant="outline"><Link href="/api/eksport/saham">Eksport baki</Link></Button>
          <Button asChild variant="outline"><Link href="/api/eksport/transaksi-saham">Eksport transaksi</Link></Button>
        </>} />

      <section className="space-y-3">
        <h2 className="font-semibold">Menunggu semakan ({pending?.length ?? 0})</h2>
        {pending?.length ? (
          <Table>
            <THead><TR><TH>Ahli</TH><TH>Tarikh bayar</TH><TH>Rujukan</TH><TH className="text-right">Jumlah</TH><TH>Resit</TH><TH>Tindakan</TH></TR></THead>
            <TBody>
              {(pending as Row[]).map((t) => (
                <TR key={t.id}>
                  <TD><p className="font-medium">{t.profiles?.full_name}</p><p className="text-xs text-muted-foreground">{t.profiles?.membership_id} · dihantar {formatDateTime(t.created_at)}</p></TD>
                  <TD>{formatDate(t.payment_date)}</TD>
                  <TD>
                    <span className="font-mono text-xs">{t.transaction_ref}</span>
                    {t.duplicate_flag && <div className="mt-1"><Badge tone="danger">Disyaki pendua</Badge><p className="text-xs text-danger">{t.duplicate_reason}</p></div>}
                  </TD>
                  <TD className="text-right font-semibold tabular-nums">{formatRM(t.amount_sen)}</TD>
                  <TD><FileLink path={t.receipt_path} /></TD>
                  <TD><ShareReviewForm id={t.id} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={PiggyBank} title="Tiada bayaran menunggu" />}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Pelarasan modal saham</CardTitle><CardDescription>Untuk pembetulan. Transaksi diluluskan tidak boleh diubah atau dipadam.</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={createShareAdjustmentAction} className="space-y-3" resetOnSuccess>
              <IdempotencyKey />
              <FormField label="Ahli" htmlFor="member_id" required>
                <Select id="member_id" name="member_id" defaultValue="">
                  <option value="" disabled>Pilih ahli</option>
                  {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.full_name} ({m.membership_id})</option>)}
                </Select>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Arah" htmlFor="direction"><Select id="direction" name="direction"><option value="credit">Tambah (+)</option><option value="debit">Tolak (−)</option></Select></FormField>
                <FormField label="Jumlah (RM)" htmlFor="amount" required><Input id="amount" name="amount" inputMode="decimal" /></FormField>
              </div>
              <FormField label="ID transaksi asal (pilihan)" htmlFor="adjusts_id"><Input id="adjusts_id" name="adjusts_id" placeholder="UUID" /></FormField>
              <FormField label="Sebab" htmlFor="reason" required><Textarea id="reason" name="reason" rows={2} /></FormField>
              <SubmitButton className="w-full">Rekod pelarasan</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Baki modal saham tertinggi</CardTitle></CardHeader>
          <CardContent>
            {balances?.length ? (
              <ul className="divide-y text-sm">
                {balances.map((b) => (
                  <li key={b.member_id} className="flex justify-between py-2">
                    <Link href={`/admin/ahli/${b.member_id}`} className="hover:underline">{b.full_name} <span className="text-xs text-muted-foreground">{b.membership_id}</span></Link>
                    <strong className="tabular-nums">{formatRM(b.approved_sen)}</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Belum ada modal saham diluluskan.</p>}
          </CardContent>
        </Card>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="font-semibold">Semua transaksi</h2>
        <SearchBar q={q} placeholder="Cari rujukan transaksi"
          filters={[{ name: "status", value: status, label: "Status", options: Object.entries(REVIEW_STATUS).filter(([k]) => k !== "verified").map(([k, v]) => [k, v.label]) }]} />
        <Table>
          <THead><TR><TH>Tarikh</TH><TH>Ahli</TH><TH>Jenis</TH><TH>Rujukan / sebab</TH><TH className="text-right">Jumlah</TH><TH>Status</TH></TR></THead>
          <TBody>
            {((all ?? []) as Row[]).map((t) => (
              <TR key={t.id}>
                <TD>{formatDate(t.payment_date ?? t.created_at)}</TD>
                <TD>{t.profiles?.full_name}</TD>
                <TD>{t.txn_type === "payment" ? "Bayaran" : <Badge tone="info">Pelarasan</Badge>}</TD>
                <TD className="max-w-xs text-xs"><span className="font-mono">{t.transaction_ref ?? ""}</span> {t.reason}{t.review_notes && <p className="text-muted-foreground">{t.review_notes}</p>}</TD>
                <TD className={`text-right font-semibold tabular-nums ${t.amount_sen < 0 ? "text-danger" : ""}`}>{formatRM(t.amount_sen)}</TD>
                <TD><StatusBadge map={REVIEW_STATUS} value={t.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>
    </>
  );
}
