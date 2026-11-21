import type { Meeting } from "@/types/db";

/** Google Meet / Zoom / Microsoft Teams from the link, for labels. */
export function platformOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "meet.google.com") return "Google Meet";
    if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
    if (host === "teams.microsoft.com" || host === "teams.live.com" || host.endsWith(".teams.microsoft.com")) return "Microsoft Teams";
    return "Pautan mesyuarat";
  } catch {
    return null;
  }
}

/** Members may still confirm until the session closes (00:01 after the meeting ends). */
export function attendanceOpen(m: Pick<Meeting, "status" | "attendance_open" | "attendance_closes_at" | "finalized_at">, now = Date.now()): boolean {
  if (!m.attendance_open || m.finalized_at) return false;
  if (m.status === "ongoing") return true;
  return m.status === "completed" && !!m.attendance_closes_at && new Date(m.attendance_closes_at).getTime() > now;
}

/** Order for the member's Utama: ongoing, then today, then upcoming (soonest first). */
export function meetingPriority(m: Pick<Meeting, "status" | "meeting_date" | "start_time">, today: string): [number, string] {
  const rank = m.status === "ongoing" ? 0 : m.meeting_date === today ? 1 : 2;
  return [rank, `${m.meeting_date} ${m.start_time}`];
}

export const isValidMeetingUrl = (v: string) => /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/[^\s<>"]*)?$/.test(v);
