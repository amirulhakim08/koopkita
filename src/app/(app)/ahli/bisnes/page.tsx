import Link from "next/link";
import { AlertTriangle, BookOpen, CircleDollarSign, Clock, FileText, Plus, Receipt, Store, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { BusinessProfileForm, type BusinessRow } from "@/features/business/profile-form";
import { CustomerForm, DeleteCustomerButton, type CustomerRow } from "@/features/business/customer-forms";
import { CatalogActiveButton, CatalogDeleteButton, CatalogItemForm, type CatalogItem } from "@/features/business/catalog-forms";
import { displayStatus } from "@/features/business/totals";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM, todayKL } from "@/lib/format";
import { INVOICE_STATUS, PAYMENT_METHODS } from "@/lib/labels";
import { logoUrl } from "@/lib/storage-url";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bisnes Saya" };

const TABS = [
  ["invois", "Invois", FileText],
  ["resit", "Resit", Receipt],
  ["katalog", "Katalog", BookOpen],
  ["pelanggan", "Pelanggan", Users],
  ["profil", "Profil", Store],
] as const;

type InvoiceRow = { id: string; invoice_no: string | null; status: string; issue_date: string; due_date: string; total_sen: number; paid_sen: number; business_customers: { name: string } | null };
type PaymentRow = { id: string; receipt_no: string; amount_sen: number; paid_on: string; method: string; reversed_at: string | null; invoice_id: string; business_invoices: { invoice_no: string | null; is_direct: boolean; customer_snapshot: { name: string } } | null };

