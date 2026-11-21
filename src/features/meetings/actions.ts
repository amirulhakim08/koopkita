"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMember, requireAdmin } from "@/lib/auth";
import { fail, type ActionState } from "@/lib/errors";
import { callRpc } from "@/lib/rpc";
import { fieldErrors } from "@/lib/validation";
import { isValidMeetingUrl } from "./meeting-utils";

const trim = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : trim(v));
const uuid = z.string().uuid();
const paths = (id?: string) => ["/admin/mesyuarat", "/ahli", ...(id ? [`/ahli/mesyuarat/${id}`] : [])];

const meetingSchema = z
  .object({
    id: z.preprocess(emptyToUndef, uuid.optional()),
    title: z.preprocess(trim, z.string().min(3, "Tajuk diperlukan").max(200)),
    agenda: z.preprocess(emptyToUndef, z.string().max(8000).optional()),
    meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarikh tidak sah"),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Masa tidak sah"),
    end_time: z.preprocess(emptyToUndef, z.string().regex(/^\d{2}:\d{2}$/, "Masa tidak sah").optional()),
    mode: z.enum(["physical", "online", "hybrid"], { message: "Sila pilih jenis mesyuarat" }),
    location: z.preprocess(emptyToUndef, z.string().max(300).optional()),
    online_url: z.preprocess(emptyToUndef, z.string().max(500).optional()),
    audience: z.enum(["all", "selected"]),
  })
  .refine((d) => !d.end_time || d.end_time > d.start_time, { path: ["end_time"], message: "Masa tamat mesti selepas masa mula" })
  .refine((d) => d.mode === "online" || !!d.location, { path: ["location"], message: "Lokasi diperlukan" })
  .refine((d) => d.mode === "physical" || (!!d.online_url && isValidMeetingUrl(d.online_url)), {
    path: ["online_url"], message: "Masukkan pautan https:// yang sah (Google Meet, Zoom atau Teams)",
  });

export async function saveMeetingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = meetingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat mesyuarat.", fieldErrors(parsed.error));
  const d = parsed.data;
  const ids = formData.getAll("member_ids").filter((v): v is string => typeof v === "string" && uuid.safeParse(v).success);
  if (d.audience === "selected" && ids.length === 0) return fail("Sila pilih sekurang-kurangnya seorang peserta.", { member_ids: ["Pilih peserta"] });
  const res = await callRpc<string>("save_meeting", {
    p_id: d.id ?? null,
    p_data: { title: d.title, agenda: d.agenda ?? "", meeting_date: d.meeting_date, start_time: d.start_time, end_time: d.end_time ?? "",
      mode: d.mode, location: d.location ?? "", online_url: d.online_url ?? "", audience: d.audience },
    p_member_ids: d.audience === "selected" ? ids : null,
  }, { success: "Mesyuarat disimpan.", revalidate: paths(d.id) });
  if (!res.ok) return res;
  redirect(`/admin/mesyuarat/${res.data}`);
}

const idAction = (fn: string, success: string) => async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
  await requireAdmin();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  return callRpc(fn, { p_id: id.data }, { success, revalidate: paths(id.data) });
};

export async function publishMeetingAction(prev: ActionState, formData: FormData) {
  return idAction("publish_meeting", "Mesyuarat diterbitkan. Notifikasi dihantar kepada peserta.")(prev, formData);
}
export async function openAttendanceAction(prev: ActionState, formData: FormData) {
  return idAction("open_attendance", "Sesi kehadiran dibuka. Berikan kod kepada peserta.")(prev, formData);
}
export async function closeAttendanceAction(prev: ActionState, formData: FormData) {
  return idAction("close_attendance", "Sesi kehadiran ditutup.")(prev, formData);
}
export async function endMeetingAction(prev: ActionState, formData: FormData) {
  return idAction("end_meeting", "Mesyuarat ditamatkan. Ahli masih boleh mengesahkan kehadiran sehingga 12:01 pagi.")(prev, formData);
}

export async function cancelMeetingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, reason: z.preprocess(trim, z.string().min(5, "Sebab diperlukan").max(500)) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila nyatakan sebab pembatalan.", fieldErrors(parsed.error));
  return callRpc("cancel_meeting", { p_id: parsed.data.id, p_reason: parsed.data.reason }, { success: "Mesyuarat dibatalkan.", revalidate: paths(parsed.data.id) });
}

export async function setMeetingCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, code: z.preprocess(emptyToUndef, z.string().regex(/^\d{5}$/, "Kod mesti 5 digit").optional()) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Kod mesti 5 digit nombor.", fieldErrors(parsed.error));
  return callRpc("set_meeting_code", { p_id: parsed.data.id, p_code: parsed.data.code ?? null }, {
    success: "Kod baharu ditetapkan. Kod lama tidak lagi sah.", revalidate: ["/admin/mesyuarat"],
  });
}

export async function setAttendanceStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.object({
    meeting_id: uuid, member_id: uuid, status: z.enum(["pending", "present", "absent", "excused"]),
    reason: z.preprocess(trim, z.string().min(5, "Sebab diperlukan (sekurang-kurangnya 5 aksara)").max(500)),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila nyatakan sebab pembetulan.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("set_attendance_status", { p_meeting_id: d.meeting_id, p_member_id: d.member_id, p_status: d.status, p_reason: d.reason }, {
    success: "Status kehadiran dikemas kini.", revalidate: paths(d.meeting_id),
  });
}

export async function confirmAttendanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const parsed = z.object({ meeting_id: uuid, code: z.preprocess(trim, z.string().regex(/^\d{5}$/, "Masukkan kod 5 digit")) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Masukkan kod 5 digit.", fieldErrors(parsed.error));
  const res = await callRpc<{ ok: boolean; message: string }>("confirm_attendance", { p_meeting_id: parsed.data.meeting_id, p_code: parsed.data.code }, {
    success: "", revalidate: ["/ahli"],
  });
  if (!res.ok) return res;
  const r = res.data!;
  return r.ok ? { ok: true, message: r.message } : fail(r.message, { code: [r.message] });
}
