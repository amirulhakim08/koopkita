import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Coins, Landmark, Lock, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { FileLink } from "@/components/file-link";
import { CoopEntryForm, ReverseEntryForm } from "@/features/finance/entry-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRM, todayKL } from "@/lib/format";
import { BUSINESSES, CASHBOOK_CATEGORIES, CASHBOOK_SOURCES } from "@/lib/labels";

export const metadata = { title: "Kewangan Koperasi" };

type Summary = {
  as_of: string; share_capital_sen: number; project_capital_sen: number; project_invested_sen: number; project_profit_sen: number;
  capital_received_sen: number; dividend_paid_sen: number; capital_returned_sen: number; coop_profit_share_sen: number;
  member_dividend_sen: number; dividend_liability_sen: number; manual_in_sen: number; manual_out_sen: number; total_funds_sen: number; funds_excl_share_sen: number;
  period_in_sen: number; period_out_sen: number;
  by_business: { business: string; in_sen: number | null; out_sen: number | null; net_sen: number }[];
};
type Row = {
  source: string; ref_id: string; entry_no: string | null; entry_date: string; business: string; category: string;
  description: string; reference: string | null; amount_sen: number; reversed: boolean; is_reversal: boolean;
};

const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ dari?: string; hingga?: string; sumber?: string }> }) {
  const { userId } = await requireAdmin();
  const sp = await searchParams;
  const today = todayKL();
  const from = isDate(sp.dari) ?? `${today.slice(0, 4)}-01-01`;
  const to = isDate(sp.hingga) ?? today;
  const source = sp.sumber && sp.sumber in CASHBOOK_SOURCES ? sp.sumber : undefined;
  const supabase = await createClient();
  const [{ data: summary, error }, { data: rows }, { data: proofs }] = await Promise.all([
    supabase.rpc("admin_finance_summary", { p_from: from, p_to: to }),
    supabase.rpc("admin_cashbook", { p_from: from, p_to: to, p_limit: 1000 }),
    supabase.from("coop_ledger_entries").select("id, proof_path").not("proof_path", "is", null),
  ]);
  if (error || !summary) return <Alert tone="danger">Data kewangan tidak dapat dimuatkan.</Alert>;
  const s = summary as Summary;
  const proofById = new Map((proofs ?? []).map((p) => [p.id, p.proof_path as string]));
  const book = ((rows ?? []) as Row[]).filter((r) => !source || r.source === source);

  return (
    <>
      <PageHeader title="Kewangan koperasi" description={<span className="inline-flex items-center gap-1"><Lock className="size-3.5" /> Paparan Super Admin sahaja. Ahli biasa tidak boleh melihat halaman atau data ini.</span>}
        actions={<Button asChild variant="outline"><a href={`/api/eksport/buku-tunai?dari=${from}&hingga=${to}`}>Eksport buku tunai</a></Button>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard emphasis label="Jumlah dana koperasi" value={formatRM(s.total_funds_sen)} icon={Landmark} hint={`Setakat ${formatDate(s.as_of)}`} />
        <StatCard label="Modal syer ahli" value={formatRM(s.share_capital_sen)} icon={Coins} />
        <StatCard label="Dana selain modal syer" value={formatRM(s.funds_excl_share_sen)} icon={Wallet}
          hint="Projek, perniagaan lain & perbelanjaan" />
        <StatCard label="Masuk / keluar (tempoh)" value={<span className="block space-y-0.5 text-base"><span className="block whitespace-nowrap text-success">+{formatRM(s.period_in_sen)}</span><span className="block whitespace-nowrap text-danger">−{formatRM(s.period_out_sen)}</span></span>} hint={`${formatDate(from)} – ${formatDate(to)}`} />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Pecahan dana keseluruhan</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between"><dt className="text-muted-foreground">Modal syer diluluskan</dt><dd className="tabular-nums">+{formatRM(s.share_capital_sen)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Modal projek ahli (diluluskan)</dt><dd className="tabular-nums">+{formatRM(s.project_capital_sen)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Dihantar kepada organisasi pelaburan</dt><dd className="tabular-nums text-danger">−{formatRM(s.project_invested_sen)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Keuntungan projek diterima</dt><dd className="tabular-nums">+{formatRM(s.project_profit_sen)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Dividen dibayar kepada ahli</dt><dd className="tabular-nums text-danger">−{formatRM(s.dividend_paid_sen)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Modal diterima semula (matang)</dt><dd className="tabular-nums">+{formatRM(s.capital_received_sen)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Modal dipulangkan kepada ahli</dt><dd className="tabular-nums text-danger">−{formatRM(s.capital_returned_sen)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Wang masuk lain (rekod manual)</dt><dd className="tabular-nums">+{formatRM(s.manual_in_sen)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Wang keluar / pengeluaran (rekod manual)</dt><dd className="tabular-nums text-danger">−{formatRM(s.manual_out_sen)}</dd></div>
            <div className="flex justify-between border-t pt-2 font-bold"><dt>Jumlah dana koperasi</dt><dd className="tabular-nums">{formatRM(s.total_funds_sen)}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div><CardTitle>Kewangan projek</CardTitle><CardDescription>Bukan aliran tunai: pecahan keuntungan yang diterima dan baki dividen yang masih terhutang kepada ahli.</CardDescription></div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/admin/projek">Projek</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/admin/projek/pengeluaran">Pengeluaran dividen</Link></Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Pendapatan koperasi (bahagian keuntungan)</p><p className="text-lg font-bold tabular-nums">{formatRM(s.coop_profit_share_sen)}</p></div>
          <div><p className="text-xs text-muted-foreground">Dividen ahli (diterima)</p><p className="text-lg font-bold tabular-nums">{formatRM(s.member_dividend_sen)}</p></div>
          <div><p className="text-xs text-muted-foreground">Dividen dibayar</p><p className="text-lg font-bold tabular-nums">{formatRM(s.dividend_paid_sen)}</p></div>
          <div><p className="text-xs text-muted-foreground">Liabiliti dividen belum dibayar</p><p className="text-lg font-bold tabular-nums text-warning">{formatRM(s.dividend_liability_sen)}</p></div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Rekod wang masuk / keluar</CardTitle>
            <CardDescription>Untuk perniagaan lain, perbelanjaan dan pengeluaran. Modal syer dan semua transaksi projek direkodkan automatik.</CardDescription>
          </CardHeader>
          <CardContent><CoopEntryForm adminId={userId} /></CardContent>
        </Card>

        <div className="space-y-6 xl:col-span-3">
          <Card>
            <CardHeader><CardTitle>Mengikut perniagaan ({formatDate(from)} – {formatDate(to)})</CardTitle><CardDescription>Tidak termasuk modal syer.</CardDescription></CardHeader>
            <CardContent>
              {s.by_business.length ? (
                <Table>
                  <THead><TR><TH>Perniagaan</TH><TH className="text-right">Masuk</TH><TH className="text-right">Keluar</TH><TH className="text-right">Bersih</TH></TR></THead>
                  <TBody>
                    {s.by_business.map((b) => (
                      <TR key={b.business}>
                        <TD>{BUSINESSES[b.business] ?? b.business}</TD>
                        <TD className="text-right tabular-nums text-success">{formatRM(b.in_sen ?? 0)}</TD>
                        <TD className="text-right tabular-nums text-danger">{formatRM(b.out_sen ?? 0)}</TD>
                        <TD className="text-right font-semibold tabular-nums">{formatRM(b.net_sen)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : <p className="text-sm text-muted-foreground">Tiada aliran wang dalam tempoh ini.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="mt-8 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Buku tunai</h2>
          <form className="flex flex-wrap items-end gap-2">
            <label className="text-xs">Dari<Input type="date" name="dari" defaultValue={from} className="h-9" /></label>
            <label className="text-xs">Hingga<Input type="date" name="hingga" defaultValue={to} max={today} className="h-9" /></label>
            <label className="text-xs">Sumber
              <select name="sumber" defaultValue={source ?? ""} className="block h-9 rounded-lg border border-input bg-white px-2 text-sm">
                <option value="">Semua</option>
                {Object.entries(CASHBOOK_SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <Button type="submit" variant="outline" size="sm" className="h-9">Tapis</Button>
          </form>
        </div>
        {book.length ? (
          <Table>
            <THead><TR><TH>Tarikh</TH><TH>Sumber</TH><TH>Kategori</TH><TH>Keterangan / sebab</TH><TH>Perniagaan</TH><TH className="text-right">Masuk</TH><TH className="text-right">Keluar</TH><TH /></TR></THead>
            <TBody>
              {book.map((r) => (
                <TR key={`${r.source}-${r.ref_id}`} className={r.reversed ? "opacity-60" : undefined}>
                  <TD className="whitespace-nowrap text-xs">{formatDate(r.entry_date)}{r.entry_no && <p className="font-mono text-[11px] text-muted-foreground">{r.entry_no}</p>}</TD>
                  <TD><StatusBadge map={CASHBOOK_SOURCES} value={r.source} /></TD>
                  <TD className="text-xs">{CASHBOOK_CATEGORIES[r.category] ?? r.category}</TD>
                  <TD className="max-w-sm text-xs">
                    {r.description}
                    {r.reference && <span className="block font-mono text-muted-foreground">{r.reference}</span>}
                    {r.reversed && <Badge tone="danger" className="mt-1">Dibalikkan</Badge>}
                    {proofById.get(r.ref_id) && <span className="mt-1 block"><FileLink bucket="payout-proofs" path={proofById.get(r.ref_id)!} label="Bukti" /></span>}
                  </TD>
                  <TD className="text-xs">{BUSINESSES[r.business] ?? r.business}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums text-success">{r.amount_sen > 0 ? <span className="inline-flex items-center gap-0.5"><ArrowDownLeft className="size-3" />{formatRM(r.amount_sen)}</span> : ""}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums text-danger">{r.amount_sen < 0 ? <span className="inline-flex items-center gap-0.5"><ArrowUpRight className="size-3" />{formatRM(-r.amount_sen)}</span> : ""}</TD>
                  <TD>{r.source === "manual" && !r.reversed && !r.is_reversal && <ReverseEntryForm entryId={r.ref_id} />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={Landmark} title="Tiada rekod dalam tempoh ini" />}
        <p className="text-xs text-muted-foreground">
          Rekod tidak boleh dipadam atau diubah. Gunakan <strong>Balikkan</strong> untuk membetulkan kesilapan; kedua-dua rekod kekal dalam buku tunai dan log audit.
          {" "}<Link href="/admin/audit?q=finance" className="underline">Lihat log audit kewangan</Link>
        </p>
      </section>
    </>
  );
}
