import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, Download, FileX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { formatDate, formatRM } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import { logoUrl } from "@/lib/storage-url";
import type { DocumentJson } from "@/features/business/types";

export const metadata: Metadata = { title: "Dokumen", robots: { index: false, follow: false } };

/** What a member's customer sees when opening a shared invoice / receipt link. */
export default async function PublicDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_document", { p_token: token });
  if (!data) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <FileX className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">Dokumen tidak tersedia</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Pautan ini tidak sah atau telah dimatikan oleh penjual. Sila hubungi penjual untuk pautan baharu.</p>
      </main>
    );
  }
  const doc = data as DocumentJson;
  const inv = doc.invoice;
  const b = inv.business;
  const p = doc.kind === "receipt" ? doc.payment : null;
  const logo = logoUrl(b.logo_path);
  const stamp = p ? (p.reversed ? ["DIBALIKKAN", "text-danger border-danger"] : ["DIBAYAR", "text-success border-success"])
    : inv.status === "cancelled" ? ["DIBATALKAN", "text-danger border-danger"] : inv.status === "paid" ? ["DIBAYAR", "text-success border-success"] : null;

  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <article className="relative overflow-hidden rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          {stamp && <span className={`absolute right-6 top-24 rotate-[-12deg] rounded-lg border-4 px-3 py-1 text-xl font-black opacity-80 ${stamp[1]}`}>{stamp[0]}</span>}
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo && <img src={logo} alt="" className="size-14 rounded-lg object-contain" />}
              <div>
                <p className="text-lg font-bold text-primary">{b.name}</p>
                {b.ssm_no && <p className="flex items-center gap-1 text-xs text-muted-foreground">No. SSM {b.ssm_no} {b.ssm_verified && <span className="inline-flex items-center gap-0.5 font-semibold text-success"><BadgeCheck className="size-3.5" /> Disahkan</span>}</p>}
                {b.address && <p className="text-xs text-muted-foreground">{b.address}</p>}
                <p className="text-xs text-muted-foreground">Tel {b.phone}{b.email ? ` · ${b.email}` : ""}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-primary">{p ? "RESIT" : "INVOIS"}</p>
              <p className="font-mono text-sm">{p ? p.receipt_no : inv.invoice_no}</p>
            </div>
          </header>

          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-xl border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{p ? "Diterima daripada" : "Kepada"}</p>
              <p className="font-semibold">{inv.customer.name}</p>
              {inv.customer.address && <p className="text-xs text-muted-foreground">{inv.customer.address}</p>}
            </div>
            <div className="rounded-xl border p-3">
              {p ? (
                <>
                  <p>Tarikh: {formatDate(p.paid_on)}</p>
                  <p>Kaedah: {PAYMENT_METHODS[p.method] ?? p.method}</p>
                  {p.reference && <p>Rujukan: {p.reference}</p>}
                  <p>Invois: {inv.invoice_no}</p>
                </>
              ) : (
                <>
                  <p>Tarikh invois: {formatDate(inv.issue_date)}</p>
                  <p>Tarikh akhir: {formatDate(inv.due_date)}</p>
                  {inv.overdue && <p className="font-semibold text-danger">Lewat bayar</p>}
                </>
              )}
            </div>
          </div>

          {p ? (
            <div className="mt-6 flex items-center justify-between rounded-xl bg-success-soft p-4 text-success">
              <span className="font-semibold">Jumlah diterima</span><span className="text-2xl font-black tabular-nums">{formatRM(p.amount_sen)}</span>
            </div>
          ) : (
            <>
              <table className="mt-6 w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Perkara</th><th className="py-2 text-right">Kuantiti</th><th className="py-2 text-right">Jumlah</th></tr></thead>
                <tbody>
                  {inv.items.map((it, i) => (
                    <tr key={i} className="border-b"><td className="py-2">{it.description}</td><td className="py-2 text-right">{Number(it.quantity)}</td><td className="py-2 text-right tabular-nums">{formatRM(it.line_total_sen)}</td></tr>
                  ))}
                </tbody>
              </table>
              <dl className="ml-auto mt-3 w-full max-w-xs space-y-1 text-sm">
                {inv.discount_sen > 0 && <div className="flex justify-between"><dt>Diskaun</dt><dd>-{formatRM(inv.discount_sen)}</dd></div>}
                {inv.tax_sen > 0 && <div className="flex justify-between"><dt>SST ({inv.tax_rate_bp / 100}%)</dt><dd>{formatRM(inv.tax_sen)}</dd></div>}
                <div className="flex justify-between border-t pt-1 text-lg font-black"><dt>Jumlah</dt><dd>{formatRM(inv.total_sen)}</dd></div>
                {inv.paid_sen > 0 && <div className="flex justify-between font-semibold"><dt>Baki</dt><dd>{formatRM(inv.total_sen - inv.paid_sen)}</dd></div>}
              </dl>
              {b.bank_account_no && inv.status !== "paid" && inv.status !== "cancelled" && (
                <div className="mt-6 rounded-xl bg-accent-soft p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Cara bayaran</p>
                  <p><strong>{b.bank_name}</strong> · <span className="font-mono font-bold">{b.bank_account_no}</span></p>
                  <p>{b.bank_account_holder ?? b.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sila nyatakan {inv.invoice_no} sebagai rujukan.</p>
                </div>
              )}
              {inv.notes && <p className="mt-4 text-sm text-muted-foreground">{inv.notes}</p>}
            </>
          )}
        </article>

        <Button asChild size="lg" className="w-full">
          <a href={`/d/${token}/pdf?muat=1`}><Download /> Muat turun PDF</a>
        </Button>
        <p className="text-center text-xs text-muted-foreground">Dokumen dijana melalui KoopKITA bagi pihak {b.name}.</p>
      </div>
    </main>
  );
}
