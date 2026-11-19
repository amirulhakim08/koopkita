import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Link2Off } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ShareDocument } from "@/components/share-document";
import { InvoiceEditor } from "@/features/business/invoice-editor";
import { CancelInvoiceForm, DeleteDraftForm, RecordPaymentForm, ReversePaymentForm, ShareLinkControls } from "@/features/business/invoice-actions";
import { displayStatus } from "@/features/business/totals";
import type { CustomerRow } from "@/features/business/customer-forms";
import type { CatalogOption } from "@/features/business/line-items";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM, todayKL } from "@/lib/format";
import { INVOICE_STATUS, PAYMENT_METHODS } from "@/lib/labels";

export const metadata = { title: "Invois" };

type Inv = {
  id: string; business_id: string; customer_id: string; invoice_no: string | null; status: string; issue_date: string; due_date: string;
  subtotal_sen: number; discount_sen: number; tax_rate_bp: number; tax_sen: number; total_sen: number; paid_sen: number;
  notes: string | null; share_token: string | null; share_enabled: boolean; cancel_reason: string | null;
  customer_snapshot: { name: string; phone: string | null } | null; is_direct: boolean;
};
type Item = { description: string; quantity: number; unit_price_sen: number; discount_sen: number; line_total_sen: number };
type Pay = { id: string; receipt_no: string; amount_sen: number; paid_on: string; method: string; reference: string | null; share_token: string; share_enabled: boolean; reversed_at: string | null; reverse_reason: string | null };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dikeluarkan?: string }> }) {
  const { userId } = await requireActiveMember();
  const { id } = await params;
  const { dikeluarkan } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("business_invoices").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const inv = data as Inv;
  if (inv.is_direct) {
    // a direct sale has no invoice page of its own: show its receipt
    const { data: pay } = await supabase.from("business_payments").select("id").eq("invoice_id", id).limit(1).maybeSingle();
    if (pay) redirect(`/ahli/bisnes/resit/${pay.id}`);
    notFound();
  }
  const [{ data: items }, { data: pays }, { data: business }, { data: customers }] = await Promise.all([
    supabase.from("business_invoice_items").select("*").eq("invoice_id", id).order("position"),
    supabase.from("business_payments").select("*").eq("invoice_id", id).order("created_at"),
    supabase.from("business_profiles").select("name, sst_enabled, sst_rate_bp, suspended_at").eq("id", inv.business_id).single(),
    supabase.from("business_customers").select("id, name, phone, email, address").eq("business_id", inv.business_id).order("name"),
  ]);
  const { data: catalog } = inv.status === "draft"
    ? await supabase.from("business_catalog_items").select("id, name, price_sen").eq("business_id", inv.business_id).eq("active", true).order("name")
    : { data: [] };
  const its = (items ?? []) as Item[];
  const payments = (pays ?? []) as Pay[];
  const today = todayKL();
  const status = displayStatus(inv.status, inv.due_date, today);
  const balance = Number(inv.total_sen) - Number(inv.paid_sen);
  const suspended = Boolean(business?.suspended_at);
  const customer = (customers as CustomerRow[] | null)?.find((c) => c.id === inv.customer_id);
  const custName = inv.customer_snapshot?.name ?? customer?.name ?? "";
  const custPhone = inv.customer_snapshot?.phone ?? customer?.phone ?? null;

  if (inv.status === "draft") {
    return (
      <>
        <Link href="/ahli/bisnes" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Bisnes Saya</Link>
        <PageHeader title="Draf invois" description={<StatusBadge map={INVOICE_STATUS} value="draft" />} actions={<DeleteDraftForm invoiceId={inv.id} />} />
        {suspended ? <Alert tone="danger">Modul Bisnes anda digantung.</Alert> : (
          <InvoiceEditor customers={(customers ?? []) as CustomerRow[]} catalog={(catalog ?? []) as CatalogOption[]} taxRateBp={business?.sst_enabled ? business.sst_rate_bp : 0}
            draft={{ id: inv.id, customer_id: inv.customer_id, issue_date: inv.issue_date, due_date: inv.due_date, notes: inv.notes, items: its }} />
        )}
      </>
    );
  }

  const invMsg = `Salam ${custName}, berikut invois ${inv.invoice_no} berjumlah ${formatRM(inv.total_sen)} daripada ${business?.name}. Tarikh akhir bayaran: ${formatDate(inv.due_date)}.`;

  return (
    <>
      <Link href="/ahli/bisnes" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Bisnes Saya</Link>
      <PageHeader title={inv.invoice_no ?? "Invois"} description={<span className="inline-flex items-center gap-2">{custName} <StatusBadge map={INVOICE_STATUS} value={status} /></span>} />
      {dikeluarkan && <Alert tone="success" title="Invois dikeluarkan" className="mb-6">Kongsi invois kepada pelanggan menggunakan butang di bawah.</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Kongsi invois</CardTitle><CardDescription>Butang <strong>Kongsi PDF</strong> membuka menu kongsi telefon (WhatsApp, e-mel dan lain-lain) dengan PDF dilampirkan.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <ShareDocument pdfUrl={`/api/bisnes/dokumen?jenis=invoice&id=${inv.id}`} fileName={`Invois-${inv.invoice_no}.pdf`}
                title={`Invois ${inv.invoice_no}`} message={invMsg} publicPath={inv.share_enabled && inv.share_token ? `/d/${inv.share_token}` : null} phone={custPhone} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">{inv.share_enabled ? "Pautan pelanggan aktif" : <><Link2Off className="size-3.5" /> Pautan pelanggan dimatikan</>}</span>
                {!suspended && <ShareLinkControls kind="invoice" id={inv.id} enabled={inv.share_enabled} />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Butiran</CardTitle><CardDescription>Tarikh {formatDate(inv.issue_date)} · Tarikh akhir {formatDate(inv.due_date)}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <THead><TR><TH>Perkara</TH><TH className="text-right">Unit</TH><TH className="text-right">Harga</TH><TH className="text-right">Diskaun</TH><TH className="text-right">Jumlah</TH></TR></THead>
                <TBody>
                  {its.map((it, i) => (
                    <TR key={i}>
                      <TD>{it.description}</TD>
                      <TD className="text-right">{Number(it.quantity)}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{formatRM(it.unit_price_sen)}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{Number(it.discount_sen) ? formatRM(it.discount_sen) : "-"}</TD>
                      <TD className="whitespace-nowrap text-right font-semibold tabular-nums">{formatRM(it.line_total_sen)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subjumlah</dt><dd>{formatRM(inv.subtotal_sen)}</dd></div>
                {Number(inv.discount_sen) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Diskaun</dt><dd>-{formatRM(inv.discount_sen)}</dd></div>}
                {Number(inv.tax_sen) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">SST ({inv.tax_rate_bp / 100}%)</dt><dd>{formatRM(inv.tax_sen)}</dd></div>}
                <div className="flex justify-between border-t pt-1 text-base font-bold"><dt>Jumlah</dt><dd>{formatRM(inv.total_sen)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Dibayar</dt><dd>{formatRM(inv.paid_sen)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Baki</dt><dd>{formatRM(Math.max(0, balance))}</dd></div>
              </dl>
              {inv.notes && <p className="rounded-lg bg-muted p-3 text-sm">{inv.notes}</p>}
              {inv.status === "cancelled" && <Alert tone="danger" title="Invois dibatalkan">{inv.cancel_reason}</Alert>}
            </CardContent>
          </Card>

          <section id="resit" className="space-y-3">
            <h2 className="font-semibold">Resit ({payments.length})</h2>
            {payments.length ? payments.map((p) => (
              <Card key={p.id} className={p.reversed_at ? "opacity-70" : undefined}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold">{p.receipt_no} {p.reversed_at && <Badge tone="danger">Dibalikkan</Badge>}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.paid_on)} · {PAYMENT_METHODS[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</p>
                      {p.reverse_reason && <p className="text-xs text-danger">Sebab: {p.reverse_reason}</p>}
                    </div>
                    <p className="text-lg font-bold tabular-nums">{formatRM(p.amount_sen)}</p>
                  </div>
                  <ShareDocument compact pdfUrl={`/api/bisnes/dokumen?jenis=receipt&id=${p.id}`} fileName={`Resit-${p.receipt_no}.pdf`}
                    title={`Resit ${p.receipt_no}`} phone={custPhone}
                    message={`Terima kasih ${custName}. Resit ${p.receipt_no} bagi bayaran ${formatRM(p.amount_sen)} untuk invois ${inv.invoice_no} daripada ${business?.name}.`}
                    publicPath={p.share_enabled ? `/d/${p.share_token}` : null} />
                  {!p.reversed_at && !suspended && <ReversePaymentForm paymentId={p.id} />}
                </CardContent>
              </Card>
            )) : <p className="text-sm text-muted-foreground">Belum ada bayaran direkodkan.</p>}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {(inv.status === "issued" || inv.status === "partially_paid") && !suspended && (
            <Card>
              <CardHeader><CardTitle>Rekod bayaran</CardTitle><CardDescription>Resit dijana secara automatik. Bayaran separa dibenarkan.</CardDescription></CardHeader>
              <CardContent><RecordPaymentForm invoiceId={inv.id} balanceSen={balance} userId={userId} /></CardContent>
            </Card>
          )}
          {inv.status !== "cancelled" && !suspended && (
            <Card>
              <CardHeader><CardTitle>Batal invois</CardTitle><CardDescription>Invois yang dikeluarkan tidak boleh diubah. Batalkan dan buat invois baharu jika ada kesilapan. Balikkan semua resit dahulu jika sudah ada bayaran.</CardDescription></CardHeader>
              <CardContent><CancelInvoiceForm invoiceId={inv.id} /></CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
