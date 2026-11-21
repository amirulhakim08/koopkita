import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTimeMs } from "@/lib/format";
import { MEETING_MODE, MEETING_STATUS } from "@/lib/labels";
import { attendanceStats } from "@/features/meetings/report";
import type { Meeting, MeetingInvitee } from "@/types/db";

export const metadata = { title: "Mesyuarat" };

export default async function AdminMeetingsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin();
  const { q, status } = await searchParams;
  const supabase = await createClient();
  await supabase.rpc("refresh_meetings");
  let query = supabase.from("meetings").select("*").order("meeting_date", { ascending: false }).order("start_time", { ascending: false }).limit(200);
  if (status && status in MEETING_STATUS) query = query.eq("status", status);
  if (q?.trim()) query = query.ilike("title", `%${q.trim().replace(/[%,()]/g, "")}%`);
  const { data: meetings } = await query;
  const ids = (meetings ?? []).map((m) => m.id);
  const { data: inv } = ids.length ? await supabase.from("meeting_invitees").select("meeting_id, status").in("meeting_id", ids) : { data: [] };
  const byMeeting = new Map<string, Pick<MeetingInvitee, "status">[]>();
  for (const r of inv ?? []) byMeeting.set(r.meeting_id, [...(byMeeting.get(r.meeting_id) ?? []), r]);

  return (
    <>
      <PageHeader title="Mesyuarat" description="Urus mesyuarat, jemputan, kod kehadiran dan laporan."
        actions={<Button asChild><Link href="/admin/mesyuarat/baharu"><Plus /> Mesyuarat Baharu</Link></Button>} />
      <SearchBar q={q} placeholder="Cari tajuk mesyuarat" filters={[{ name: "status", value: status, label: "Status", options: Object.entries(MEETING_STATUS).map(([k, v]) => [k, v.label]) }]} />
      {meetings?.length ? (
        <Table>
          <THead><TR><TH>Tarikh</TH><TH>Mesyuarat</TH><TH>Jenis</TH><TH className="text-right">Dijemput</TH><TH className="text-right">Hadir</TH><TH className="text-right">Kehadiran</TH><TH>Status</TH></TR></THead>
          <TBody>
            {(meetings as Meeting[]).map((m) => {
              const st = attendanceStats(byMeeting.get(m.id) ?? []);
              return (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap">{formatDate(m.meeting_date)}<span className="block text-xs text-muted-foreground">{formatTimeMs(m.start_time)}</span></TD>
                  <TD><Link href={`/admin/mesyuarat/${m.id}`} className="font-medium hover:underline">{m.title}</Link><span className="block text-xs text-muted-foreground">{m.meeting_no} · {m.audience === "all" ? "Semua ahli aktif" : "Ahli terpilih"}</span></TD>
                  <TD>{MEETING_MODE[m.mode]}</TD>
                  <TD className="text-right tabular-nums">{m.status === "draft" && m.audience === "all" ? "-" : st.invited}</TD>
                  <TD className="text-right tabular-nums">{st.present}</TD>
                  <TD className="text-right tabular-nums">{st.invited ? `${st.rate}%` : "-"}</TD>
                  <TD><StatusBadge map={MEETING_STATUS} value={m.status} />{m.attendance_open && <span className="ml-1 text-xs text-success">● sesi dibuka</span>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : <EmptyState icon={CalendarDays} title="Belum ada mesyuarat" action={<Button asChild><Link href="/admin/mesyuarat/baharu"><Plus /> Mesyuarat Baharu</Link></Button>} />}
    </>
  );
}
