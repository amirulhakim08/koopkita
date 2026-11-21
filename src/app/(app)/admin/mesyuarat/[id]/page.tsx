import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, MapPin, Pencil, Percent, UserMinus, Users, Video, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateLong, formatDateTime, formatTimeKL, formatTimeMs } from "@/lib/format";
import { ATTENDANCE_METHOD, ATTENDANCE_STATUS, MEETING_MODE, MEETING_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { attendanceOpen, platformOf } from "@/features/meetings/meeting-utils";
import { loadMeetingReport, reportFileBase } from "@/features/meetings/report";
import { CodePanel, CorrectionForm, LiveRefresh, MeetingActions, ReportButtons } from "@/features/meetings/admin-controls";

export const metadata = { title: "Mesyuarat" };

const FILTERS = [["", "Semua"], ["present", "Hadir"], ["pending", "Belum Mengesahkan"], ["absent", "Tidak Hadir"], ["excused", "Dikecualikan"]] as const;

export default async function AdminMeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; q?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  await requireAdmin();
  const supabase = await createClient();
  await supabase.rpc("refresh_meetings");
  const [report, { data: code }] = await Promise.all([loadMeetingReport(supabase, id), supabase.rpc("admin_meeting_code", { p_id: id })]);
  if (!report) notFound();
  const m = report.meeting;
  const st = report.stats;
  const open = attendanceOpen(m);
  const q = sp.q?.trim().toLowerCase();
  const rows = report.rows.filter((r) => (!sp.status || r.status === sp.status)
    && (!q || (r.member?.full_name ?? "").toLowerCase().includes(q) || (r.member?.membership_id ?? "").toLowerCase().includes(q)));
  const platform = platformOf(m.online_url);

  return (
    <>
      <Link href="/admin/mesyuarat" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Mesyuarat</Link>
      <PageHeader title={m.title}
        description={<span className="inline-flex flex-wrap items-center gap-2">{m.meeting_no} <StatusBadge map={MEETING_STATUS} value={m.status} /> <LiveRefresh active={open} /></span>}
        actions={!["completed", "cancelled"].includes(m.status) && <Button asChild variant="outline"><Link href={`/admin/mesyuarat/${id}/ubah`}><Pencil /> Ubah</Link></Button>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <StatCard label="Dijemput" value={m.status === "draft" && m.audience === "all" ? "Semua" : st.invited} icon={Users} />
        <StatCard emphasis label="Hadir" value={st.present} icon={CheckCircle2} />
        <StatCard label="Belum mengesahkan" value={st.pending} icon={Clock} />
        <StatCard label="Tidak hadir" value={st.absent} icon={XCircle} />
        <StatCard label="Dikecualikan" value={st.excused} icon={UserMinus} />
        <StatCard label="Kehadiran" value={`${st.rate}%`} icon={Percent} hint="tidak termasuk dikecualikan" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader><CardTitle>Butiran</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /> {formatDateLong(m.meeting_date)} · {formatTimeMs(m.start_time)}{m.end_time && ` – ${formatTimeMs(m.end_time)}`}</p>
            {m.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-primary" /> {m.location}</p>}
            {m.online_url && <p className="flex min-w-0 items-center gap-2"><Video className="size-4 shrink-0 text-primary" /> {platform}: <a href={m.online_url} target="_blank" rel="noopener noreferrer" className="truncate text-primary underline">{m.online_url}</a></p>}
            <p className="text-muted-foreground">{MEETING_MODE[m.mode]} · {m.audience === "all" ? "Semua Ahli Aktif" : "Ahli Terpilih"}</p>
            {m.agenda && <div className="rounded-lg border p-3"><p className="mb-1 font-semibold">Agenda</p><p className="whitespace-pre-line text-muted-foreground">{m.agenda}</p></div>}
            {m.status === "completed" && m.attendance_closes_at && (
              <Alert tone={m.finalized_at ? "neutral" : "info"}>
                {m.finalized_at ? `Sesi kehadiran ditutup ${formatDateTime(m.finalized_at)}. Yang belum mengesahkan direkod Tidak Hadir.`
                  : `Mesyuarat ditamatkan ${formatDateTime(m.ended_at)}. Ahli masih boleh mengesahkan kehadiran sehingga ${formatDateTime(m.attendance_closes_at)}.`}
              </Alert>
            )}
            {m.cancelled_at && <Alert tone="danger">Dibatalkan {formatDateTime(m.cancelled_at)}: {m.cancel_reason}</Alert>}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          {!["draft", "cancelled"].includes(m.status) && !m.finalized_at && (
            <Card>
              <CardHeader><CardTitle>Kod kehadiran</CardTitle>
                <CardDescription>{open ? "Sesi dibuka: peserta boleh memasukkan kod sekarang." : "Sesi belum dibuka. Kod boleh disediakan lebih awal."}</CardDescription></CardHeader>
              <CardContent><CodePanel id={id} code={(code as string | null) ?? null} /></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Tindakan</CardTitle></CardHeader>
            <CardContent>
              <MeetingActions id={id} status={m.status} attendanceOpen={open} finalized={!!m.finalized_at} invitees={st.invited} />
              {(m.status === "completed" && m.finalized_at) && <p className="text-sm text-muted-foreground">Mesyuarat selesai. Gunakan &ldquo;Betulkan&rdquo; pada senarai untuk pembetulan.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {m.status !== "draft" && (
        <Card className="mt-6">
          <CardHeader className="gap-3">
            <CardTitle>Laporan kehadiran</CardTitle>
            <CardDescription>PDF A4 dan Excel (Ringkasan, Hadir, Tidak Hadir, Semua Dijemput). Hanya Super Admin boleh menjana laporan.</CardDescription>
            <ReportButtons id={id} fileBase={reportFileBase(m)} title={`${m.title} (${formatDateLong(m.meeting_date)})`} />
          </CardHeader>
        </Card>
      )}

      <section className="mt-6 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Peserta dijemput</h2>
          <form className="flex flex-wrap gap-2" role="search">
            {sp.status && <input type="hidden" name="status" value={sp.status} />}
            <input name="q" defaultValue={sp.q} placeholder="Cari nama / no. ahli" className="h-9 rounded-lg border border-input bg-white px-3 text-sm" aria-label="Cari peserta" />
            <Button type="submit" size="sm" variant="outline" className="h-9">Cari</Button>
          </form>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Tapis status kehadiran">
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={`/admin/mesyuarat/${id}${k ? `?status=${k}` : ""}`} aria-current={(sp.status ?? "") === k ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 text-sm", (sp.status ?? "") === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{l}</Link>
          ))}
        </nav>
        {m.status === "draft" && m.audience === "all" ? (
          <Alert tone="info">Semua ahli aktif akan dijemput apabila mesyuarat diterbitkan.</Alert>
        ) : (
          <Table>
            <THead><TR><TH>No. Ahli</TH><TH>Nama penuh</TH><TH>Status</TH><TH>Tarikh & masa</TH><TH>Kaedah</TH><TH></TH></TR></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.member_id}>
                  <TD className="font-mono text-xs">{r.member?.membership_id ?? "-"}</TD>
                  <TD>{r.member?.full_name}{r.note && <span className="block text-xs text-muted-foreground">Catatan: {r.note}</span>}</TD>
                  <TD><StatusBadge map={ATTENDANCE_STATUS} value={r.status} /></TD>
                  <TD className="whitespace-nowrap text-xs">{r.confirmed_at ? <>{formatDateLong(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(r.confirmed_at)))}<span className="block">{formatTimeKL(r.confirmed_at)}</span></> : "-"}</TD>
                  <TD className="text-xs">{r.method ? ATTENDANCE_METHOD[r.method] : "-"}</TD>
                  <TD>{!["cancelled"].includes(m.status) && <CorrectionForm meetingId={id} memberId={r.member_id} name={r.member?.full_name ?? ""} status={r.status} finalized={!!m.finalized_at} />}</TD>
                </TR>
              ))}
              {!rows.length && <TR><TD colSpan={6} className="text-center text-sm text-muted-foreground">Tiada peserta dalam tapisan ini.</TD></TR>}
            </TBody>
          </Table>
        )}
      </section>
    </>
  );
}
