/**
 * Meetings and attendance: invitations, attendance code, grace period,
 * manual corrections and privacy. Runs the real migrations on PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { asRole, asUser, createActiveMember, createAdmin, freshDatabase, signUp } from "./db";

let pool: Pool;
let admin: string;
let seq = 0;
const member = (p = "m") => createActiveMember(pool, admin, `${p}-${++seq}@mesyuarat.test`);

beforeAll(async () => {
  pool = await freshDatabase("koopkita_meetings");
  admin = await createAdmin(pool);
});
afterAll(async () => {
  await pool.end();
});

const base = (o: Record<string, unknown> = {}) => ({
  title: "Mesyuarat Ahli Lembaga", agenda: "1. Doa\n2. Kata aluan", meeting_date: "2026-11-21", start_time: "20:30",
  end_time: "22:00", mode: "online", online_url: "https://meet.google.com/abc-defg-hij", audience: "selected", ...o,
});
const create = async (o: Record<string, unknown> = {}, ids: string[] | null = null) =>
  (await asUser<{ id: string }>(pool, admin, `select public.save_meeting(null, $1, $2) as id`, [base(o), ids]))[0].id;
const confirm = async (uid: string, id: string, code: string) =>
  (await asUser<{ r: { ok: boolean; message: string; remaining?: number; already?: boolean } }>(
    pool, uid, `select public.confirm_attendance($1, $2) as r`, [id, code]))[0].r;
const status = async (id: string, uid: string) =>
  (await pool.query(`select status, method from public.meeting_invitees where meeting_id = $1 and member_id = $2`, [id, uid])).rows[0];
const notes = async (uid: string, type: string) =>
  (await pool.query(`select count(*)::int c from public.notifications where user_id = $1 and type = $2`, [uid, type])).rows[0].c as number;

describe("invitations", () => {
  it("only the 10 selected members are invited, notified and can see the meeting", async () => {
    const board = await Promise.all(Array.from({ length: 10 }, () => member("lembaga")));
    const others = await Promise.all(Array.from({ length: 2 }, () => member("biasa")));
    const id = await create({}, board);
    expect(await asUser(pool, board[0], `select id from public.meetings where id = $1`, [id])).toHaveLength(0); // draft hidden
    const [{ n }] = await asUser<{ n: number }>(pool, admin, `select public.publish_meeting($1) as n`, [id]);
    expect(n).toBe(10);
    for (const b of board) expect(await notes(b, "meeting_invited")).toBe(1);
    for (const o of others) expect(await notes(o, "meeting_invited")).toBe(0);
    expect(await asUser(pool, board[3], `select id from public.meetings where id = $1`, [id])).toHaveLength(1);
    expect(await asUser(pool, others[0], `select id from public.meetings where id = $1`, [id])).toHaveLength(0);
    // a member sees only their own invitation row, never the other invitees
    const rows = await asUser<{ member_id: string }>(pool, board[0], `select member_id from public.meeting_invitees where meeting_id = $1`, [id]);
    expect(rows.map((r) => r.member_id)).toEqual([board[0]]);
    const link = (await pool.query(`select link from public.notifications where user_id = $1 and type = 'meeting_invited'`, [board[0]])).rows[0].link;
    expect(link).toBe(`/ahli/mesyuarat/${id}`);
  });

  it("'all active members' takes the active members when publishing", async () => {
    const pending = await signUp(pool, `belum-${++seq}@mesyuarat.test`);
    const id = await create({ audience: "all", mode: "physical", online_url: null, location: "Dewan Koperasi, Alor Setar" });
    await asUser(pool, admin, `select public.publish_meeting($1)`, [id]);
    const { rows } = await pool.query(`select count(*)::int c from public.meeting_invitees where meeting_id = $1`, [id]);
    const active = (await pool.query(`select count(*)::int c from public.profiles where status = 'active'`)).rows[0].c;
    expect(rows[0].c).toBe(active);
    expect((await pool.query(`select 1 from public.meeting_invitees where meeting_id = $1 and member_id = $2`, [id, pending])).rowCount).toBe(0);
  });

  it("validates links (https only), location and the participant choice", async () => {
    const m = await member();
    await expect(create({ online_url: "http://meet.google.com/x" }, [m])).rejects.toThrow(/https/);
    await expect(create({ online_url: "javascript:alert(1)" }, [m])).rejects.toThrow(/https/);
    await expect(create({ mode: "hybrid", location: "" }, [m])).rejects.toThrow(/Lokasi/);
    await expect(create({}, [])).rejects.toThrow(/sekurang-kurangnya seorang/);
    await expect(asUser(pool, m, `select public.save_meeting(null, $1, null)`, [base({ audience: "all" })])).rejects.toThrow(/FORBIDDEN/);
  });

  it("updates notify invitees; cancellation notifies them and blocks attendance", async () => {
    const [a, b] = [await member(), await member()];
    const id = await create({}, [a, b]);
    await asUser(pool, admin, `select public.publish_meeting($1)`, [id]);
    await asUser(pool, admin, `select public.save_meeting($1, $2, $3)`, [id, base({ start_time: "21:00" }), [a, b]]);
    expect(await notes(a, "meeting_updated")).toBe(1);
    await expect(asUser(pool, admin, `select public.cancel_meeting($1, 'x')`, [id])).rejects.toThrow(/sebab/);
    await asUser(pool, admin, `select public.cancel_meeting($1, 'Pengerusi tiada')`, [id]);
    expect(await notes(b, "meeting_cancelled")).toBe(1);
    await expect(asUser(pool, admin, `select public.open_attendance($1)`, [id])).rejects.toThrow(/tidak boleh dibuka/);
  });
});

describe("attendance code", () => {
  let id: string;
  let invitees: string[];
  let outsider: string;
  beforeAll(async () => {
    invitees = await Promise.all(Array.from({ length: 4 }, () => member("hadir")));
    outsider = await member("luar");
    id = await create({}, invitees);
    await asUser(pool, admin, `select public.publish_meeting($1)`, [id]);
  });

  it("is refused before the session opens, then accepted with the admin's code 31234", async () => {
    await expect(confirm(invitees[0], id, "31234")).rejects.toThrow(/belum dibuka/);
    await asUser(pool, admin, `select public.open_attendance($1)`, [id]);
    expect((await pool.query(`select status from public.meetings where id = $1`, [id])).rows[0].status).toBe("ongoing");
    const [{ code }] = await asUser<{ code: string }>(pool, admin, `select public.set_meeting_code($1, '31234') as code`, [id]);
    expect(code).toBe("31234");
    const wrong = await confirm(invitees[0], id, "11111");
    expect([wrong.ok, wrong.remaining]).toEqual([false, 4]);
    const ok = await confirm(invitees[0], id, "31234");
    expect(ok.ok).toBe(true);
    expect(await status(id, invitees[0])).toEqual({ status: "present", method: "code" });
    expect((await confirm(invitees[0], id, "31234")).already).toBe(true); // no double attendance
    expect(await status(id, invitees[1])).toEqual({ status: "pending", method: null });
  });

  it("never exposes the code to members", async () => {
    await expect(asUser(pool, invitees[1], `select * from app_private.meeting_codes`)).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, invitees[1], `select public.admin_meeting_code($1)`, [id])).rejects.toThrow(/FORBIDDEN/);
    const [row] = await asUser<Record<string, unknown>>(pool, invitees[1], `select * from public.meetings where id = $1`, [id]);
    expect(Object.values(row)).not.toContain("31234");
    const audit = (await pool.query(`select details::text d from public.audit_logs where action = 'meeting.code_changed'`)).rows;
    expect(audit.every((r) => !r.d.includes("31234"))).toBe(true);
  });

  it("a regenerated code replaces the old one", async () => {
    const [{ code }] = await asUser<{ code: string }>(pool, admin, `select public.set_meeting_code($1, null) as code`, [id]);
    expect(code).toMatch(/^\d{5}$/);
    if (code !== "31234") expect((await confirm(invitees[1], id, "31234")).ok).toBe(false);
    expect((await confirm(invitees[1], id, code)).ok).toBe(true);
    await asUser(pool, admin, `select public.set_meeting_code($1, '31234')`, [id]);
  });

  it("locks a member for 10 minutes after 5 wrong codes", async () => {
    for (let i = 0; i < 4; i++) expect((await confirm(invitees[2], id, "00000")).ok).toBe(false);
    const fifth = await confirm(invitees[2], id, "00000");
    expect(fifth.message).toMatch(/10 minit/);
    const locked = await confirm(invitees[2], id, "31234");
    expect([locked.ok, locked.message]).toEqual([false, expect.stringMatching(/Terlalu banyak/)]);
    expect(await status(id, invitees[2])).toEqual({ status: "pending", method: null });
  });

  it("members who were not invited cannot confirm", async () => {
    await expect(confirm(outsider, id, "31234")).rejects.toThrow(/tidak dijemput/);
    await expect(asRole(pool, "anon", {}, `select public.confirm_attendance($1, '31234')`, [id])).rejects.toThrow(/permission denied/);
  });

  it("after the meeting ends, late confirmations work until 00:01; then the rest become absent", async () => {
    const [{ t }] = await asUser<{ t: string }>(pool, admin, `select public.end_meeting($1) as t`, [id]);
    const closes = (await pool.query(`select to_char($1::timestamptz at time zone 'Asia/Kuala_Lumpur', 'HH24:MI') hm,
      ($1::timestamptz at time zone 'Asia/Kuala_Lumpur')::date - (now() at time zone 'Asia/Kuala_Lumpur')::date d`, [t])).rows[0];
    expect(closes).toEqual({ hm: "00:01", d: 1 });
    await pool.query(`update app_private.meeting_code_attempts set locked_until = null where meeting_id = $1`, [id]);
    expect((await confirm(invitees[2], id, "31234")).ok).toBe(true); // late, phone battery died
    // the grace period passes
    await pool.query(`update public.meetings set attendance_closes_at = now() - interval '1 minute' where id = $1`, [id]);
    await asUser(pool, invitees[3], `select public.refresh_meetings()`);
    expect(await status(id, invitees[3])).toEqual({ status: "absent", method: null });
    expect(await status(id, invitees[0])).toEqual({ status: "present", method: "code" });
    await expect(confirm(invitees[3], id, "31234")).rejects.toThrow(/ditutup/);
    const [m] = (await pool.query(`select attendance_open, finalized_at from public.meetings where id = $1`, [id])).rows;
    expect(m.attendance_open).toBe(false);
    expect(m.finalized_at).not.toBeNull();
  });

  it("the admin corrects a status only with a reason; the change is audited", async () => {
    await expect(asUser(pool, admin, `select public.set_attendance_status($1, $2, 'excused', '')`, [id, invitees[3]])).rejects.toThrow(/sebab/);
    await asUser(pool, admin, `select public.set_attendance_status($1, $2, 'excused', 'Cuti sakit dengan surat')`, [id, invitees[3]]);
    const a = (await pool.query(`select details from public.audit_logs where action = 'meeting.attendance_corrected' and details->>'member_id' = $1`, [invitees[3]])).rows[0];
    await asUser(pool, admin, `select public.set_attendance_status($1, $2, 'present', 'Hadir tetapi telefon rosak')`, [id, invitees[3]]);
    expect(await status(id, invitees[3])).toEqual({ status: "present", method: "manual" });
    expect(a.details).toMatchObject({ from: "absent", to: "excused", reason: "Cuti sakit dengan surat" });
    await expect(asUser(pool, invitees[0], `select public.set_attendance_status($1, $2, 'present', 'Cubaan ahli')`, [id, invitees[0]])).rejects.toThrow(/FORBIDDEN/);
    await expect(pool.query(`delete from public.meeting_invitees where meeting_id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
  });

  it("concurrent confirmations by the same member record one attendance", async () => {
    const m = await member("serentak");
    const mid = await create({}, [m]);
    await asUser(pool, admin, `select public.publish_meeting($1)`, [mid]);
    await asUser(pool, admin, `select public.open_attendance($1)`, [mid]);
    await asUser(pool, admin, `select public.set_meeting_code($1, '55555')`, [mid]);
    const results = await Promise.all(Array.from({ length: 5 }, () => confirm(m, mid, "55555")));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => !r.already)).toHaveLength(1);
    const audits = (await pool.query(`select count(*)::int c from public.audit_logs where action = 'meeting.attendance_confirmed' and entity_id = $1`, [mid])).rows[0].c;
    expect(audits).toBe(1);
  });
});
