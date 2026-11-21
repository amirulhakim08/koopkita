import Link from "next/link";
import { CalendarDays, MapPin, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateLong, formatTimeMs } from "@/lib/format";
import { ATTENDANCE_STATUS, MEETING_MODE } from "@/lib/labels";
import type { Meeting, MeetingInvitee } from "@/types/db";
import { attendanceOpen, platformOf } from "./meeting-utils";

export function meetingWhere(m: Pick<Meeting, "mode" | "location" | "online_url">) {
  const p = platformOf(m.online_url);
  if (m.mode === "online") return `Online — ${p ?? "pautan"}`;
  if (m.mode === "hybrid") return `Hybrid — ${m.location ?? ""}${p ? ` + ${p}` : ""}`;
  return m.location ?? MEETING_MODE[m.mode];
}

/** Member's meeting card on Utama: ongoing, today or the next one. */
export function MeetingCard({ meeting: m, invite, today }: { meeting: Meeting; invite?: MeetingInvitee; today: string }) {
  const label = m.status === "ongoing" ? "SEDANG BERLANGSUNG" : m.meeting_date === today ? "MESYUARAT HARI INI" : "MESYUARAT AKAN DATANG";
  const open = attendanceOpen(m);
  const href = `/ahli/mesyuarat/${m.id}`;
  return (
    <div className={cn("rounded-xl border p-4 sm:p-5", m.status === "ongoing" ? "border-primary/30 bg-primary text-primary-foreground" : "bg-white")}>
      <Link href={href} className="block">
        <p className={cn("text-xs font-bold tracking-wide", m.status === "ongoing" ? "text-[var(--chart-4)]" : "text-primary")}>{label}</p>
        <p className="mt-1 text-lg font-bold leading-tight">{m.title}</p>
        <p className={cn("mt-1 flex items-center gap-1.5 text-sm", m.status === "ongoing" ? "text-primary-foreground/85" : "text-muted-foreground")}>
          <CalendarDays className="size-4 shrink-0" /> {formatDateLong(m.meeting_date)} | {formatTimeMs(m.start_time)}
        </p>
        <p className={cn("mt-0.5 flex items-center gap-1.5 text-sm", m.status === "ongoing" ? "text-primary-foreground/85" : "text-muted-foreground")}>
          {m.mode === "physical" ? <MapPin className="size-4 shrink-0" /> : <Video className="size-4 shrink-0" />} {meetingWhere(m)}
        </p>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.online_url && m.mode !== "physical" && (
          <Button asChild size="sm" variant={m.status === "ongoing" ? "secondary" : "default"}>
            <a href={m.online_url} target="_blank" rel="noopener noreferrer">Sertai Mesyuarat</a>
          </Button>
        )}
        {invite?.status === "present" ? <StatusBadge map={ATTENDANCE_STATUS} value="present" />
          : open ? <Button asChild size="sm" variant={m.status === "ongoing" ? "secondary" : "outline"}><Link href={`${href}#hadir`}>Sahkan Hadir</Link></Button>
          : <Button asChild size="sm" variant="ghost" className={m.status === "ongoing" ? "text-primary-foreground hover:bg-white/10" : ""}><Link href={href}>Butiran</Link></Button>}
      </div>
    </div>
  );
}
