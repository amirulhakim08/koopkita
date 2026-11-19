import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2Off } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ShareDocument } from "@/components/share-document";
import { ReversePaymentForm, ShareLinkControls } from "@/features/business/invoice-actions";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";

export const metadata = { title: "Resit" };

type Pay = {
  id: string; invoice_id: string; business_id: string; receipt_no: string; amount_sen: number; paid_on: string; method: string;
  reference: string | null; share_token: string; share_enabled: boolean; reversed_at: string | null; reverse_reason: string | null; created_at: string;
};
type Inv = {
  id: string; invoice_no: string | null; is_direct: boolean; subtotal_sen: number; discount_sen: number; tax_rate_bp: number; tax_sen: number;
  total_sen: number; notes: string | null; customer_snapshot: { name: string; phone: string | null } | null;
};
type Item = { description: string; quantity: number; unit_price_sen: number; discount_sen: number; line_total_sen: number };

/** One receipt: a direct-sale receipt (with its items) or a payment receipt of an invoice. */
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dijana?: string }> }) {
  await requireActiveMember();
  const { id } = await params;
  const { dijana } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("business_payments").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Pay;
  const [{ data: invData }, { data: items }, { data: business }, { data: siblings }] = await Promise.all([
    supabase.from("business_invoices").select("id, invoice_no, is_direct, subtotal_sen, discount_sen, tax_rate_bp, tax_sen, total_sen, notes, customer_snapshot").eq("id", p.invoice_id).single(),
    supabase.from("business_invoice_items").select("description, quantity, unit_price_sen, discount_sen, line_total_sen").eq("invoice_id", p.invoice_id).order("position"),
    supabase.from("business_profiles").select("name, suspended_at").eq("id", p.business_id).single(),
    supabase.from("business_payments").select("id, amount_sen, created_at, reversed_at").eq("invoice_id", p.invoice_id),
  ]);
  const inv = invData as Inv;
  const its = (items ?? []) as Item[];
  // valid payments of the same invoice up to and including this receipt (same order as the database uses)
  const upTo = ((siblings ?? []) as { id: string; amount_sen: number; created_at: string; reversed_at: string | null }[])
    .filter((x) => !x.reversed_at && (x.created_at < p.created_at || (x.created_at === p.created_at && x.id <= p.id)));
  const paidThrough = upTo.reduce((a, x) => a + Number(x.amount_sen), 0);
  const paidBefore = p.reversed_at ? paidThrough : paidThrough - Number(p.amount_sen);
  const balanceAfter = Math.max(0, Number(inv.total_sen) - paidThrough);
  const suspended = Boolean(business?.suspended_at);
  const custName = inv.customer_snapshot?.name ?? "";
  const custPhone = inv.customer_snapshot?.phone ?? null;
  const message = inv.is_direct
    ? `Terima kasih ${custName}. Resit ${p.receipt_no} berjumlah ${formatRM(p.amount_sen)} daripada ${business?.name}.`
    : `Terima kasih ${custName}. Resit ${p.receipt_no} bagi bayaran ${formatRM(p.amount_sen)} untuk invois ${inv.invoice_no} daripada ${business?.name}.`;

  return (
    <>
      <Link href="/ahli/bisnes?tab=resit" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Bisnes Saya</Link>
      <PageHeader title={p.receipt_no} description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {custName}
          {p.reversed_at ? <Badge tone="danger">Dibalikkan</Badge> : <Badge tone="success">Dibayar</Badge>}
          {inv.is_direct ? <Badge>Jualan langsung</Badge> : <Link href={`/ahli/bisnes/invois/${inv.id}`} className="text-xs font-semibold text-primary hover:underline">Invois {inv.invoice_no}</Link>}
        </span>
      } />
      {dijana && <Alert tone="success" title="Resit dijana" className="mb-6">Kongsi resit kepada pelanggan menggunakan butang di bawah.</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Kongsi resit</CardTitle><CardDescription>Butang <strong>Kongsi PDF</strong> membuka menu kongsi telefon (WhatsApp, e-mel dan lain-lain) dengan PDF dilampirkan.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <ShareDocument pdfUrl={`/api/bisnes/dokumen?jenis=receipt&id=${p.id}`} fileName={`Resit-${p.receipt_no}.pdf`}
                title={`Resit ${p.receipt_no}`} message={message} publicPath={p.share_enabled ? `/d/${p.share_token}` : null} phone={custPhone} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">{p.share_enabled ? "Pautan pelanggan aktif" : <><Link2Off className="size-3.5" /> Pautan pelanggan dimatikan</>}</span>
                {!suspended && <ShareLinkControls kind="receipt" id={p.id} enabled={p.share_enabled} />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Butiran</CardTitle>
              <CardDescription>{formatDate(p.paid_on)} · {PAYMENT_METHODS[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!inv.is_direct && (
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Butiran invois <Link href={`/ahli/bisnes/invois/${inv.id}`} className="font-mono font-semibold text-primary hover:underline">{inv.invoice_no}</Link>
                </p>
              )}
              <Table>
                <THead><TR><TH>Perkara</TH><TH className="text-right">Unit</TH><TH className="text-right">Harga</TH><TH className="text-right">Diskaun</TH><TH className="text-right">Jumlah</TH></TR></THead>
                <TBody>
                  {its.map((it, i) => (
                    <TR key={i}>
                      <TD>{it.description}</TD>
                      <TD className="text-right">{Number(it.quantity)}</TD>
                      <TD className="text-right tabular-nums">{formatRM(it.unit_price_sen)}</TD>
                      <TD className="text-right tabular-nums">{Number(it.discount_sen) ? formatRM(it.discount_sen) : "-"}</TD>
                      <TD className="text-right font-semibold tabular-nums">{formatRM(it.line_total_sen)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subjumlah</dt><dd>{formatRM(inv.subtotal_sen)}</dd></div>
                {Number(inv.discount_sen) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Diskaun</dt><dd>-{formatRM(inv.discount_sen)}</dd></div>}
                {Number(inv.tax_sen) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">SST ({inv.tax_rate_bp / 100}%)</dt><dd>{formatRM(inv.tax_sen)}</dd></div>}
                {!inv.is_direct && (
                  <>
                    <div className="flex justify-between font-semibold"><dt>Jumlah invois</dt><dd>{formatRM(inv.total_sen)}</dd></div>
                    {paidBefore > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Telah dibayar sebelum ini</dt><dd>-{formatRM(paidBefore)}</dd></div>}
                  </>
                )}
                <div className="flex justify-between border-t pt-1 text-base font-bold"><dt>Jumlah diterima</dt><dd>{formatRM(p.amount_sen)}</dd></div>
                {!inv.is_direct && !p.reversed_at && <div className="flex justify-between text-xs text-muted-foreground"><dt>Baki invois selepas bayaran ini</dt><dd>{formatRM(balanceAfter)}</dd></div>}
              </dl>
              {inv.is_direct && inv.notes && <p className="rounded-lg bg-muted p-3 text-sm">{inv.notes}</p>}
              {p.reversed_at && <Alert tone="danger" title="Resit dibalikkan">{p.reverse_reason}</Alert>}
            </CardContent>
          </Card>
        </div>

        {!p.reversed_at && !suspended && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Balikkan resit</CardTitle>
                <CardDescription>
                  Resit tidak boleh diubah. Jika tersilap, balikkan resit ini dengan sebab{inv.is_direct ? ", kemudian jana resit baharu." : "; invois akan kembali belum dibayar."}
                </CardDescription>
              </CardHeader>
              <CardContent><ReversePaymentForm paymentId={p.id} /></CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