export default async function BusinessPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const { userId } = await requireActiveMember();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: bizData } = await supabase.from("business_profiles").select("*").eq("owner_id", userId).maybeSingle();
  const business = bizData as BusinessRow | null;
  const tab = (TABS.some(([k]) => k === sp.tab) ? sp.tab : business ? "invois" : "profil") as (typeof TABS)[number][0];
  const today = todayKL();

  const [{ data: invoices }, { data: payments }, { data: customers }, { data: catalogData }] = business
    ? await Promise.all([
        supabase.from("business_invoices").select("id, invoice_no, status, issue_date, due_date, total_sen, paid_sen, business_customers(name)").eq("business_id", business.id).eq("is_direct", false).order("created_at", { ascending: false }).limit(500),
        supabase.from("business_payments").select("id, receipt_no, amount_sen, paid_on, method, reversed_at, invoice_id, business_invoices(invoice_no, is_direct, customer_snapshot)").eq("business_id", business.id).order("created_at", { ascending: false }).limit(500),
        supabase.from("business_customers").select("id, name, phone, email, address").eq("business_id", business.id).order("name"),
        supabase.from("business_catalog_items").select("id, name, price_sen, active").eq("business_id", business.id).order("active", { ascending: false }).order("name"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const catalog = (catalogData ?? []) as CatalogItem[];

  const inv = (invoices ?? []) as unknown as InvoiceRow[];
  const pays = (payments ?? []) as unknown as PaymentRow[];
  const month = today.slice(0, 7);
  const receivedMonth = pays.filter((p) => !p.reversed_at && p.paid_on.startsWith(month)).reduce((a, p) => a + Number(p.amount_sen), 0);
  const open = inv.filter((i) => i.status === "issued" || i.status === "partially_paid");
  const unpaid = open.reduce((a, i) => a + Number(i.total_sen) - Number(i.paid_sen), 0);
  const overdue = open.filter((i) => i.due_date < today);
  const overdueSen = overdue.reduce((a, i) => a + Number(i.total_sen) - Number(i.paid_sen), 0);
  const statusFilter = sp.status && sp.status in INVOICE_STATUS ? sp.status : undefined;
  const shownInvoices = inv.filter((i) => !statusFilter || displayStatus(i.status, i.due_date, today) === statusFilter);
  const logo = logoUrl(business?.logo_path);

  return (
    <>
      <PageHeader
        title="Bisnes Saya"
        description={business ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <img src={logo} alt="" className="size-6 rounded object-contain" />}
            {business.name}
            {business.ssm_verified_at ? <Badge tone="success">✓ SSM disahkan</Badge> : business.ssm_no ? <Badge tone="warning">SSM belum disahkan</Badge> : null}
          </span>
        ) : "Urus invois dan resit untuk bisnes anda."}
        actions={business && !business.suspended_at ? (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button asChild size="lg" variant="outline"><Link href="/ahli/bisnes/resit/baharu"><Receipt /> Resit Baharu</Link></Button>
            <Button asChild size="lg"><Link href="/ahli/bisnes/invois/baharu"><Plus /> Invois Baharu</Link></Button>
          </div>
        ) : undefined}
      />

      {business?.suspended_at && (
        <Alert tone="danger" title="Modul Bisnes digantung" className="mb-6">
          Anda tidak boleh mengeluarkan invois atau resit baharu. Sebab: {business.suspend_reason}. Hubungi pejabat koperasi.
        </Alert>
      )}
      {!business && (
        <Alert tone="info" title="Mulakan dengan Profil Bisnes" className="mb-6">
          Isi maklumat syarikat dan logo anda. Maklumat ini akan dipaparkan pada setiap invois dan resit.
        </Alert>
      )}

      {business && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <StatCard emphasis label={`Diterima (${new Intl.DateTimeFormat("ms-MY", { month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(`${month}-15T00:00:00Z`))})`} value={formatRM(receivedMonth)} icon={CircleDollarSign} />
          <StatCard label="Belum dibayar" value={formatRM(unpaid)} icon={Clock} hint={`${open.length} invois`} />
          <StatCard label="Lewat bayar" value={<span className={overdueSen ? "text-danger" : ""}>{formatRM(overdueSen)}</span>} icon={AlertTriangle} hint={`${overdue.length} invois`} />
        </div>
      )}

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b" aria-label="Bahagian Bisnes Saya">
        {TABS.map(([key, label, Icon]) => (
          <Link key={key} href={`/ahli/bisnes?tab=${key}`} aria-current={tab === key ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </nav>

      {tab === "profil" && (
        <Card className="max-w-3xl">
          <CardHeader><CardTitle>Profil bisnes</CardTitle><CardDescription>Dipaparkan pada invois dan resit. Super Admin boleh mengesahkan nombor SSM anda.</CardDescription></CardHeader>
          <CardContent><BusinessProfileForm userId={userId} business={business} /></CardContent>
        </Card>
      )}

      {tab === "katalog" && business && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Tambah produk / servis</CardTitle>
              <CardDescription>Item dalam katalog boleh dipilih terus semasa membuat invois atau resit. Anda sahkan harga setiap kali.</CardDescription>
            </CardHeader>
            <CardContent>{business.suspended_at ? <p className="text-sm text-muted-foreground">Modul Bisnes digantung.</p> : <CatalogItemForm />}</CardContent>
          </Card>
          <div className="space-y-3 lg:col-span-3">
            {catalog.length ? (
              <>
                {[["Dijual", catalog.filter((c) => c.active)], ["Disembunyikan", catalog.filter((c) => !c.active)]].map(([heading, list]) =>
                  (list as CatalogItem[]).length ? (
                    <section key={heading as string} className="space-y-2" aria-label={`Katalog ${heading as string}`}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {heading as string} ({(list as CatalogItem[]).length})
                        {heading === "Disembunyikan" && <span className="ml-1 font-normal normal-case tracking-normal">— tidak dipaparkan semasa memilih item</span>}
                      </h3>
                      {(list as CatalogItem[]).map((c) => (
                        <div key={c.id} className="rounded-xl border bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                            <div className="min-w-0">
                              <p className={cn("font-semibold", !c.active && "text-muted-foreground")}>{c.name}</p>
                              <p className="text-sm tabular-nums text-muted-foreground">{formatRM(c.price_sen)}</p>
                            </div>
                            {!business.suspended_at && (
                              <div className="flex flex-wrap items-center gap-1">
                                <CatalogActiveButton id={c.id} active={c.active} name={c.name} />
                                <CatalogDeleteButton id={c.id} name={c.name} />
                              </div>
                            )}
                          </div>
                          {!business.suspended_at && (
                            <details className="border-t">
                              <summary className="cursor-pointer list-none px-4 py-2 text-xs font-semibold text-primary">Ubah nama / harga</summary>
                              <div className="px-4 pb-4"><CatalogItemForm item={c} /></div>
                            </details>
                          )}
                        </div>
                      ))}
                    </section>
                  ) : null,
                )}
              </>
            ) : <EmptyState icon={BookOpen} title="Katalog masih kosong" description="Senaraikan produk atau servis anda berserta harga biasa supaya mudah dipilih semasa membuat invois dan resit." />}
          </div>
        </div>
      )}

      {tab === "pelanggan" && business && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Pelanggan baharu</CardTitle></CardHeader>
            <CardContent><CustomerForm /></CardContent>
          </Card>
          <div className="space-y-3 lg:col-span-3">
            {(customers as CustomerRow[] | null)?.length ? (customers as CustomerRow[]).map((c) => (
              <details key={c.id} className="rounded-xl border bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                  <span><span className="font-semibold">{c.name}</span><span className="block text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ") || "Tiada maklumat hubungan"}</span></span>
                  <span className="text-xs font-semibold text-primary">Ubah</span>
                </summary>
                <div className="space-y-3 border-t p-4">
                  <CustomerForm customer={c} />
                  <DeleteCustomerButton id={c.id} />
                </div>
              </details>
            )) : <EmptyState icon={Users} title="Belum ada pelanggan" description="Pelanggan juga boleh ditambah terus semasa membuat invois atau resit." />}
          </div>
        </div>
      )}

      {tab === "invois" && business && (
        <div className="space-y-3">
          <form className="flex flex-wrap gap-2 text-sm">
            <input type="hidden" name="tab" value="invois" />
            {[["", "Semua"], ["draft", "Draf"], ["issued", "Dikeluarkan"], ["partially_paid", "Separa"], ["overdue", "Lewat"], ["paid", "Dibayar"], ["cancelled", "Dibatalkan"]].map(([v, l]) => (
              <Link key={v} href={`/ahli/bisnes?tab=invois${v ? `&status=${v}` : ""}`}
                className={cn("rounded-full border px-3 py-1", (statusFilter ?? "") === v ? "border-primary bg-primary text-primary-foreground" : "bg-white hover:bg-muted")}>{l}</Link>
            ))}
          </form>
          {shownInvoices.length ? (
            <Table>
              <THead><TR><TH>No.</TH><TH>Pelanggan</TH><TH>Tarikh</TH><TH>Tarikh akhir</TH><TH className="text-right">Jumlah</TH><TH className="text-right">Baki</TH><TH>Status</TH></TR></THead>
              <TBody>
                {shownInvoices.map((i) => (
                  <TR key={i.id}>
                    <TD className="whitespace-nowrap"><Link href={`/ahli/bisnes/invois/${i.id}`} className="font-mono text-xs font-medium text-primary hover:underline">{i.invoice_no ?? "Draf"}</Link></TD>
                    <TD>{i.business_customers?.name}</TD>
                    <TD className="text-xs">{formatDate(i.issue_date)}</TD>
                    <TD className="text-xs">{formatDate(i.due_date)}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatRM(i.total_sen)}</TD>
                    <TD className="text-right tabular-nums">{i.status === "cancelled" || i.status === "draft" ? "-" : formatRM(Number(i.total_sen) - Number(i.paid_sen))}</TD>
                    <TD><StatusBadge map={INVOICE_STATUS} value={displayStatus(i.status, i.due_date, today)} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState icon={FileText} title="Tiada invois" description="Invois yang anda buat akan dipaparkan di sini."
              action={!business.suspended_at ? <Button asChild><Link href="/ahli/bisnes/invois/baharu"><Plus /> Invois Baharu</Link></Button> : undefined} />}
        </div>
      )}

      {tab === "resit" && business && (
        <div className="space-y-3">
          {!business.suspended_at && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm">
              <span className="text-muted-foreground">Jualan dibayar terus? Jana resit tanpa invois.</span>
              <Button asChild size="sm"><Link href="/ahli/bisnes/resit/baharu"><Plus /> Resit Jualan Langsung</Link></Button>
            </div>
          )}
          {pays.length ? (
            <Table>
              <THead><TR><TH>No. Resit</TH><TH>Untuk</TH><TH>Pelanggan</TH><TH>Tarikh</TH><TH>Kaedah</TH><TH className="text-right">Jumlah</TH><TH /></TR></THead>
              <TBody>
                {pays.map((p) => (
                  <TR key={p.id} className={p.reversed_at ? "opacity-60" : undefined}>
                    <TD className="whitespace-nowrap font-mono text-xs"><Link href={`/ahli/bisnes/resit/${p.id}`} className="text-primary hover:underline">{p.receipt_no}</Link>{p.reversed_at && <Badge tone="danger" className="ml-2">Dibalikkan</Badge>}</TD>
                    <TD>{p.business_invoices?.is_direct
                      ? <span className="text-xs text-muted-foreground">Jualan langsung</span>
                      : <Link href={`/ahli/bisnes/invois/${p.invoice_id}`} className="whitespace-nowrap font-mono text-xs text-primary hover:underline">{p.business_invoices?.invoice_no}</Link>}</TD>
                    <TD>{p.business_invoices?.customer_snapshot?.name}</TD>
                    <TD className="text-xs">{formatDate(p.paid_on)}</TD>
                    <TD className="text-xs">{PAYMENT_METHODS[p.method] ?? p.method}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatRM(p.amount_sen)}</TD>
                    <TD><Link href={`/ahli/bisnes/resit/${p.id}`} className="text-xs font-semibold text-primary hover:underline">Kongsi</Link></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState icon={Receipt} title="Belum ada resit" description="Jana resit jualan langsung, atau rekod bayaran pada invois untuk menjana resit secara automatik." />}
        </div>
      )}

      {tab !== "profil" && !business && (
        <EmptyState icon={Store} title="Profil bisnes belum diisi" action={<Button asChild><Link href="/ahli/bisnes?tab=profil">Isi profil bisnes</Link></Button>} />
      )}
    </>
  );
}
