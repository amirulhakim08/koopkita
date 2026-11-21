/**
 * Integration tests that run the REAL Supabase migrations on PostgreSQL and
 * exercise the database functions and RLS policies as Supabase client roles.
 *
 * Numbers in test names refer to the "Important test cases" in the KoopKITA spec.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  asRole, asService, asUser, configureBank, confirmEmail, createActiveMember, createAdmin, createOpenProject,
  freshDatabase, joinProject, key, signUp,
} from "./db";

let pool: Pool;
let admin: string;

beforeAll(async () => {
  pool = await freshDatabase("koopkita_rules");
  admin = await createAdmin(pool);
  await configureBank(pool, admin);
});

afterAll(async () => {
  await pool.end();
});

describe("membership & access control", () => {
  it("creates a pending-verification profile on sign-up and strips sensitive auth metadata", async () => {
    const uid = await signUp(pool, "baru@kita.test", { confirmed: false });
    const { rows } = await pool.query(`select status, ic_number from public.profiles where id = $1`, [uid]);
    expect(rows[0].status).toBe("pending_verification");
    expect(rows[0].ic_number).toMatch(/^\d{12}$/);
    const meta = (await pool.query(`select raw_user_meta_data m from auth.users where id = $1`, [uid])).rows[0].m;
    expect(meta.ic_number).toBeUndefined();
    expect(meta.full_name).toBeDefined();

    await confirmEmail(pool, uid);
    const after = await pool.query(`select status from public.profiles where id = $1`, [uid]);
    expect(after.rows[0].status).toBe("pending_approval");
  });

  it("Super Admin approval of an unverified applicant also confirms their email", async () => {
    const uid = await signUp(pool, "belum@kita.test", { confirmed: false });
    const [{ m }] = await asUser<{ m: string }>(pool, admin, `select public.approve_member($1, null) as m`, [uid]);
    expect(m).toMatch(/^KITA-\d{4}$/);
    const { rows } = await pool.query(
      `select u.email_confirmed_at is not null as confirmed, p.status, p.email_verified_at is not null as verified
         from auth.users u join public.profiles p on p.id = u.id where u.id = $1`, [uid]);
    expect(rows[0]).toEqual({ confirmed: true, status: "active", verified: true });
    const audit = await pool.query(`select details from public.audit_logs where action = 'member.approved' and entity_id = $1`, [uid]);
    expect(audit.rows[0].details.email_confirmed_by_admin).toBe(true);
  });

  it("#1 unapproved members cannot access protected data or dashboards", async () => {
    const uid = await signUp(pool, "pending1@kita.test");
    await expect(asUser(pool, uid, `select public.member_dashboard_stats()`)).rejects.toThrow(/FORBIDDEN/);
    await expect(
      asUser(pool, uid, `select public.submit_share_payment(5000, current_date, 'REF-PENDING', $1, $2)`, [`${uid}/r.pdf`, key()]),
    ).rejects.toThrow(/FORBIDDEN/);
    await createOpenProject(pool, admin, { target_sen: 1000000 });
    expect(await asUser(pool, uid, `select * from public.projects`)).toHaveLength(0);
    await expect(asUser(pool, uid, `select * from public.project_progress()`)).rejects.toThrow(/FORBIDDEN/);
    // still sees own profile, so the app can show "pending approval"
    const own = await asUser(pool, uid, `select status from public.profiles`);
    expect(own).toEqual([{ status: "pending_approval" }]);
  });

  it("#2 members cannot approve their own (or anyone's) application", async () => {
    const uid = await signUp(pool, "self@kita.test");
    await expect(asUser(pool, uid, `select public.approve_member($1, null)`, [uid])).rejects.toThrow(/FORBIDDEN/);
    // nor escalate via direct table writes
    await expect(asUser(pool, uid, `update public.profiles set status = 'active' where id = $1`, [uid])).rejects.toThrow(
      /permission denied/,
    );
    const active = await createActiveMember(pool, admin, "aktif-x@kita.test");
    await expect(asUser(pool, active, `update public.profiles set role = 'super_admin' where id = $1`, [active])).rejects.toThrow(
      /permission denied/,
    );
    await expect(asUser(pool, active, `select public.approve_member($1, null)`, [uid])).rejects.toThrow(/FORBIDDEN/);
  });

  it("approval assigns sequential KITA-#### membership IDs and notifies the member", async () => {
    const uid = await signUp(pool, "lulus@kita.test");
    const [{ m }] = await asUser<{ m: string }>(pool, admin, `select public.approve_member($1, 'ok') as m`, [uid]);
    expect(m).toMatch(/^KITA-\d{4}$/);
    const n = await asUser(pool, uid, `select type from public.notifications`);
    expect(n.map((r) => r.type)).toContain("membership_approved");
    // idempotent
    const [{ m: again }] = await asUser<{ m: string }>(pool, admin, `select public.approve_member($1, null) as m`, [uid]);
    expect(again).toBe(m);
  });

  it("admin actions require MFA (aal2)", async () => {
    const uid = await signUp(pool, "mfa@kita.test");
    await expect(asUser(pool, admin, `select public.approve_member($1, null)`, [uid], "aal1")).rejects.toThrow(/MFA_REQUIRED/);
  });

  it("suspended members lose access", async () => {
    const uid = await createActiveMember(pool, admin, "gantung@kita.test");
    await asUser(pool, admin, `select public.set_member_suspension($1, true, 'Ujian gantung')`, [uid]);
    await expect(asUser(pool, uid, `select public.member_dashboard_stats()`)).rejects.toThrow(/FORBIDDEN/);
    await asUser(pool, admin, `select public.set_member_suspension($1, false, 'Aktif semula')`, [uid]);
    await expect(asUser(pool, uid, `select public.member_dashboard_stats()`)).resolves.toBeTruthy();
  });

  it("anonymous users cannot read anything", async () => {
    await expect(asRole(pool, "anon", {}, `select * from public.profiles`)).rejects.toThrow(/permission denied/);
    await expect(asRole(pool, "anon", {}, `select public.admin_dashboard_stats()`)).rejects.toThrow(/permission denied/);
  });
});

describe("share capital", () => {
  let member: string;
  beforeAll(async () => {
    member = await createActiveMember(pool, admin, "saham@kita.test");
  });

  it("#3 pending share payments do not increase approved share capital", async () => {
    const [{ id }] = await asUser<{ id: string }>(
      pool, member, `select public.submit_share_payment(10000, current_date, 'SHR-0001', $1, $2) as id`,
      [`${member}/a.pdf`, key()],
    );
    let [bal] = await asUser<{ approved_sen: string; pending_sen: string }>(pool, member, `select approved_sen, pending_sen from public.v_share_balances`);
    expect(Number(bal.approved_sen)).toBe(0);
    expect(Number(bal.pending_sen)).toBe(10000);

    await asUser(pool, admin, `select public.review_share_payment($1, true, null)`, [id]);
    [bal] = await asUser(pool, member, `select approved_sen, pending_sen from public.v_share_balances`);
    expect(Number(bal.approved_sen)).toBe(10000);
    expect(Number(bal.pending_sen)).toBe(0);
  });

  it("#4 duplicate payment submissions are flagged for review", async () => {
    await asUser(pool, member, `select public.submit_share_payment(5000, current_date, 'DUP-REF-1', $1, $2)`, [`${member}/b.pdf`, key()]);
    const [{ id }] = await asUser<{ id: string }>(
      pool, member, `select public.submit_share_payment(7000, current_date, 'dup-ref-1 ', $1, $2) as id`, [`${member}/c.pdf`, key()],
    );
    const { rows } = await pool.query(`select duplicate_flag, duplicate_reason from public.share_transactions where id = $1`, [id]);
    expect(rows[0].duplicate_flag).toBe(true);
    expect(rows[0].duplicate_reason).toMatch(/Rujukan/);
  });

  it("idempotency key returns the same submission instead of creating a second one", async () => {
    const k = key();
    const a = await asUser<{ id: string }>(pool, member, `select public.submit_share_payment(2000, current_date, 'IDEM-1', $1, $2) as id`, [`${member}/d.pdf`, k]);
    const b = await asUser<{ id: string }>(pool, member, `select public.submit_share_payment(2000, current_date, 'IDEM-1', $1, $2) as id`, [`${member}/d.pdf`, k]);
    expect(a[0].id).toBe(b[0].id);
  });

  it("rejects receipts outside the member's own storage folder", async () => {
    await expect(
      asUser(pool, member, `select public.submit_share_payment(2000, current_date, 'PATH-1', $1, $2)`, [`${admin}/x.pdf`, key()]),
    ).rejects.toThrow(/VALIDATION/);
  });

  it("enforces configurable share limits", async () => {
    await asUser(pool, admin, `select public.update_system_setting('share_max_total_sen', '50000'::jsonb)`);
    await expect(
      asUser(pool, member, `select public.submit_share_payment(60000, current_date, 'MAX-1', $1, $2)`, [`${member}/e.pdf`, key()]),
    ).rejects.toThrow(/maksimum/);
    await asUser(pool, admin, `select public.update_system_setting('share_max_total_sen', '10000000'::jsonb)`);
  });

  it("corrections are adjustment entries; approved transactions are never edited", async () => {
    const [{ id }] = await asUser<{ id: string }>(pool, member, `select id from public.share_transactions where status = 'approved' limit 1`);
    await expect(pool.query(`update public.share_transactions set amount_sen = 1 where id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await asUser(pool, admin, `select public.create_share_adjustment($1, -2000, 'Pembetulan amaun', $2, null)`, [member, id]);
    const [bal] = await asUser<{ approved_sen: string }>(pool, member, `select approved_sen from public.v_share_balances`);
    expect(Number(bal.approved_sen)).toBe(8000);
    await expect(
      asUser(pool, admin, `select public.create_share_adjustment($1, -999999, 'Terlalu besar', null, null)`, [member]),
    ).rejects.toThrow(/negatif/);
  });
});

describe("cooperative finance (admin only)", () => {
  let member: string;
  const entry = (dir: "in" | "out", cat: string, sen: number, desc: string, biz = "umum") =>
    asUser<{ id: string }>(pool, admin, `select public.record_coop_entry($1, $2, $3, $4, current_date, $5, 'REF', null, null) as id`,
      [dir, cat, biz, sen, desc]).then((r) => r[0].id);
  const summary = async () =>
    (await asUser<{ s: Record<string, number> }>(pool, admin, `select public.admin_finance_summary(null, null) as s`))[0].s;

  beforeAll(async () => {
    member = await createActiveMember(pool, admin, "kewangan@kita.test");
  });

  it("records money in and out and computes total cooperative funds", async () => {
    const before = await summary();
    await entry("in", "hasil_perniagaan", 500000, "Jualan hasil tani bulan November", "pertanian");
    await entry("out", "pengeluaran_tunai", 120000, "Pengeluaran untuk baja dan racun", "pertanian");
    const after = await summary();
    expect(Number(after.manual_in_sen) - Number(before.manual_in_sen)).toBe(500000);
    expect(Number(after.manual_out_sen) - Number(before.manual_out_sen)).toBe(120000);
    expect(Number(after.total_funds_sen) - Number(before.total_funds_sen)).toBe(380000);
    // total = share capital + project cash flows + manual in - manual out
    expect(Number(after.total_funds_sen)).toBe(
      Number(after.share_capital_sen) + Number(after.project_capital_sen) - Number(after.project_invested_sen)
      + Number(after.project_profit_sen) + Number(after.capital_received_sen) - Number(after.dividend_paid_sen)
      - Number(after.capital_returned_sen) + Number(after.manual_in_sen) - Number(after.manual_out_sen));
    expect(Number(after.funds_excl_share_sen)).toBe(Number(after.total_funds_sen) - Number(after.share_capital_sen));
  });

  it("requires a reason and a category that matches the direction", async () => {
    await expect(entry("out", "pengeluaran_tunai", 1000, "x")).rejects.toThrow(/sebab pengeluaran/);
    await expect(entry("out", "hasil_perniagaan", 1000, "Kategori salah arah")).rejects.toThrow(/Kategori/);
    await expect(entry("in", "sumbangan", 1000, "Perniagaan tidak wujud", "kasino")).rejects.toThrow(/Kategori atau perniagaan/);
    await expect(entry("in", "sumbangan", 1000, "Korban sudah tiada", "korban")).rejects.toThrow(/Kategori atau perniagaan/);
  });

  it("corrections are reversal entries; records cannot be edited or deleted", async () => {
    const before = Number((await summary()).total_funds_sen);
    const id = await entry("out", "perbelanjaan_operasi", 30000, "Bil elektrik pejabat");
    await asUser(pool, admin, `select public.reverse_coop_entry($1, 'Tersalah rekod')`, [id]);
    await asUser(pool, admin, `select public.reverse_coop_entry($1, 'Ulang')`, [id]); // idempotent
    expect(Number((await summary()).total_funds_sen)).toBe(before);
    await expect(pool.query(`update public.coop_ledger_entries set amount_sen = 1 where id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.coop_ledger_entries where id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    const book = await asUser<{ source: string; reversed: boolean }>(pool, admin, `select * from public.admin_cashbook(null, null, 1000)`);
    expect(book.some((r) => r.source === "manual" && r.reversed)).toBe(true);
    expect(book.every((r) => ["manual", "modal_syer"].includes(r.source) || r.source.startsWith("projek_"))).toBe(true);
  });

  it("members can neither see nor record cooperative finances", async () => {
    expect(await asUser(pool, member, `select * from public.coop_ledger_entries`)).toHaveLength(0);
    await expect(asUser(pool, member, `select public.admin_finance_summary(null, null)`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(pool, member, `select * from public.admin_cashbook(null, null, 10)`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(pool, member,
      `select public.record_coop_entry('out', 'pengeluaran_tunai', 'umum', 100, current_date, 'Cubaan ahli', null, null, null)`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asRole(pool, "anon", {}, `select * from public.coop_ledger_entries`)).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, admin, `select public.admin_finance_summary(null, null)`, [], "aal1")).rejects.toThrow(/MFA_REQUIRED/);
  });
});

describe("admin notifications", () => {
  it("sends to all active members or only to selected members", async () => {
    const a = await createActiveMember(pool, admin, "notis-a@kita.test");
    const b = await createActiveMember(pool, admin, "notis-b@kita.test");
    const pending = await signUp(pool, "notis-pending@kita.test");
    const count = async (uid: string, title: string) =>
      (await pool.query(`select count(*)::int c from public.notifications where user_id = $1 and title = $2`, [uid, title])).rows[0].c;

    const [{ n }] = await asUser<{ n: number }>(pool, admin, `select public.send_member_notification('Mesyuarat Agung', 'Sila hadir', '/ahli', $1) as n`, [[a]]);
    expect(n).toBe(1);
    expect([await count(a, "Mesyuarat Agung"), await count(b, "Mesyuarat Agung")]).toEqual([1, 0]);

    await asUser(pool, admin, `select public.send_member_notification('Notis Semua', 'Untuk semua ahli', null, null)`);
    expect([await count(a, "Notis Semua"), await count(b, "Notis Semua"), await count(pending, "Notis Semua")]).toEqual([1, 1, 0]);

    await expect(asUser(pool, admin, `select public.send_member_notification('Kosong', 'Tiada penerima', null, $1)`, [[pending]])).rejects.toThrow(/Tiada ahli aktif/);
    await expect(asUser(pool, admin, `select public.send_member_notification('Pautan', 'Luar', 'https://evil.example', null)`)).rejects.toThrow(/dalaman/);
    await expect(asUser(pool, a, `select public.send_member_notification('Ahli', 'Cuba hantar', null, null)`)).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("data isolation & immutability", () => {
  it("#16 members cannot access another member's private data", async () => {
    const a = await createActiveMember(pool, admin, "privasi-a@kita.test");
    const b = await createActiveMember(pool, admin, "privasi-b@kita.test");
    const project = await createOpenProject(pool, admin, { target_sen: 2000000 });
    const contribution = await joinProject(pool, a, project, 50000);
    await asUser(pool, a, `select public.submit_share_payment(5000, current_date, $1, $2, $3)`, [`PRV-${key()}`, `${a}/s.pdf`, key()]);

    const notes = await asUser<{ user_id: string }>(pool, b, `select user_id from public.notifications`);
    expect(notes.every((n) => n.user_id === b)).toBe(true);
    for (const table of ["share_transactions", "project_participations", "project_profit_allocations", "project_withdrawals", "project_capital_returns"]) {
      const rows = await asUser(pool, b, `select * from public.${table}`);
      expect(rows, table).toHaveLength(0);
    }
    const profiles = await asUser<{ id: string }>(pool, b, `select id, ic_number from public.profiles`);
    expect(profiles.map((p) => p.id)).toEqual([b]);
    await expect(asUser(pool, b, `select * from public.member_project_wallet($1)`, [a])).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(pool, b, `select public.review_project_participation($1, true, null)`, [contribution])).rejects.toThrow(/FORBIDDEN/);
    const audit = await asUser(pool, b, `select * from public.audit_logs`);
    expect(audit).toHaveLength(0);
    const adminView = await asUser(pool, admin, `select * from public.project_participations where id = $1`, [contribution]);
    expect(adminView).toHaveLength(1);
  });

  it("storage policies keep receipts private to the uploader and admins", async () => {
    const a = await createActiveMember(pool, admin, "fail-a@kita.test");
    const b = await createActiveMember(pool, admin, "fail-b@kita.test");
    await asUser(pool, a, `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${a}/r1.pdf`]);
    await expect(asUser(pool, a, `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${b}/r1.pdf`])).rejects.toThrow(/row-level security/);
    expect(await asUser(pool, b, `select * from storage.objects where bucket_id = 'receipts'`)).toHaveLength(0);
    expect((await asUser(pool, a, `select * from storage.objects where bucket_id = 'receipts'`)).length).toBe(1);
    expect((await asUser(pool, admin, `select * from storage.objects where bucket_id = 'receipts'`)).length).toBeGreaterThan(0);
    await expect(asUser(pool, a, `insert into storage.objects (bucket_id, name) values ('payout-proofs', $1)`, [`${a}/p.pdf`])).rejects.toThrow(/row-level security/);
  });

  it("#17 financial records cannot be silently deleted or modified — even by the database owner", async () => {
    const m = await createActiveMember(pool, admin, "tulis@kita.test");
    const project = await createOpenProject(pool, admin, { target_sen: 1000000 });
    const contribution = await joinProject(pool, m, project, 50000);
    await asUser(pool, admin, `select public.review_project_participation($1, true, null)`, [contribution]);
    await expect(pool.query(`update public.project_participations set amount_sen = 1 where id = $1`, [contribution])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.project_participations where id = $1`, [contribution])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`truncate public.project_participations cascade`)).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.projects where id = $1`, [project])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`update public.projects set target_sen = 1 where id = $1`, [project])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.share_transactions`)).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`update public.audit_logs set action = 'x'`)).rejects.toThrow(/IMMUTABLE_RECORD/);
    // clients have no write privileges at all
    await expect(asUser(pool, m, `insert into public.project_withdrawals (withdrawal_no, project_id, member_id, amount_sen, bank_name, bank_account_no, bank_account_holder, idempotency_key) values ('X', $1, $2, 100, 'B', '1234567', 'Saya', 'x')`, [project, m])).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, m, `update public.project_participations set status = 'approved'`)).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, admin, `delete from public.share_transactions`)).rejects.toThrow(/permission denied/);
  });

  it("administrative and financial actions are written to the audit log", async () => {
    const { rows } = await pool.query(`select distinct action from public.audit_logs`);
    const actions = rows.map((r) => r.action);
    for (const a of ["member.approved", "share_payment.approved", "project.created", "project.published", "project.participation_approved", "setting.updated"]) {
      expect(actions).toContain(a);
    }
  });

  it("notification failures do not roll back financial operations", async () => {
    const m = await createActiveMember(pool, admin, "notif@kita.test");
    const project = await createOpenProject(pool, admin, { target_sen: 1000000 });
    const contribution = await joinProject(pool, m, project, 50000);
    await pool.query(`alter table public.notifications add constraint notif_block check (type <> 'project_payment_approved') not valid`);
    try {
      await asUser(pool, admin, `select public.review_project_participation($1, true, null)`, [contribution]);
      const st = (await pool.query(`select status from public.project_participations where id = $1`, [contribution])).rows[0].status;
      expect(st).toBe("approved");
    } finally {
      await pool.query(`alter table public.notifications drop constraint notif_block`);
    }
  });

  it("rate limits sensitive operations", async () => {
    const m = await createActiveMember(pool, admin, "laju@kita.test");
    let err: unknown;
    for (let i = 0; i < 12; i++) {
      try {
        await asUser(pool, m, `select public.submit_share_payment(1000, current_date, $1, $2, $3)`, [`RL-${key()}`, `${m}/rl${i}.pdf`, key()]);
      } catch (e) {
        err = e;
        break;
      }
    }
    expect(String(err)).toMatch(/RATE_LIMITED/);
  });

  it("only the service role can provision a Super Admin", async () => {
    const m = await createActiveMember(pool, admin, "naik@kita.test");
    await expect(asUser(pool, m, `select public.provision_super_admin('naik@kita.test')`)).rejects.toThrow(/permission denied/);
    await expect(asService(pool, `select public.provision_super_admin('naik@kita.test')`)).resolves.toBeTruthy();
  });
});
