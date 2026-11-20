import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2Off } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ShareDocument } from "@/components/share-document";
import { QuoteEditor } from "@/features/business/quote-editor";
import { ShareLinkControls } from "@/features/business/invoice-actions";
import { ConvertQuoteButton, DeleteQuoteDraftForm, DuplicateQuoteButton, QuoteStatusButton } from "@/features/business/quote-actions";
import { displayQuoteStatus } from "@/features/business/totals";
import type { CustomerLite } from "@/features/business/customer-match";
import type { CatalogOption } from "@/features/business/line-items";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM, todayKL } from "@/lib/format";
import { QUOTE_STATUS } from "@/lib/labels";

export const metadata = { title: "Sebut Harga" };

type Quote = {
  id: string; business_id: string; customer_id: string; quote_no: string | null; status: string; issue_date: string; valid_until: string;
  scope: string | null; terms: string | null; subtotal_sen: number; discount_sen: number; tax_rate_bp: number; tax_sen: number; total_sen: number;
  share_token: string | null; share_enabled: boolean; converted_invoice_id: string | null;
  customer_snapshot: { name: string; phone: string | null } | null;
};
type Item = { description: string; quantity: number; unit_price_sen: number; discount_sen: number; line_total_sen: number };

const daysLeft = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dikeluarkan?: string }> }) {
  await requireActiveMember();
  const { id } = await params;
  const { dikeluarkan } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("business_quotes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const q = data as Quote;
  const [{ data: items }, { data: business }, { data: customers }, { data: invoice }] = await Promise.all([
    supabase.from("business_quote_items").select("description, quantity, unit_price_sen, discount_sen, line_total_sen").eq("quote_id", id).order("position"),
    supabase.from("business_profiles").select("name, sst_enabled, sst_rate_bp, suspended_at").eq("id", q.business_id).single(),
    supabase.from("business_customers").select("id, name, phone").eq("business_id", q.business_id).order("name"),
    q.converted_invoice_id
      ? supabase.from("business_invoices").select("id, invoice_no, status").eq("id", q.converted_invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const its = (items ?? []) as Item[];
  const suspended = Boolean(business?.suspended_at);
  const today = todayKL();

  if (q.status === "draft") {
    const { data: catalog } = await supabase.from("business_catalog_items").select("id, name, price_sen").eq("business_id", q.business_id).eq("active", true).order("name");
    return (
      <>
        <Link href="/ahli/bisnes?tab=sebut-harga" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Bisnes Saya</Link>
        <PageHeader title="Draf sebut harga" description={<StatusBadge map={QUOTE_STATUS} value="draft" />} actions={<DeleteQuoteDraftForm id={q.id} />} />
        {suspended ? <Alert tone="danger">Modul Bisnes anda digantung.</Alert> : (
          <QuoteEditor customers={(customers ?? []) as CustomerLite[]} catalog={(catalog ?? []) as CatalogOption[]}
            taxRateBp={business?.sst_enabled ? business.sst_rate_bp : 0}
            draft={{ id: q.id, customer_id: q.customer_id, issue_date: q.issue_date, valid_until: q.valid_until, scope: q.scope, terms: q.terms, items: its }} />
        )}
      </>
    );
  }

  const status = displayQuoteStatus(q.status, q.valid_until, today);
  const custName = q.customer_snapshot?.name ?? "";
  const left = daysLeft(today, q.valid_until);
  const msg = `Salam ${custName}, berikut sebut harga ${q.quote_no} berjumlah ${formatRM(q.total_sen)} daripada ${business?.name}. Sah sehingga ${formatDate(q.valid_until)}.`;
  const inv = invoice as { id: string; invoice_no: string | null; status: string } | null;

  return (
    <>
      <Link href="/ahli/bisnes?tab=sebut-harga" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Bisnes Saya</Link>
      <PageHeader title={q.quote_no ?? "Sebut harga"} description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {custName} <StatusBadge map={QUOTE_STATUS} value={status} />
          <span className="text-xs text-muted-foreground">Sah sehingga {formatDate(q.valid_until)}{q.status === "sent" && left >= 0 ? ` · ${left} hari lagi` : ""}</span>
        </span>
      } />
      {dikeluarkan && <Alert tone="success" title="Sebut harga dikeluarkan" className="mb-6">Kongsi sebut harga kepada pelanggan menggunakan butang di bawah.</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Kongsi sebut harga</CardTitle><CardDescription>Butang <strong>Kongsi PDF</strong> membuka menu kongsi telefon dengan PDF dilampirkan.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <ShareDocument pdfUrl={`/api/bisnes/dokumen?jenis=quote&id=${q.id}`} fileName={`SebutHarga-${q.quote_no}.pdf`}
                title={`Sebut harga ${q.quote_no}`} message={msg} publicPath={q.share_enabled && q.share_token ? `/d/${q.share_token}` : null} phone={q.customer_snapshot?.phone ?? null} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">{q.share_enabled ? "Pautan pelanggan aktif" : <><Link2Off className="size-3.5" /> Pautan pelanggan dimatikan</>}</span>
                {!suspended && <ShareLinkControls kind="quote" id={q.id} enabled={q.share_enabled} />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Butiran</CardTitle><CardDescription>Tarikh {formatDate(q.issue_date)} · Sah sehingga {formatDate(q.valid_until)}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {q.scope && <div className="rounded-lg border p-3 text-sm"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Skop kerja</p><p className="whitespace-pre-line">{q.scope}</p></div>}
              <Table>
                <THead><TR><TH className="w-10">No.</TH><TH>Perkara</TH><TH className="text-right">Unit</TH><TH className="text-right">Harga</TH><TH className="text-right">Jumlah</TH></TR></THead>
                <TBody>
                  {its.map((it, i) => (
                    <TR key={i}>
                      <TD className="text-muted-foreground tabular-nums">{i + 1}</TD>
                      <TD>{it.description}</TD>
                      <TD className="text-right">{Number(it.quantity)}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{formatRM(it.unit_price_sen)}</TD>
                      <TD className="whitespace-nowrap text-right font-semibold tabular-nums">{formatRM(it.line_total_sen)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subjumlah</dt><dd>{formatRM(q.subtotal_sen)}</dd></div>
                {Number(q.discount_sen) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Diskaun</dt><dd>-{formatRM(q.discount_sen)}</dd></div>}
                {Number(q.tax_sen) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">SST ({q.tax_rate_bp / 100}%)</dt><dd>{formatRM(q.tax_sen)}</dd></div>}
                <div className="flex justify-between border-t pt-1 text-base font-bold"><dt>Jumlah</dt><dd>{formatRM(q.total_sen)}</dd></div>
              </dl>
              {q.terms && <div className="rounded-lg bg-muted p-3 text-sm"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terma &amp; syarat</p><p className="whitespace-pre-line">{q.terms}</p></div>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {q.status === "converted" && inv ? (
            <Card>
              <CardHeader><CardTitle>Sudah ditukar ke invois</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>Invois: <Link href={`/ahli/bisnes/invois/${inv.id}`} className="font-mono font-semibold text-primary hover:underline">{inv.invoice_no ?? "Draf invois"}</Link></p>
                <p className="text-xs text-muted-foreground">Rekod deposit dan baki sebagai bayaran pada invois itu. Setiap bayaran mendapat resit sendiri.</p>
              </CardContent>
            </Card>
          ) : !suspended && (
            <Card>
              <CardHeader><CardTitle>Jawapan pelanggan</CardTitle><CardDescription>Item, skop kerja dan terma disalin terus ke invois baharu.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {q.status !== "rejected" && <ConvertQuoteButton id={q.id} />}
                <div className="grid grid-cols-2 gap-2">
                  {q.status === "rejected" ? <QuoteStatusButton id={q.id} status="accepted" /> : <QuoteStatusButton id={q.id} status="rejected" />}
                  <DuplicateQuoteButton id={q.id} />
                </div>
                {q.status === "sent" && <div className="pt-1"><QuoteStatusButton id={q.id} status="accepted" /></div>}
                <p className="pt-1 text-xs text-muted-foreground">Sebut harga yang dikeluarkan tidak boleh diubah. Gunakan <strong>Salin &amp; ubah</strong> untuk buat versi baharu.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
