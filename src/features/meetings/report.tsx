import "server-only";
import ExcelJS from "exceljs";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatDateLong, formatDateTime, formatTimeKL, formatTimeMs } from "@/lib/format";
import { ATTENDANCE_METHOD, ATTENDANCE_STATUS, MEETING_MODE, MEETING_STATUS } from "@/lib/labels";
import { loadLogo } from "@/features/business/pdf";
import type { Meeting, MeetingInvitee } from "@/types/db";
import { platformOf } from "./meeting-utils";

export type ReportRow = MeetingInvitee & { member: { full_name: string; membership_id: string | null } | null };
export type MeetingReport = {
  meeting: Meeting; rows: ReportRow[];
  coop: { name: string; reg_no: string | null; address: string | null; phone: string | null; email: string | null; logo_path: string | null };
  stats: { invited: number; present: number; pending: number; absent: number; excused: number; rate: number };
};

export function attendanceStats(rows: Pick<MeetingInvitee, "status">[]) {
  const c = (s: string) => rows.filter((r) => r.status === s).length;
  const invited = rows.length;
  const present = c("present");
  const excused = c("excused");
  // attendance rate excludes members who were excused
  const base = invited - excused;
  return { invited, present, pending: c("pending"), absent: c("absent"), excused, rate: base > 0 ? Math.round((present / base) * 1000) / 10 : 0 };
}

export async function loadMeetingReport(sb: SupabaseClient, id: string): Promise<MeetingReport | null> {
  const [{ data: meeting }, { data: rows }, { data: settings }] = await Promise.all([
    sb.from("meetings").select("*").eq("id", id).maybeSingle(),
    sb.from("meeting_invitees").select("*, member:profiles!meeting_invitees_member_id_fkey(full_name, membership_id)").eq("meeting_id", id),
    sb.from("system_settings").select("key, value").in("key", ["coop_name", "coop_reg_no", "coop_address", "coop_phone", "coop_email", "coop_logo_path"]),
  ]);
  if (!meeting) return null;
  const st = Object.fromEntries((settings ?? []).map((r) => [r.key, typeof r.value === "string" ? r.value : null]));
  const sorted = ((rows ?? []) as ReportRow[]).sort((a, b) =>
    (a.member?.membership_id ?? "").localeCompare(b.member?.membership_id ?? "") || (a.member?.full_name ?? "").localeCompare(b.member?.full_name ?? ""));
  return {
    meeting: meeting as Meeting, rows: sorted, stats: attendanceStats(sorted),
    coop: { name: st.coop_name ?? "Koperasi Industri Tani Agropelancongan Kedah Berhad", reg_no: st.coop_reg_no, address: st.coop_address,
      phone: st.coop_phone, email: st.coop_email, logo_path: st.coop_logo_path },
  };
}

export const where = (m: Meeting) =>
  m.mode === "online" ? `Online (${platformOf(m.online_url) ?? "pautan"})` : m.mode === "hybrid" ? `${m.location} + ${platformOf(m.online_url) ?? "online"}` : m.location ?? "-";
export const reportFileBase = (m: Meeting) => `Kehadiran-${m.meeting_no}-${m.meeting_date}`;
const timeRange = (m: Meeting) => `${formatTimeMs(m.start_time)}${m.end_time ? ` – ${formatTimeMs(m.end_time)}` : ""}`;

// --------------------------------------------------------------------------- PDF

