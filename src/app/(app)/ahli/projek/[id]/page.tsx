import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, HandCoins, TrendingUp, Banknote } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BankDetails } from "@/components/bank-details";
import { FileLink } from "@/components/file-link";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBankSettings } from "@/lib/queries";
import { formatDate, formatPct, formatRM } from "@/lib/format";
import { DECLARATION_STATUS, PROJECT_CATEGORY, REVIEW_STATUS, WITHDRAWAL_STATUS } from "@/lib/labels";
import { FundingBar, ProjectStatus, fundingPct } from "@/features/projects/project-card";
import { JoinProjectForm } from "@/features/projects/join-form";
import { CancelWithdrawalButton, WithdrawForm } from "@/features/projects/member-forms";
import type {
  CapitalReturn, MemberProjectWallet, ProfitAllocation, ProfitDeclaration, Project, ProjectParticipation, ProjectProgress, ProjectWithdrawal,
} from "@/types/db";

export const metadata = { title: "Projek" };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { userId, profile } = await requireActiveMember();
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const p = project as Project;
  const [{ data: progress }, { data: mine }, { data: decls }, { data: allocs }, { data: wds }, { data: returns }, { data: wallet }, bank] = await Promise.all([
    supabase.rpc("project_progress"),
    supabase.from("project_participations").select("*").eq("project_id", id).eq("member_id", userId).order("created_at", { ascending: false }),
    supabase.from("project_profit_declarations").select("*").eq("project_id", id).order("announced_on", { ascending: false }),
    supabase.from("project_profit_allocations").select("*").eq("project_id", id).eq("member_id", userId),
    supabase.from("project_withdrawals").select("*").eq("project_id", id).eq("member_id", userId).order("created_at", { ascending: false }),
    supabase.from("project_capital_returns").select("*").eq("project_id", id).eq("member_id", userId).order("created_at", { ascending: false }),
    supabase.rpc("member_project_wallet"),
    getBankSettings(),
  ]);
  const prog = ((progress ?? []) as ProjectProgress[]).find((x) => x.project_id === id);
  const approved = Number(prog?.approved_sen ?? 0);
  const pending = Number(prog?.pending_sen ?? 0);
  const my = ((mine ?? []) as ProjectParticipation[]);
  const myApproved = my.filter((x) => x.status === "approved").reduce((s, x) => s + Number(x.amount_sen), 0);
  const myPending = my.filter((x) => x.status === "pending").reduce((s, x) => s + Number(x.amount_sen), 0);
  const w = ((wallet ?? []) as MemberProjectWallet[]).find((x) => x.project_id === id);
  const allocByDecl = new Map(((allocs ?? []) as ProfitAllocation[]).map((a) => [a.declaration_id, a]));
  const declarations = (decls ?? []) as ProfitDeclaration[];
  const capitalBase = Number(p.invested_sen ?? approved) || approved;
  const holding = capitalBase ? (myApproved / capitalBase) * 100 : 0;
  const open = p.status === "open";
  const bankOk = !!(profile.bank_name && profile.bank_account_no && profile.bank_account_holder);

  return (
    <>
      <Link href="/ahli/projek" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Semua projek</Link>
      <PageHeader title={p.name}
        description={<span className="inline-flex flex-wrap items-center gap-2">{p.code} · {PROJECT_CATEGORY[p.category] ?? p.category} · {p.partner} <ProjectStatus status={p.status} target={Number(p.target_sen)} approved={approved} /></span>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard emphasis label="Modal saya" value={formatRM(myApproved)} icon={Banknote} hint={myPending ? `${formatRM(myPending)} menunggu pengesahan` : undefined} />
        <StatCard label="Pegangan saya" value={`${holding.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`} icon={TrendingUp} hint="daripada modal projek" />
        <StatCard label="Dividen saya" value={formatRM(w?.dividend_declared_sen)} icon={HandCoins} hint={`Dikeluarkan ${formatRM(w?.withdrawn_sen)}`} />
        <StatCard label="Tersedia untuk pengeluaran" value={formatRM(w?.available_sen)} icon={CalendarClock}
          hint={Number(w?.withdrawal_pending_sen) ? `${formatRM(w?.withdrawal_pending_sen)} sedang diproses` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>Kemajuan pembiayaan</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between">
                <div><p className="text-xs text-muted-foreground">Terkumpul (disahkan)</p><p className="text-2xl font-bold tabular-nums">{formatRM(approved)}</p></div>
                <p className="text-right text-sm text-muted-foreground">Sasaran <strong className="text-foreground">{formatRM(p.target_sen)}</strong></p>
              </div>
              <FundingBar target={Number(p.target_sen)} approved={approved} pending={pending} />
              <p className="text-xs text-muted-foreground">
                {fundingPct(Number(p.target_sen), approved)}% · Baki {formatRM(Math.max(Number(p.target_sen) - approved, 0))}
                {pending > 0 && <> · {formatRM(pending)} menunggu pengesahan</>} · {prog?.participants ?? 0} peserta
              </p>
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Minimum</dt><dd className="font-semibold">{formatRM(p.min_sen)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Gandaan</dt><dd className="font-semibold">{formatRM(p.step_sen)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Had seorang</dt><dd className="font-semibold">{p.max_per_member_sen ? formatRM(p.max_per_member_sen) : "Tiada had"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Tempoh</dt><dd className="font-semibold">{p.duration_months ? `${p.duration_months} bulan` : "-"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Buka / tutup</dt><dd className="font-semibold">{formatDate(p.open_date)} – {formatDate(p.close_date)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Jangkaan matang</dt><dd className="font-semibold">{formatDate(p.maturity_date)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tentang projek</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {p.description ? <p className="whitespace-pre-line">{p.description}</p> : <p className="text-muted-foreground">Tiada penerangan.</p>}
              {p.document_path && <FileLink bucket="payout-proofs" path={p.document_path} label="Dokumen sokongan" />}
              <div className="rounded-lg border p-3">
                <p className="font-semibold">Pembahagian keuntungan</p>
                <p className="mt-1 text-muted-foreground">
                  Keuntungan sebenar dibahagi mengikut modal setiap ahli. Jika kadar keuntungan melebihi {formatPct(p.coop_threshold_bp)}, koperasi
                  mengambil bahagian yang melebihi, sehingga {formatPct(p.coop_cap_bp).replace("%", "")} mata peratusan.
                  Contoh: untung 10% → ahli 9%, koperasi 1%. Untung {formatPct(p.coop_threshold_bp)} atau kurang → semua kepada ahli.
                </p>
              </div>
              <div>
                <p className="font-semibold">Garis masa</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li>Diterbitkan: {formatDate(p.published_at)}</li>
                  <li>Dilaburkan: {p.invested_on ? `${formatDate(p.invested_on)} (${formatRM(p.invested_sen)})` : "Belum"}</li>
                  <li>Matang: {p.matured_on ? formatDate(p.matured_on) : "Belum"}</li>
                  {p.cancelled_at && <li className="text-danger">Dibatalkan: {formatDate(p.cancelled_at)} — {p.cancel_reason}</li>}
                </ul>
              </div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer font-semibold">Terma dan syarat (versi {p.terms_version})</summary>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">{p.terms ?? "-"}</p>
              </details>
              <details className="rounded-lg border p-3" open={open}>
                <summary className="cursor-pointer font-semibold">Pendedahan risiko</summary>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">{p.risk_disclosure ?? "-"}</p>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pengisytiharan keuntungan</CardTitle><CardDescription>Hanya keuntungan sebenar yang telah diumumkan oleh organisasi.</CardDescription></CardHeader>
            <CardContent>
              {declarations.length ? (
                <ul className="divide-y">
                  {declarations.map((d) => {
                    const a = allocByDecl.get(d.id);
                    return (
                      <li key={d.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{d.period_label} <span className="text-xs text-muted-foreground">· diumumkan {formatDate(d.announced_on)}</span></p>
                          <StatusBadge map={DECLARATION_STATUS} value={d.status} />
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div><dt className="text-muted-foreground">Diumumkan</dt><dd className="font-semibold">{formatPct(d.rate_bp)}</dd></div>
                          <div><dt className="text-muted-foreground">Bahagian koperasi</dt><dd className="font-semibold">{formatPct(d.coop_rate_bp)}</dd></div>
                          <div><dt className="text-muted-foreground">Bersih ahli</dt><dd className="font-semibold">{formatPct(d.rate_bp - d.coop_rate_bp)}</dd></div>
                          <div><dt className="text-muted-foreground">Dividen saya</dt><dd className={`font-semibold ${d.status === "voided" ? "line-through" : ""}`}>{a ? formatRM(a.amount_sen) : "-"}</dd></div>
                        </dl>
                        {Number(d.fee_sen) > 0 && <p className="mt-1 text-xs text-muted-foreground">Potongan {d.fee_description}: {formatRM(d.fee_sen)} (ditolak sebelum dibahagi)</p>}
                        {d.status === "voided" && <p className="mt-1 text-xs text-danger">Dibatalkan: {d.void_reason}</p>}
                        {d.document_path && <span className="mt-1 block"><FileLink bucket="payout-proofs" path={d.document_path} label="Penyata" /></span>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Belum ada keuntungan diumumkan.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          {open && (
            <Card id="sertai">
              <CardHeader><CardTitle>Sertai projek</CardTitle><CardDescription>Bayar ke akaun koperasi, kemudian hantar bukti bayaran. Hanya bayaran yang disahkan dikira sebagai modal.</CardDescription></CardHeader>
              <CardContent>
                <JoinProjectForm projectId={p.id} userId={userId} targetSen={Number(p.target_sen)} termsVersion={p.terms_version}
                  rules={{ minSen: Number(p.min_sen), stepSen: Number(p.step_sen), maxPerMemberSen: p.max_per_member_sen == null ? null : Number(p.max_per_member_sen),
                    mineSen: myApproved + myPending, availableSen: Number(prog?.available_sen ?? 0) }}
                  bank={<BankDetails bank={bank} />} />
              </CardContent>
            </Card>
          )}

          {Number(w?.available_sen) > 0 && (
            <Card>
              <CardHeader><CardTitle>Pengeluaran dividen</CardTitle><CardDescription>Dividen tersedia: <strong>{formatRM(w?.available_sen)}</strong>. Modal pokok tidak boleh dikeluarkan di sini.</CardDescription></CardHeader>
              <CardContent>
                {bankOk ? <WithdrawForm projectId={p.id} availableSen={Number(w?.available_sen)} bankLabel={`${profile.bank_name} ${profile.bank_account_no}`} />
                  : <Alert tone="warning">Sila lengkapkan akaun bank dalam <Link href="/ahli/profil" className="font-semibold underline">profil</Link> sebelum memohon pengeluaran.</Alert>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Penyertaan saya</CardTitle></CardHeader>
            <CardContent>
              {my.length ? (
                <Table>
                  <THead><TR><TH>Tarikh</TH><TH className="text-right">Jumlah</TH><TH>Status</TH><TH>Resit</TH></TR></THead>
                  <TBody>
                    {my.map((x) => (
                      <TR key={x.id}>
                        <TD>{formatDate(x.payment_date)}<span className="block font-mono text-[11px] text-muted-foreground">{x.transaction_ref}</span></TD>
                        <TD className="text-right font-semibold tabular-nums">{formatRM(x.amount_sen)}</TD>
                        <TD><StatusBadge map={{ ...REVIEW_STATUS, pending: { label: "Menunggu Pengesahan", tone: "warning" } }} value={x.status} />
                          {x.status === "rejected" && x.review_notes && <p className="text-xs text-danger">Sebab: {x.review_notes}</p>}</TD>
                        <TD><FileLink path={x.receipt_path} label="Resit" /></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : <p className="text-sm text-muted-foreground">Anda belum menyertai projek ini.</p>}
            </CardContent>
          </Card>

          {((wds ?? []).length > 0 || (returns ?? []).length > 0) && (
            <Card>
              <CardHeader><CardTitle>Bayaran kepada saya</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {((wds ?? []) as ProjectWithdrawal[]).map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div><p className="font-medium">Dividen {x.withdrawal_no}</p><p className="text-xs text-muted-foreground">{formatDate(x.created_at)}{x.paid_on && ` · dibayar ${formatDate(x.paid_on)}`}</p>
                        {x.review_notes && x.status === "rejected" && <p className="text-xs text-danger">Sebab: {x.review_notes}</p>}</div>
                      <div className="flex items-center gap-2"><span className="font-semibold tabular-nums">{formatRM(x.amount_sen)}</span><StatusBadge map={WITHDRAWAL_STATUS} value={x.status} />
                        {x.status === "pending" && <CancelWithdrawalButton id={x.id} />}
                        {x.proof_path && <FileLink bucket="payout-proofs" path={x.proof_path} label="Resit" />}</div>
                    </li>
                  ))}
                  {((returns ?? []) as CapitalReturn[]).map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div><p className="font-medium">{x.reverses_id ? "Pembalikan " : ""}{x.kind === "refund" ? "Bayaran balik modal" : "Pemulangan modal"}</p><p className="text-xs text-muted-foreground">{formatDate(x.paid_on)} · {x.transaction_ref}</p></div>
                      <div className="flex items-center gap-2"><span className="font-semibold tabular-nums">{x.reverses_id ? "−" : ""}{formatRM(x.amount_sen)}</span><Badge tone="info">Modal</Badge>
                        {x.proof_path && <FileLink bucket="payout-proofs" path={x.proof_path} label="Bukti" />}</div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
