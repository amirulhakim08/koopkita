import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateLong, formatTimeMs, todayKL } from "@/lib/format";
import { ATTENDANCE_STATUS, MEETING_STATUS } from "@/lib/labels";
import { MeetingCard, meetingWhere } from "@/features/meetings/meeting-card";
import { meetingPriority } from "@/features/meetings/meeting-utils";
import type { Meeting, MeetingInvitee } from "@/types/db";

export const metadata = { title: "Mesyuarat" };

export default async function MemberMeetingsPage() {
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  await supabase.rpc("refresh_meetings");
  const [{ data: meetings }, { data: invites }] = await Promise.all([
    supabase.from("meetings").select("*").order("meeting_date", { ascending: false }).order("start_time", { ascending: false }),
    supabase.from("meeting_invitees").select("*").eq("member_id", userId),
  ]);
  const inv = new Map(((invites ?? []) as MeetingInvitee[]).map((i) => [i.meeting_id, i]));
  const today = todayKL();
  const list = (meetings ?? []) as Meeting[];
  const upcoming = list.filter((m) => m.status === "ongoing" || (m.status === "scheduled" && m.meeting_date >= today))
    .sort((a, b) => { const [ra, ka] = meetingPriority(a, today); const [rb, kb] = meetingPriority(b, today); return ra - rb || ka.localeCompare(kb); });
  const history = list.filter((m) => !upcoming.includes(m));

  return (
    <>
      <PageHeader title="Mesyuarat saya" description="Mesyuarat yang anda dijemput dan status kehadiran anda." />
      {upcoming.length > 0 && (
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {upcoming.map((m) => <MeetingCard key={m.id} meeting={m} invite={inv.get(m.id)} today={today} />)}
        </div>
      )}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sejarah</h2>
      {history.length ? (
        <ul className="divide-y rounded-xl border bg-white">
          {history.map((m) => (
            <li key={m.id}>
              <Link href={`/ahli/mesyuarat/${m.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateLong(m.meeting_date)} · {formatTimeMs(m.start_time)} · {meetingWhere(m)}</p>
                </div>
                {m.status === "cancelled" ? <StatusBadge map={MEETING_STATUS} value="cancelled" /> : <StatusBadge map={ATTENDANCE_STATUS} value={inv.get(m.id)?.status ?? "pending"} />}
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={CalendarDays} title="Tiada sejarah mesyuarat" />}
    </>
  );
}