const GREEN = "#1b4332";
const MUTED = "#5c6b62";
const BORDER = "#dfe6de";
const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 48, fontSize: 9.5, fontFamily: "Helvetica", color: "#142019" },
  head: { flexDirection: "row", gap: 12, alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: GREEN, paddingBottom: 10, marginBottom: 14 },
  logo: { width: 54, height: 54, objectFit: "contain" },
  coop: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GREEN },
  small: { fontSize: 8, color: MUTED, lineHeight: 1.4 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: GREEN },
  sub: { fontSize: 9, color: MUTED, marginTop: 2 },
  meta: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, marginBottom: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 8 },
  metaItem: { width: "50%", paddingVertical: 2 },
  label: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 },
  stats: { flexDirection: "row", gap: 6, marginBottom: 14 },
  stat: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 6, alignItems: "center" },
  statNum: { fontSize: 15, fontFamily: "Helvetica-Bold", color: GREEN },
  h2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: GREEN, marginTop: 10, marginBottom: 4 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 4, paddingHorizontal: 6 },
  th: { backgroundColor: "#f1f5f0", fontSize: 7.5, color: MUTED, fontFamily: "Helvetica-Bold" },
  cNo: { width: 22, color: MUTED },
  cId: { width: 70 },
  cName: { flexGrow: 1, flexBasis: 0 },
  cWhen: { width: 110 },
  cHow: { width: 50 },
  foot: { position: "absolute", bottom: 22, left: 36, right: 36, fontSize: 7, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

function Section({ title, rows, showWhen }: { title: string; rows: ReportRow[]; showWhen: boolean }) {
  return (
    <View wrap>
      <Text style={s.h2}>{title} ({rows.length})</Text>
      {rows.length ? (
        <View style={s.table}>
          <View style={[s.tr, s.th]} fixed>
            <Text style={s.cNo}>#</Text><Text style={s.cId}>No. Ahli</Text><Text style={s.cName}>Nama</Text>
            {showWhen ? <><Text style={s.cWhen}>Disahkan</Text><Text style={s.cHow}>Kaedah</Text></> : <Text style={s.cWhen}>Catatan</Text>}
          </View>
          {rows.map((r, i) => (
            <View key={r.member_id} style={s.tr} wrap={false}>
              <Text style={s.cNo}>{i + 1}</Text><Text style={s.cId}>{r.member?.membership_id ?? "-"}</Text><Text style={s.cName}>{r.member?.full_name ?? "-"}</Text>
              {showWhen ? <><Text style={s.cWhen}>{formatDateTime(r.confirmed_at)}</Text><Text style={s.cHow}>{r.method ? ATTENDANCE_METHOD[r.method] : "-"}</Text></>
                : <Text style={s.cWhen}>{r.note ?? "-"}</Text>}
            </View>
          ))}
        </View>
      ) : <Text style={s.small}>Tiada.</Text>}
    </View>
  );
}

function ReportDoc({ r, logo }: { r: MeetingReport; logo: Awaited<ReturnType<typeof loadLogo>> }) {
  const m = r.meeting;
  const st = r.stats;
  const by = (x: string) => r.rows.filter((row) => row.status === x);
  return (
    <Document title={`Laporan Kehadiran ${m.meeting_no}`} author={r.coop.name} creator="KoopKITA">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logo && <Image style={s.logo} src={logo} />}
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            <Text style={s.coop}>{r.coop.name}</Text>
            {r.coop.reg_no && <Text style={s.small}>No. Pendaftaran: {r.coop.reg_no}</Text>}
            {r.coop.address && <Text style={s.small}>{r.coop.address}</Text>}
            {(r.coop.phone || r.coop.email) && <Text style={s.small}>{[r.coop.phone, r.coop.email].filter(Boolean).join("  ·  ")}</Text>}
          </View>
        </View>
        <Text style={s.title}>LAPORAN KEHADIRAN MESYUARAT</Text>
        <Text style={s.sub}>{m.title} · {m.meeting_no}</Text>
        <View style={s.meta}>
          <View style={s.metaItem}><Text style={s.label}>Tarikh</Text><Text>{formatDateLong(m.meeting_date)}</Text></View>
          <View style={s.metaItem}><Text style={s.label}>Masa</Text><Text>{timeRange(m)}</Text></View>
          <View style={s.metaItem}><Text style={s.label}>Jenis</Text><Text>{MEETING_MODE[m.mode]}</Text></View>
          <View style={s.metaItem}><Text style={s.label}>Lokasi</Text><Text>{where(m)}</Text></View>
          <View style={s.metaItem}><Text style={s.label}>Status mesyuarat</Text><Text>{MEETING_STATUS[m.status]?.label}</Text></View>
          <View style={s.metaItem}><Text style={s.label}>Peserta</Text><Text>{m.audience === "all" ? "Semua Ahli Aktif" : "Ahli Terpilih"}</Text></View>
        </View>
        <View style={s.stats}>
          {[["Dijemput", st.invited], ["Hadir", st.present], ["Belum Mengesahkan", st.pending], ["Tidak Hadir", st.absent], ["Dikecualikan", st.excused], ["Kehadiran", `${st.rate}%`]].map(([l, v]) => (
            <View key={String(l)} style={s.stat}><Text style={s.statNum}>{String(v)}</Text><Text style={s.small}>{String(l)}</Text></View>
          ))}
        </View>
        <Section title="Hadir" rows={by("present")} showWhen />
        <Section title="Tidak Hadir" rows={by("absent")} showWhen={false} />
        <Section title="Dikecualikan" rows={by("excused")} showWhen={false} />
        {st.pending > 0 && <Section title="Belum Mengesahkan" rows={by("pending")} showWhen={false} />}
        <View style={s.foot} fixed>
          <Text>Dijana melalui KoopKITA pada {formatDateTime(new Date())}. Peratus kehadiran tidak mengambil kira ahli yang dikecualikan.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderMeetingPdf(r: MeetingReport): Promise<Buffer> {
  const logo = await loadLogo(r.coop.logo_path);
  return renderToBuffer(<ReportDoc r={r} logo={logo} />);
}

// --------------------------------------------------------------------------- Excel

export async function renderMeetingXlsx(r: MeetingReport): Promise<Buffer> {
  const m = r.meeting;
  const wb = new ExcelJS.Workbook();
  wb.creator = "KoopKITA";
  wb.created = new Date();
  const green = "FF1B4332";

  const summary = wb.addWorksheet("Ringkasan Mesyuarat", { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 26 }, { width: 60 }];
  summary.addRow([r.coop.name]).font = { bold: true, size: 14, color: { argb: green } };
  summary.addRow(["Laporan Kehadiran Mesyuarat"]).font = { bold: true, size: 12 };
  summary.addRow([]);
  const info: [string, string | number][] = [
    ["No. Mesyuarat", m.meeting_no], ["Tajuk", m.title], ["Tarikh", formatDateLong(m.meeting_date)], ["Masa", timeRange(m)],
    ["Jenis", MEETING_MODE[m.mode]], ["Lokasi", where(m)], ["Status mesyuarat", MEETING_STATUS[m.status]?.label ?? m.status],
    ["Peserta", m.audience === "all" ? "Semua Ahli Aktif" : "Ahli Terpilih"], ["", ""],
    ["Jumlah dijemput", r.stats.invited], ["Hadir", r.stats.present], ["Belum mengesahkan", r.stats.pending],
    ["Tidak hadir", r.stats.absent], ["Dikecualikan", r.stats.excused], ["Peratus kehadiran (%)", r.stats.rate],
    ["", ""], ["Dijana pada", formatDateTime(new Date())],
  ];
  for (const [k, v] of info) {
    const row = summary.addRow([k, v]);
    row.getCell(1).font = { bold: true, color: { argb: "FF5C6B62" } };
    row.getCell(2).alignment = { horizontal: "left", wrapText: true };
  }

  const columns = [
    { header: "No.", key: "no", width: 6 }, { header: "No. Ahli", key: "id", width: 14 }, { header: "Nama", key: "name", width: 36 },
    { header: "Status", key: "status", width: 20 }, { header: "Tarikh Pengesahan", key: "date", width: 18 },
    { header: "Masa Pengesahan", key: "time", width: 16 }, { header: "Kaedah Pengesahan", key: "method", width: 18 }, { header: "Catatan", key: "note", width: 36 },
  ];
  const sheet = (name: string, rows: ReportRow[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columns;
    rows.forEach((x, i) => ws.addRow({
      no: i + 1, id: x.member?.membership_id ?? "", name: x.member?.full_name ?? "", status: ATTENDANCE_STATUS[x.status]?.label ?? x.status,
      date: x.confirmed_at ? formatDate(x.confirmed_at) : "", time: x.confirmed_at ? formatTimeKL(x.confirmed_at) : "",
      method: x.method ? ATTENDANCE_METHOD[x.method] : "", note: x.note ?? "",
    }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: green } };
    head.alignment = { vertical: "middle" };
    head.height = 20;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rows.length + 1, 1), column: columns.length } };
    ws.eachRow((row, n) => {
      if (n > 1) row.eachCell((c) => { c.border = { bottom: { style: "thin", color: { argb: "FFDFE6DE" } } }; });
    });
  };
  sheet("Senarai Hadir", r.rows.filter((x) => x.status === "present"));
  sheet("Senarai Tidak Hadir", r.rows.filter((x) => x.status === "absent"));
  sheet("Semua Peserta Dijemput", r.rows);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
