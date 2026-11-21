import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, MapPin, Video } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateLong, formatDateTime, formatTimeMs } from "@/lib/format";
import { ATTENDANCE_STATUS, MEETING_MODE, MEETING_STATUS } from "@/lib/labels";
import { attendanceOpen, platformOf } from "@/features/meetings/meeting-utils";
import { ConfirmAttendanceForm } from "@/features/meetings/confirm-form";
import type { Meeting, MeetingInvitee } from "@/types/db";

export const metadata = { title: "Mesyuarat" };

export default async function MemberMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  await supabase.rpc("refresh_meetings");
  const [{ data: meeting }, { data: invite }] = await Promise.all([
    supabase.from("meetings").select("*").eq("id", id).maybeSingle(),
    supabase.from("meeting_invitees").select("*").eq("meeting_id", id).eq("member_id", userId).maybeSingle(),
  ]);
  if (!meeting || !invite) notFound(); // only invitees can see a meeting
  const m = meeting as Meeting;
  const i = invite as MeetingInvitee;
  const open = attendanceOpen(m);
  const platform = platformOf(m.online_url);

  return (
    <>
      <Link href="/ahli/mesyuarat" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Mesyuarat saya</Link>
      <PageHeader title={m.title} description={<span className="inline-flex flex-wrap items-center gap-2">{m.meeting_no} <StatusBadge map={MEETING_STATUS} value={m.status} /></span>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader><CardTitle>Butiran mesyuarat</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /> {formatDateLong(m.meeting_date)} | {formatTimeMs(m.start_time)}{m.end_time && ` – ${formatTimeMs(m.end_time)}`}</p>
            {m.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-primary" /> {m.location}</p>}
            {m.mode !== "physical" && <p className="flex items-center gap-2"><Video className="size-4 text-primary" /> {MEETING_MODE[m.mode]} — {platform}</p>}
            {m.online_url && m.mode !== "physical" && !["completed", "cancelled"].includes(m.status) && (
              <Button asChild className="w-full sm:w-auto"><a href={m.online_url} target="_blank" rel="noopener noreferrer"><Video /> Sertai Mesyuarat</a></Button>
            )}
            {m.agenda && <div className="rounded-lg border p-3"><p className="mb-1 font-semibold">Agenda</p><p className="whitespace-pre-line text-muted-foreground">{m.agenda}</p></div>}
            {m.cancelled_at && <Alert tone="danger">Mesyuarat ini dibatalkan. Sebab: {m.cancel_reason}</Alert>}
          </CardContent>
        </Card>

        <Card id="hadir" className="min-w-0 scroll-mt-20 lg:col-span-2">
          <CardHeader>
            <CardTitle>Kehadiran saya</CardTitle>
            <CardDescription>Menekan &ldquo;Sertai Mesyuarat&rdquo; tidak dikira sebagai hadir. Kehadiran hanya direkod selepas kod yang sah dimasukkan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">Status</span><StatusBadge map={ATTENDANCE_STATUS} value={i.status} /></div>
            {i.status === "present" ? (
              <Alert tone="success" title="Kehadiran disahkan"><CheckCircle2 className="hidden" />Direkod pada {formatDateTime(i.confirmed_at)}{i.method === "manual" ? " oleh pentadbir" : ""}.</Alert>
            ) : open && i.status === "pending" ? (
              <>
                {m.status === "completed" && m.attendance_closes_at && <Alert tone="info">Mesyuarat telah tamat. Anda masih boleh mengesahkan kehadiran sehingga {formatDateTime(m.attendance_closes_at)}.</Alert>}
                <ConfirmAttendanceForm meetingId={m.id} />
              </>
            ) : m.status === "scheduled" || (m.status === "ongoing" && !m.attendance_open) ? (
              <p className="text-sm text-muted-foreground">Butang pengesahan akan dibuka apabila pentadbir memulakan sesi kehadiran semasa mesyuarat.</p>
            ) : i.note ? <p className="text-sm text-muted-foreground">Catatan: {i.note}</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
