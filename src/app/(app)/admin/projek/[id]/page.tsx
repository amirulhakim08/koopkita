import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, Briefcase, Clock, FileText, HandCoins, Pencil, PiggyBank, TrendingUp, Undo2, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { FileLink } from "@/components/file-link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatPct, formatRM } from "@/lib/format";
import { DECLARATION_STATUS, PROJECT_CATEGORY, REVIEW_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { FundingBar, ProjectStatus, fundingPct } from "@/features/projects/project-card";
import {
  CancelProjectButton, CapitalReturnForm, DeclarationForm, DeleteDraftButton, InvestmentForm, MaturityForm, ParticipationReviewForm,
  PublishButton, ReverseCapitalReturnButton, StatusButton,
} from "@/features/projects/admin-forms";
import type { CapitalReturn, ProfitAllocation, ProfitDeclaration, Project, ProjectParticipation, ProjectProgress } from "@/types/db";

export const metadata = { title: "Urus Projek" };

const TABS = [
  ["ringkasan", "Ringkasan", Briefcase], ["bayaran", "Bayaran", Clock], ["ahli", "Peserta", Users],
  ["keuntungan", "Keuntungan", TrendingUp], ["modal", "Pemulangan modal", Undo2],
] as const;

type Person = { full_name: string; membership_id: string | null };

export default async function AdminProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { userId } = await requireAdmin();
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const p = project as Project;
  const tab = (TABS.some(([k]) => k === sp.tab) ? sp.tab : "ringkasan") as (typeof TABS)[number][0];

  const [{ data: progress }, { data: parts }, { data: decls }, { data: allocs }, { data: returns }] = await Promise.all([
    supabase.rpc("project_progress"),
    supabase.from("project_participations").select("*, member:profiles!project_participations_member_id_fkey(full_name, membership_id)").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_profit_declarations").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_profit_allocations").select("*, declaration:project_profit_declarations!inner(status)").eq("project_id", id),
    supabase.from("project_capital_returns").select("*, member:profiles!project_capital_returns_member_id_fkey(full_name, membership_id)").eq("project_id", id).order("created_at", { ascending: false }),
  ]);
  const pr = ((progress ?? []) as ProjectProgress[]).find((x) => x.project_id === id);
  const approved = Number(pr?.approved_sen ?? 0);
  const participations = (parts ?? []) as (ProjectParticipation & { member: Person | null })[];
  const pending = participations.filter((x) => x.status === "pending");
  const declarations = (decls ?? []) as ProfitDeclaration[];
  const capitalReturns = (returns ?? []) as (CapitalReturn & { member: Person | null })[];

  // Per-member position.
  const members = new Map<string, { member_id: string; name: string; membership_id: string | null; capital_sen: number; pending_sen: number; dividend_sen: number; returned_sen: number }>();
  for (const x of participations) {
    const m = members.get(x.member_id) ?? { member_id: x.member_id, name: x.member?.full_name ?? "-", membership_id: x.member?.membership_id ?? null, capital_sen: 0, pending_sen: 0, dividend_sen: 0, returned_sen: 0 };
    if (x.status === "approved") m.capital_sen += Number(x.amount_sen);
    if (x.status === "pending") m.pending_sen += Number(x.amount_sen);
    members.set(x.member_id, m);
  }
  for (const a of (allocs ?? []) as (ProfitAllocation & { declaration: { status: string } })[]) {
    const m = members.get(a.member_id);
    if (m && a.declaration.status !== "voided") m.dividend_sen += Number(a.amount_sen);
  }
  for (const c of capitalReturns) {
    const m = members.get(c.member_id);
    if (m) m.returned_sen += c.reverses_id ? -Number(c.amount_sen) : Number(c.amount_sen);
  }
  const memberRows = [...members.values()].filter((m) => m.capital_sen > 0 || m.pending_sen > 0).sort((a, b) => b.capital_sen - a.capital_sen);
  const live = declarations.filter((d) => d.status !== "voided" && d.status !== "draft");
  const totalDividend = live.reduce((s, d) => s + Number(d.member_total_sen ?? 0), 0);
  const coopIncome = declarations.filter((d) => d.status === "received").reduce((s, d) => s + Number(d.coop_total_sen ?? 0), 0);
  const returned = memberRows.reduce((s, m) => s + m.returned_sen, 0);

  return (
    <>
      <Link href="/admin/projek" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Pengurusan Projek</Link>
      <PageHeader title={p.name}
        description={<span className="inline-flex flex-wrap items-center gap-2">{p.code} · {PROJECT_CATEGORY[p.category] ?? p.category} · {p.partner} <ProjectStatus status={p.status} target={Number(p.target_sen)} approved={approved} /></span>}
        actions={!["completed", "cancelled"].includes(p.status) && <Button asChild variant="outline"><Link href={`/admin/projek/${id}/ubah`}><Pencil /> Ubah</Link></Button>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard emphasis label="Modal diluluskan" value={formatRM(approved)} hint={`Sasaran ${formatRM(p.target_sen)} · ${fundingPct(Number(p.target_sen), approved)}%`} icon={PiggyBank} />
        <StatCard label="Menunggu semakan" value={formatRM(pr?.pending_sen)} hint={`${pr?.pending_count ?? 0} bayaran`} icon={Clock} />
        <StatCard label="Dividen ahli" value={formatRM(totalDividend)} hint={`Pendapatan koperasi ${formatRM(coopIncome)}`} icon={HandCoins} />
        <StatCard label="Peserta" value={pr?.participants ?? 0} hint={returned ? `${formatRM(returned)} modal dipulangkan` : undefined} icon={Users} />
      </div>
      <FundingBar className="mt-4" target={Number(p.target_sen)} approved={approved} pending={Number(pr?.pending_sen ?? 0)} />

      <nav className="mb-5 mt-6 flex gap-1 overflow-x-auto border-b" aria-label="Bahagian projek">
        {TABS.map(([key, label, Icon]) => (
          <Link key={key} href={`/admin/projek/${id}?tab=${key}`} aria-current={tab === key ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4" /> {label}{key === "bayaran" && pending.length > 0 && <Badge tone="warning">{pending.length}</Badge>}
          </Link>
        ))}
      </nav>

      {tab === "ringkasan" && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="min-w-0 lg:col-span-3">
            <CardHeader><CardTitle>Butiran</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Minimum</dt><dd className="font-semibold">{formatRM(p.min_sen)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Gandaan</dt><dd className="font-semibold">{formatRM(p.step_sen)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Had seorang</dt><dd className="font-semibold">{p.max_per_member_sen ? formatRM(p.max_per_member_sen) : "Tiada had"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Buka / tutup</dt><dd className="font-semibold">{formatDate(p.open_date)} – {formatDate(p.close_date)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Tempoh</dt><dd className="font-semibold">{p.duration_months ? `${p.duration_months} bulan` : "-"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Jangkaan matang</dt><dd className="font-semibold">{formatDate(p.maturity_date)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Bahagian koperasi</dt><dd className="font-semibold">di atas {formatPct(p.coop_threshold_bp)}, maks {formatPct(p.coop_cap_bp).replace("%", "")} mata</dd></div>
                <div><dt className="text-xs text-muted-foreground">Terma</dt><dd className="font-semibold">Versi {p.terms_version}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Dokumen</dt><dd>{p.document_path ? <FileLink bucket="payout-proofs" path={p.document_path} label="Lihat" /> : "-"}</dd></div>
              </dl>
              {p.description && <p className="whitespace-pre-line text-muted-foreground">{p.description}</p>}
              <div className="rounded-lg border p-3">
                <p className="font-semibold">Garis masa</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li>Dicipta: {formatDateTime(p.created_at)}</li>
                  <li>Diterbitkan: {p.published_at ? formatDateTime(p.published_at) : "Belum (draf)"}</li>
                  <li>Dilaburkan: {p.invested_on ? <>{formatDate(p.invested_on)} · {formatRM(p.invested_sen)} · rujukan {p.investment_ref} {p.investment_proof_path && <FileLink bucket="payout-proofs" path={p.investment_proof_path} label="Bukti" />}</> : "Belum"}</li>
                  <li>Matang: {p.matured_on ? <>{formatDate(p.matured_on)} · modal diterima semula {formatRM(p.capital_received_sen)}
                    {Number(p.capital_received_sen) < Number(p.invested_sen) && <span className="text-danger"> (kerugian {formatRM(Number(p.invested_sen) - Number(p.capital_received_sen))})</span>}</> : "Belum"}</li>
                  {p.cancelled_at && <li className="text-danger">Dibatalkan {formatDateTime(p.cancelled_at)}: {p.cancel_reason}</li>}
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Card>
              <CardHeader><CardTitle>Tindakan</CardTitle><CardDescription>Langkah seterusnya untuk projek ini.</CardDescription></CardHeader>
              <CardContent className="flex flex-col items-start gap-3">
                {p.status === "draft" && <>
                  <Alert tone="info">Semak sasaran, minimum, gandaan, terma dan risiko. Selepas diterbitkan, peraturan pembiayaan tidak boleh diubah.</Alert>
                  <PublishButton id={id} /><DeleteDraftButton id={id} />
                </>}
                {p.status === "open" && <>
                  <p className="text-sm text-muted-foreground">Projek ditutup secara automatik apabila modal diluluskan mencapai sasaran. Anda juga boleh menutup penyertaan lebih awal.</p>
                  {approved > 0 && <StatusButton id={id} status="full" label="Tutup penyertaan" confirm={`Tutup penyertaan dengan modal ${formatRM(approved)}? Semua bayaran menunggu mesti disemak dahulu.`} />}
                </>}
                {p.status === "full" && <>
                  <p className="text-sm font-medium">Rekod pelaburan yang dibuat dengan {p.partner}:</p>
                  <InvestmentForm id={id} adminId={userId} capitalSen={approved} />
                  {approved < Number(p.target_sen) && <StatusButton id={id} status="open" label="Buka semula penyertaan" confirm="Buka semula projek untuk penyertaan?" />}
                </>}
                {p.status === "active" && <>
                  <Button asChild><Link href={`/admin/projek/${id}?tab=keuntungan`}><TrendingUp /> Tambah Pengumuman Keuntungan</Link></Button>
                  <details className="w-full rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Tandakan projek matang</summary>
                    <div className="mt-3"><MaturityForm id={id} adminId={userId} investedSen={Number(p.invested_sen ?? 0)} /></div></details>
                </>}
                {p.status === "matured" && <>
                  <Button asChild variant="outline"><Link href={`/admin/projek/${id}?tab=modal`}><Undo2 /> Rekod pemulangan modal</Link></Button>
                  <StatusButton id={id} status="completed" label="Tandakan selesai" confirm="Tandakan projek selesai? Pastikan modal dan dividen telah direkodkan." />
                </>}
                {p.status === "cancelled" && <Button asChild variant="outline"><Link href={`/admin/projek/${id}?tab=modal`}><Undo2 /> Rekod bayaran balik</Link></Button>}
                {["draft", "open", "full"].includes(p.status) && p.status !== "draft" && <CancelProjectButton id={id} />}
                {p.status === "completed" && <p className="text-sm text-muted-foreground">Projek telah selesai.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "bayaran" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Menunggu semakan</CardTitle><CardDescription>Hanya bayaran yang diluluskan dikira sebagai modal. Semak resit dan rujukan bank sebelum meluluskan.</CardDescription></CardHeader>
            <CardContent>
              {pending.length ? (
                <Table>
                  <THead><TR><TH>Ahli</TH><TH className="text-right">Jumlah</TH><TH>Bayaran</TH><TH>Resit</TH><TH>Semakan</TH></TR></THead>
                  <TBody>
                    {pending.map((x) => (
                      <TR key={x.id}>
                        <TD><p className="font-medium">{x.member?.full_name}</p><p className="text-xs text-muted-foreground">{x.member?.membership_id} · terma v{x.terms_version}</p></TD>
                        <TD className="text-right font-semibold tabular-nums">{formatRM(x.amount_sen)}</TD>
                        <TD>{formatDate(x.payment_date)}<span className="block font-mono text-xs">{x.transaction_ref}</span>
                          {x.duplicate_flag && <Badge tone="danger">⚠ {x.duplicate_reason}</Badge>}</TD>
                        <TD><FileLink path={x.receipt_path} label="Resit" /></TD>
                        <TD><ParticipationReviewForm id={x.id} /></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : <p className="text-sm text-muted-foreground">Tiada bayaran menunggu.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Sejarah bayaran</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>Dihantar</TH><TH>Ahli</TH><TH className="text-right">Jumlah</TH><TH>Rujukan</TH><TH>Status</TH><TH>Resit</TH></TR></THead>
                <TBody>
                  {participations.filter((x) => x.status !== "pending").map((x) => (
                    <TR key={x.id}>
                      <TD>{formatDateTime(x.created_at)}</TD>
                      <TD>{x.member?.full_name}<span className="block text-xs text-muted-foreground">{x.member?.membership_id}</span></TD>
                      <TD className="text-right tabular-nums">{formatRM(x.amount_sen)}</TD>
                      <TD className="font-mono text-xs">{x.transaction_ref}</TD>
                      <TD><StatusBadge map={REVIEW_STATUS} value={x.status} />{x.review_notes && <p className="text-xs text-muted-foreground">{x.review_notes}</p>}</TD>
                      <TD><FileLink path={x.receipt_path} label="Resit" /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "ahli" && (
        <Card>
          <CardHeader><CardTitle>Pecahan mengikut ahli</CardTitle></CardHeader>
          <CardContent>
            {memberRows.length ? (
              <Table>
                <THead><TR><TH>Ahli</TH><TH className="text-right">Modal</TH><TH className="text-right">Pegangan</TH><TH className="text-right">Menunggu</TH><TH className="text-right">Dividen</TH><TH className="text-right">Modal dipulangkan</TH></TR></THead>
                <TBody>
                  {memberRows.map((m) => (
                    <TR key={m.member_id}>
                      <TD><Link href={`/admin/ahli/${m.member_id}`} className="font-medium hover:underline">{m.name}</Link><span className="block text-xs text-muted-foreground">{m.membership_id}</span></TD>
                      <TD className="text-right font-semibold tabular-nums">{formatRM(m.capital_sen)}</TD>
                      <TD className="text-right tabular-nums">{approved ? ((m.capital_sen / approved) * 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : 0}%</TD>
                      <TD className="text-right tabular-nums">{m.pending_sen ? formatRM(m.pending_sen) : "-"}</TD>
                      <TD className="text-right tabular-nums">{formatRM(m.dividend_sen)}</TD>
                      <TD className="text-right tabular-nums">{formatRM(m.returned_sen)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : <EmptyState icon={Users} title="Belum ada peserta" />}
          </CardContent>
        </Card>
      )}

      {tab === "keuntungan" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Pengumuman keuntungan</CardTitle><CardDescription>Setiap tempoh mempunyai satu pengumuman. Draf boleh diubah; selepas disahkan ia dikunci.</CardDescription></CardHeader>
            <CardContent>
              {declarations.length ? (
                <Table>
                  <THead><TR><TH>Tempoh</TH><TH className="text-right">Kadar</TH><TH className="text-right">Kasar</TH><TH className="text-right">Ahli</TH><TH className="text-right">Koperasi</TH><TH>Status</TH><TH></TH></TR></THead>
                  <TBody>
                    {declarations.map((d) => (
                      <TR key={d.id}>
                        <TD><p className="font-medium">{d.period_label}</p><p className="text-xs text-muted-foreground">Diumumkan {formatDate(d.announced_on)}</p></TD>
                        <TD className="text-right tabular-nums">{formatPct(d.rate_bp)}<span className="block text-xs text-muted-foreground">ahli {formatPct(d.rate_bp - d.coop_rate_bp)} · kop {formatPct(d.coop_rate_bp)}</span></TD>
                        <TD className="text-right tabular-nums">{formatRM(d.gross_sen)}{Number(d.fee_sen) > 0 && <span className="block text-xs text-muted-foreground">−{formatRM(d.fee_sen)} caj</span>}</TD>
                        <TD className="text-right tabular-nums">{d.member_total_sen == null ? "-" : formatRM(d.member_total_sen)}</TD>
                        <TD className="text-right tabular-nums">{d.coop_total_sen == null ? "-" : formatRM(d.coop_total_sen)}</TD>
                        <TD><StatusBadge map={DECLARATION_STATUS} value={d.status} /></TD>
                        <TD><Button asChild size="sm" variant="outline"><Link href={`/admin/projek/${id}/keuntungan/${d.id}`}><FileText /> {d.status === "draft" ? "Semak & sahkan" : "Butiran"}</Link></Button></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : <p className="text-sm text-muted-foreground">Belum ada pengumuman.</p>}
            </CardContent>
          </Card>
          {["active", "matured"].includes(p.status) ? (
            <Card>
              <CardHeader><CardTitle>Tambah Pengumuman Keuntungan</CardTitle>
                <CardDescription>Contoh: {p.partner} umum 10% bagi Tahun 2027. Dengan peraturan projek ini, ahli menerima 9% dan koperasi 1%. Potongan seperti yuran pentadbiran ditolak sebelum dibahagi.</CardDescription></CardHeader>
              <CardContent>
                <DeclarationForm projectId={id} adminId={userId} capitalSen={Number(p.invested_sen ?? approved)} thresholdBp={p.coop_threshold_bp} capBp={p.coop_cap_bp} />
              </CardContent>
            </Card>
          ) : <Alert tone="info">Keuntungan boleh diumumkan selepas pelaburan direkodkan (status Aktif).</Alert>}
        </div>
      )}

      {tab === "modal" && (
        <div className="space-y-6">
          {(p.status === "matured" || p.status === "completed" || p.status === "cancelled") && memberRows.some((m) => m.capital_sen > m.returned_sen) && (
            <Card>
              <CardHeader>
                <CardTitle>{p.status === "cancelled" ? "Rekod bayaran balik modal" : "Rekod pemulangan modal"}</CardTitle>
                <CardDescription>Modal pokok direkod berasingan daripada dividen.
                  {p.status !== "cancelled" && p.capital_received_sen != null && ` Modal diterima semula: ${formatRM(p.capital_received_sen)} daripada ${formatRM(p.invested_sen)}; cadangan jumlah setiap ahli mengikut nisbah.`}</CardDescription>
              </CardHeader>
              <CardContent>
                <CapitalReturnForm projectId={id} adminId={userId} kind={p.status === "cancelled" ? "refund" : "return"}
                  members={memberRows.filter((m) => m.capital_sen > m.returned_sen).map((m) => {
                    const ratio = p.status === "cancelled" || !p.invested_sen ? 1 : Math.min(1, Number(p.capital_received_sen ?? 0) / Number(p.invested_sen));
                    return { ...m, suggested_sen: Math.max(Math.floor(m.capital_sen * ratio) - m.returned_sen, 0) };
                  })} />
              </CardContent>
            </Card>
          )}
          {!["matured", "completed", "cancelled"].includes(p.status) && <Alert tone="info">Modal dipulangkan selepas projek matang, atau dibayar balik jika projek dibatalkan.</Alert>}
          <Card>
            <CardHeader><CardTitle>Sejarah pemulangan</CardTitle></CardHeader>
            <CardContent>
              {capitalReturns.length ? (
                <Table>
                  <THead><TR><TH>Tarikh</TH><TH>Ahli</TH><TH>Jenis</TH><TH className="text-right">Jumlah</TH><TH>Rujukan</TH><TH></TH></TR></THead>
                  <TBody>
                    {capitalReturns.map((c) => {
                      const reversed = capitalReturns.some((r) => r.reverses_id === c.id);
                      return (
                        <TR key={c.id}>
                          <TD>{formatDate(c.paid_on)}</TD>
                          <TD>{c.member?.full_name}<span className="block text-xs text-muted-foreground">{c.member?.membership_id}</span></TD>
                          <TD>{c.reverses_id ? <Badge tone="danger">Pembalikan</Badge> : <Badge tone="info">{c.kind === "refund" ? "Bayaran balik" : "Pemulangan"}</Badge>}</TD>
                          <TD className="text-right tabular-nums">{c.reverses_id ? "−" : ""}{formatRM(c.amount_sen)}</TD>
                          <TD className="text-xs">{c.transaction_ref}{c.proof_path && <span className="block"><FileLink bucket="payout-proofs" path={c.proof_path} label="Bukti" /></span>}</TD>
                          <TD>{!c.reverses_id && !reversed && <ReverseCapitalReturnButton id={c.id} projectId={id} />}{reversed && <span className="text-xs text-muted-foreground">Dibalikkan</span>}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              ) : <EmptyState icon={Banknote} title="Tiada rekod" />}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
