import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FileLink } from "@/components/file-link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatPct, formatRM } from "@/lib/format";
import { DECLARATION_STATUS } from "@/lib/labels";
import {
  ConfirmDeclarationForm, DeclarationForm, DeleteDeclarationDraftButton, MarkReceivedForm, VoidDeclarationButton,
} from "@/features/projects/admin-forms";
import type { ProfitDeclaration, Project } from "@/types/db";

export const metadata = { title: "Pengumuman Keuntungan" };

type Row = { member_id: string; full_name: string; membership_id: string | null; capital_sen: number; amount_sen: number; coop_sen: number };

export default async function DeclarationPage({ params }: { params: Promise<{ id: string; declId: string }> }) {
  const { id, declId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(declId)) notFound();
  const { userId } = await requireAdmin();
  const supabase = await createClient();
  const [{ data: project }, { data: decl }, { data: rows }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("project_profit_declarations").select("*").eq("id", declId).eq("project_id", id).maybeSingle(),
    supabase.rpc("preview_profit_declaration", { p_id: declId }),
  ]);
  if (!project || !decl) notFound();
  const p = project as Project;
  const d = decl as ProfitDeclaration;
  const alloc = (rows ?? []) as Row[];
  const distributable = Number(d.gross_sen) - Number(d.fee_sen);
  const memberTotal = alloc.reduce((s, r) => s + Number(r.amount_sen), 0);
  const coopTotal = alloc.reduce((s, r) => s + Number(r.coop_sen), 0);
  const capital = alloc.reduce((s, r) => s + Number(r.capital_sen), 0);
  const expected = Math.round((capital * d.rate_bp) / 10000);

  return (
    <>
      <Link href={`/admin/projek/${id}?tab=keuntungan`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {p.name}</Link>
      <PageHeader title={`Keuntungan ${d.period_label}`}
        description={<span className="inline-flex flex-wrap items-center gap-2">{p.partner} · diumumkan {formatDate(d.announced_on)} <StatusBadge map={DECLARATION_STATUS} value={d.status} /></span>} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>Pengiraan</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Modal layak</dt><dd className="tabular-nums">{formatRM(capital)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Kadar diumumkan {p.partner}</dt><dd className="tabular-nums">{formatPct(d.rate_bp)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Keuntungan kasar</dt><dd className="tabular-nums">{formatRM(d.gross_sen)}</dd></div>
                {Number(d.fee_sen) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Tolak: {d.fee_description}</dt><dd className="tabular-nums text-danger">−{formatRM(d.fee_sen)}</dd></div>}
                <div className="flex justify-between border-t pt-2 font-semibold"><dt>Keuntungan untuk dibahagi</dt><dd className="tabular-nums">{formatRM(distributable)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Ahli ({formatPct(d.rate_bp - d.coop_rate_bp)} daripada {formatPct(d.rate_bp)})</dt><dd className="tabular-nums font-semibold">{formatRM(memberTotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Koperasi ({formatPct(d.coop_rate_bp)} mata)</dt><dd className="tabular-nums font-semibold">{formatRM(coopTotal)}</dd></div>
              </dl>
              {memberTotal + coopTotal !== distributable && capital > 0 && <Alert tone="danger" className="mt-3">Jumlah agihan tidak sepadan. Sila semak.</Alert>}
              {capital > 0 && expected !== Number(d.gross_sen) && (
                <Alert tone="warning" className="mt-3">Modal × kadar = {formatRM(expected)}, tetapi keuntungan kasar yang dimasukkan {formatRM(d.gross_sen)}. Pastikan jumlah ini betul.</Alert>
              )}
              {d.document_path && <p className="mt-3"><FileLink bucket="payout-proofs" path={d.document_path} label="Dokumen pengumuman" /></p>}
              {d.notes && <p className="mt-2 text-sm text-muted-foreground">{d.notes}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{d.status === "draft" ? "Pratonton agihan" : "Agihan"}</CardTitle>
              <CardDescription>Dikira dalam sen mengikut modal setiap ahli; baki pembundaran diberi kepada pecahan terbesar supaya jumlah tepat.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>Ahli</TH><TH className="text-right">Modal</TH><TH className="text-right">Dividen ahli</TH><TH className="text-right">Bahagian koperasi</TH></TR></THead>
                <TBody>
                  {alloc.map((r) => (
                    <TR key={r.member_id}>
                      <TD>{r.full_name}<span className="block text-xs text-muted-foreground">{r.membership_id}</span></TD>
                      <TD className="text-right tabular-nums">{formatRM(r.capital_sen)}</TD>
                      <TD className="text-right font-semibold tabular-nums">{formatRM(r.amount_sen)}</TD>
                      <TD className="text-right tabular-nums">{formatRM(r.coop_sen)}</TD>
                    </TR>
                  ))}
                  <TR><TD className="font-semibold">Jumlah</TD><TD className="text-right font-semibold tabular-nums">{formatRM(capital)}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatRM(memberTotal)}</TD><TD className="text-right font-semibold tabular-nums">{formatRM(coopTotal)}</TD></TR>
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          {d.status === "draft" && (
            <>
              <Card>
                <CardHeader><CardTitle>Sahkan pengumuman</CardTitle><CardDescription>Ahli akan dimaklumkan tentang dividen masing-masing.</CardDescription></CardHeader>
                <CardContent className="space-y-3"><ConfirmDeclarationForm id={d.id} projectId={id} /><DeleteDeclarationDraftButton id={d.id} projectId={id} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Ubah draf</CardTitle></CardHeader>
                <CardContent><DeclarationForm projectId={id} adminId={userId} capitalSen={capital || Number(p.invested_sen ?? 0)} thresholdBp={p.coop_threshold_bp} capBp={p.coop_cap_bp} declaration={d} /></CardContent>
              </Card>
            </>
          )}
          {d.status === "declared" && (
            <Card>
              <CardHeader><CardTitle>Wang belum diterima</CardTitle><CardDescription>Dividen ahli hanya boleh dipohon selepas koperasi menerima wang daripada {p.partner}.</CardDescription></CardHeader>
              <CardContent className="space-y-3"><MarkReceivedForm id={d.id} projectId={id} /><VoidDeclarationButton id={d.id} projectId={id} /></CardContent>
            </Card>
          )}
          {d.status === "received" && (
            <Card>
              <CardHeader><CardTitle>Wang diterima {formatDate(d.received_on)}</CardTitle><CardDescription>Disahkan {formatDateTime(d.declared_at)}. Dividen ahli tersedia untuk pengeluaran.</CardDescription></CardHeader>
              <CardContent><VoidDeclarationButton id={d.id} projectId={id} /></CardContent>
            </Card>
          )}
          {d.status === "voided" && <Alert tone="danger" title="Pengumuman dibatalkan">{formatDateTime(d.voided_at)}: {d.void_reason}</Alert>}
        </div>
      </div>
    </>
  );
}
