/**
 * Integration tests that run the REAL Supabase migrations on PostgreSQL and
 * exercise the database functions and RLS policies as Supabase client roles.
 *
 * Numbers in test names refer to the "Important test cases" in the KoopKITA spec.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  asRole, asService, asUser, commissionTotal, configureBank, confirmEmail, createActiveMember, createAdmin,
  createOpenCampaign, createSale, freshDatabase, key, payAndApprove, signUp,
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

let yearSeq = 2040;
const freshCampaign = (cattle: number) => createOpenCampaign(pool, admin, cattle, yearSeq++);

const cattleOf = async (saleId: string) =>
  (await pool.query(`select distinct cattle_id from public.cattle_slots where sale_id = $1`, [saleId])).rows.map((r) => r.cattle_id);

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

  it("cannot approve an applicant whose email is not verified", async () => {
    const uid = await signUp(pool, "belum@kita.test", { confirmed: false });
    await expect(asUser(pool, admin, `select public.approve_member($1, null)`, [uid])).rejects.toThrow(/CONFLICT/);
  });

  it("#1 unapproved members cannot access protected data or dashboards", async () => {
    const uid = await signUp(pool, "pending1@kita.test");
    await expect(asUser(pool, uid, `select public.member_dashboard_stats()`)).rejects.toThrow(/FORBIDDEN/);
    await expect(
      asUser(pool, uid, `select public.submit_share_payment(5000, current_date, 'REF-PENDING', $1, $2)`, [`${uid}/r.pdf`, key()]),
    ).rejects.toThrow(/FORBIDDEN/);
    const campaigns = await asUser(pool, uid, `select * from public.campaigns`);
    expect(campaigns).toHaveLength(0);
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

describe("qurban slots", () => {
  let campaign: string;
  let m1: string;
  let m2: string;

  beforeAll(async () => {
    campaign = await createOpenCampaign(pool, admin, 2, 2027);
    m1 = await createActiveMember(pool, admin, "slot1@kita.test");
    m2 = await createActiveMember(pool, admin, "slot2@kita.test");
  });

  it("generates 7 slots per cattle with KITA-YYYY-NNN codes", async () => {
    const { rows } = await pool.query(
      `select k.code, count(s.*)::int n from public.cattle k join public.cattle_slots s on s.cattle_id = k.id
        where k.campaign_id = $1 group by k.code order by k.code`, [campaign]);
    expect(rows).toEqual([{ code: "KITA-2027-001", n: 7 }, { code: "KITA-2027-002", n: 7 }]);
  });

  it("#5 a cattle can never hold more than seven shares", async () => {
    const [{ id: cattleId }] = (await pool.query(`select id from public.cattle where campaign_id = $1 limit 1`, [campaign])).rows;
    await expect(pool.query(`insert into public.cattle_slots (cattle_id, slot_no) values ($1, 8)`, [cattleId])).rejects.toThrow(/check/);
    await expect(pool.query(`insert into public.cattle_slots (cattle_id, slot_no) values ($1, 1)`, [cattleId])).rejects.toThrow(/unique|duplicate/);
    // a campaign of 2 cattle has 14 shares: the 15th cannot be sold
    const s1 = await createSale(pool, m1, campaign, 7);
    const s2 = await createSale(pool, m2, campaign, 7);
    await expect(createSale(pool, m1, campaign, 1)).rejects.toThrow(/tidak mencukupi/);
    await asUser(pool, m1, `select public.cancel_qurban_sale($1, 'ujian')`, [s1]);
    await asUser(pool, m2, `select public.cancel_qurban_sale($1, 'ujian')`, [s2]);
  });

  it("allocates a 7-share order into a single cattle and fills partially-used cattle first", async () => {
    const a = await createSale(pool, m1, campaign, 3);
    const b = await createSale(pool, m2, campaign, 2);
    expect(await cattleOf(b)).toEqual(await cattleOf(a)); // prioritises cattle with existing reservations
    const c = await createSale(pool, m1, campaign, 7);
    const cattle = await cattleOf(c);
    expect(cattle).toHaveLength(1);
    expect(cattle[0]).not.toBe((await cattleOf(a))[0]);
    for (const s of [a, b, c]) await asUser(pool, admin, `select public.cancel_qurban_sale($1, 'ujian')`, [s]);
  });

  it("#6 concurrent bookings never reserve the same slot", async () => {
    const members = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createActiveMember(pool, admin, `serentak${i}@kita.test`)),
    );
    // 6 members race for 3 shares each = 18 shares, but only 14 exist
    const results = await Promise.allSettled(members.map((m) => createSale(pool, m, campaign, 3)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(4); // 12 shares fit, the 5th order (15) does not
    const { rows } = await pool.query(
      `select s.id, count(*) over (partition by s.id) dup
         from public.cattle_slots s join public.cattle k on k.id = s.cattle_id
        where k.campaign_id = $1 and s.status = 'reserved'`, [campaign]);
    expect(rows.length).toBe(12);
    const participants = await pool.query(
      `select slot_id, count(*)::int c from public.qurban_participants where slot_id is not null group by slot_id having count(*) > 1`);
    expect(participants.rows).toHaveLength(0);
    for (const r of results) if (r.status === "fulfilled") await asUser(pool, admin, `select public.cancel_qurban_sale($1, 'ujian')`, [r.value]);
  });

  it("expires reservations without payment proof but never sales under review", async () => {
    const stale = await createSale(pool, m1, campaign, 1);
    const reviewed = await createSale(pool, m2, campaign, 1);
    await asUser(pool, m2, `select public.submit_sale_payment($1, 85000, current_date, $2, $3, $4)`,
      [reviewed, `EXP-${key()}`, `${m2}/p.pdf`, key()]);
    await pool.query(`alter table public.qurban_sales disable trigger trg_qurban_sales_guard`);
    await pool.query(`update public.qurban_sales set reservation_expires_at = now() - interval '1 hour' where id = any($1)`, [[stale, reviewed]]);
    await pool.query(`alter table public.qurban_sales enable trigger trg_qurban_sales_guard`);
    const [{ n }] = await asUser<{ n: number }>(pool, admin, `select public.expire_stale_reservations() as n`);
    expect(n).toBe(1);
    const { rows } = await pool.query(`select id, status from public.qurban_sales where id = any($1)`, [[stale, reviewed]]);
    expect(rows.find((r) => r.id === stale)?.status).toBe("cancelled");
    expect(rows.find((r) => r.id === reviewed)?.status).toBe("pending_review");
    await asUser(pool, admin, `select public.reject_qurban_sale($1, 'ujian')`, [reviewed]);
  });

  it("admin can override a slot assignment before approval", async () => {
    const sale = await createSale(pool, m1, campaign, 1);
    const [p] = (await pool.query(`select id, slot_id from public.qurban_participants where sale_id = $1`, [sale])).rows;
    const [target] = (await pool.query(
      `select s.id from public.cattle_slots s join public.cattle k on k.id = s.cattle_id
        where k.campaign_id = $1 and s.status = 'available' and s.id <> $2 order by k.seq desc, s.slot_no desc limit 1`,
      [campaign, p.slot_id])).rows;
    await asUser(pool, admin, `select public.admin_reassign_slot($1, $2)`, [p.id, target.id]);
    const old = (await pool.query(`select status from public.cattle_slots where id = $1`, [p.slot_id])).rows[0];
    const now = (await pool.query(`select status, sale_id from public.cattle_slots where id = $1`, [target.id])).rows[0];
    expect(old.status).toBe("available");
    expect(now).toEqual({ status: "reserved", sale_id: sale });
    await asUser(pool, m1, `select public.cancel_qurban_sale($1, 'ujian')`, [sale]);
  });

  it("requires the cooperative bank account to be configured", async () => {
    const pool2 = await freshDatabase("koopkita_nobank");
    try {
      const a = await createAdmin(pool2);
      const c = await createOpenCampaign(pool2, a, 1);
      const m = await createActiveMember(pool2, a, "x@kita.test");
      await expect(createSale(pool2, m, c, 1)).rejects.toThrow(/CONFIG_REQUIRED/);
    } finally {
      await pool2.end();
    }
  });
});

describe("commission engine", () => {
  let campaign: string;
  let m1: string;
  let m2: string;
  let m3: string;

  beforeAll(async () => {
    campaign = await createOpenCampaign(pool, admin, 6, 2028);
    m1 = await createActiveMember(pool, admin, "kom1@kita.test");
    m2 = await createActiveMember(pool, admin, "kom2@kita.test");
    m3 = await createActiveMember(pool, admin, "kom3@kita.test");
  });

  it("#7 pending sales do not generate commission", async () => {
    const sale = await createSale(pool, m1, campaign, 2);
    await asUser(pool, m1, `select public.submit_sale_payment($1, 170000, current_date, $2, $3, $4)`,
      [sale, `P7-${key()}`, `${m1}/p7.pdf`, key()]);
    expect(await commissionTotal(pool, m1)).toBe(0);
    await asUser(pool, admin, `select public.reject_qurban_sale($1, 'ujian')`, [sale]);
    expect(await commissionTotal(pool, m1)).toBe(0);
  });

  it("partial payments are recorded but cannot be approved or earn commission until paid in full", async () => {
    const sale = await createSale(pool, m1, campaign, 1);
    const [{ id: p1 }] = await asUser<{ id: string }>(pool, m1,
      `select public.submit_sale_payment($1, 50000, current_date, $2, $3, $4) as id`, [sale, `PP1-${key()}`, `${m1}/pp1.pdf`, key()]);
    await asUser(pool, admin, `select public.review_sale_payment($1, true, null)`, [p1]);
    const st = (await pool.query(`select status, reservation_expires_at from public.qurban_sales where id = $1`, [sale])).rows[0];
    expect(st.status).toBe("pending_payment");
    expect(st.reservation_expires_at).toBeNull(); // money received: never auto-expired
    await expect(asUser(pool, admin, `select public.approve_qurban_sale($1, null)`, [sale])).rejects.toThrow(/belum penuh/);
    expect(await commissionTotal(pool, m1)).toBe(0);
    await expect(asUser(pool, m1, `select public.submit_sale_payment($1, 50000, current_date, $2, $3, $4)`,
      [sale, `PP2-${key()}`, `${m1}/pp2.pdf`, key()])).rejects.toThrow(/melebihi baki/);
    const [{ id: p2 }] = await asUser<{ id: string }>(pool, m1,
      `select public.submit_sale_payment($1, 35000, current_date, $2, $3, $4) as id`, [sale, `PP3-${key()}`, `${m1}/pp3.pdf`, key()]);
    await asUser(pool, admin, `select public.review_sale_payment($1, true, null)`, [p2]);
    await asUser(pool, admin, `select public.approve_qurban_sale($1, null)`, [sale]);
    expect(await commissionTotal(pool, m1)).toBe(4000);
  });

  it("#8 one approved share generates RM40", async () => {
    const before = await commissionTotal(pool, m2);
    const sale = await createSale(pool, m2, campaign, 1);
    await payAndApprove(pool, admin, m2, sale);
    expect((await commissionTotal(pool, m2)) - before).toBe(4000);
  });

  it("#9 six approved shares generate RM240", async () => {
    const before = await commissionTotal(pool, m3);
    const sale = await createSale(pool, m3, campaign, 6);
    await payAndApprove(pool, admin, m3, sale);
    expect((await commissionTotal(pool, m3)) - before).toBe(24000);
  });

  it("#10 seven shares of the same cattle sold by one member generate RM300 (RM280 + RM20 entries)", async () => {
    const member = await createActiveMember(pool, admin, "penuh@kita.test");
    const sale = await createSale(pool, member, campaign, 7);
    expect(await cattleOf(sale)).toHaveLength(1);
    await payAndApprove(pool, admin, member, sale);
    expect(await commissionTotal(pool, member)).toBe(30000);
    const { rows } = await pool.query(
      `select entry_type, amount_sen::int from public.commission_ledger where member_id = $1 order by amount_sen desc`, [member]);
    expect(rows).toEqual([
      { entry_type: "standard", amount_sen: 28000 },
      { entry_type: "full_cattle_incentive", amount_sen: 2000 },
    ]);
  });

  it("#10b the full-cattle rule also applies when one member completes a cattle over several sales", async () => {
    const member = await createActiveMember(pool, admin, "penuh2@kita.test");
    const own = await freshCampaign(1);
    const a = await createSale(pool, member, own, 3);
    const b = await createSale(pool, member, own, 4);
    expect(await cattleOf(a)).toEqual(await cattleOf(b));
    await payAndApprove(pool, admin, member, a);
    expect(await commissionTotal(pool, member)).toBe(12000);
    await payAndApprove(pool, admin, member, b);
    expect(await commissionTotal(pool, member)).toBe(30000);
  });

  it("#11 seven shares of one cattle split among different members generate RM280 in total", async () => {
    const members = await Promise.all([1, 2, 3].map((i) => createActiveMember(pool, admin, `kongsi${i}@kita.test`)));
    const own = await freshCampaign(1);
    const a = await createSale(pool, members[0], own, 3);
    const b = await createSale(pool, members[1], own, 2);
    const c = await createSale(pool, members[2], own, 2);
    const cattle = new Set([...(await cattleOf(a)), ...(await cattleOf(b)), ...(await cattleOf(c))]);
    expect(cattle.size).toBe(1);
    for (const [m, s] of [[members[0], a], [members[1], b], [members[2], c]] as const) await payAndApprove(pool, admin, m, s);
    const totals = await Promise.all(members.map((m) => commissionTotal(pool, m)));
    expect(totals).toEqual([12000, 8000, 8000]);
    expect(totals.reduce((x, y) => x + y, 0)).toBe(28000);
  });

  it("#12 seven shares across different cattle do not qualify for RM300", async () => {
    const member = await createActiveMember(pool, admin, "rentas@kita.test");
    const filler = await createActiveMember(pool, admin, "pengisi@kita.test");
    // occupy part of the last free cattle so the 7 shares must span cattle
    const own = await freshCampaign(2);
    const f = await createSale(pool, filler, own, 3);
    const s1 = await createSale(pool, member, own, 4);
    const s2 = await createSale(pool, member, own, 3);
    const cattle = new Set([...(await cattleOf(s1)), ...(await cattleOf(s2))]);
    expect(cattle.size).toBeGreaterThan(1);
    await payAndApprove(pool, admin, member, s1);
    await payAndApprove(pool, admin, member, s2);
    expect(await commissionTotal(pool, member)).toBe(28000);
    await asUser(pool, admin, `select public.cancel_qurban_sale($1, 'ujian')`, [f]);
  });

  it("#13 repeated approval requests never duplicate commission", async () => {
    const member = await createActiveMember(pool, admin, "ulang@kita.test");
    const sale = await createSale(pool, member, campaign, 2);
    await payAndApprove(pool, admin, member, sale);
    await Promise.all(Array.from({ length: 5 }, () => asUser(pool, admin, `select public.approve_qurban_sale($1, null)`, [sale])));
    await asUser(pool, admin, `select public.approve_qurban_sale($1, null)`, [sale]);
    expect(await commissionTotal(pool, member)).toBe(8000);
    const { rows } = await pool.query(`select count(*)::int c from public.commission_ledger where sale_id = $1`, [sale]);
    expect(rows[0].c).toBe(1);
  });

  it("#14 cancelling an approved sale reverses its commission (incl. the full-cattle incentive)", async () => {
    const member = await createActiveMember(pool, admin, "batal@kita.test");
    const own = await freshCampaign(1);
    const a = await createSale(pool, member, own, 5);
    const b = await createSale(pool, member, own, 2);
    await payAndApprove(pool, admin, member, a);
    await payAndApprove(pool, admin, member, b);
    expect(await commissionTotal(pool, member)).toBe(30000);

    // members cannot cancel an approved sale themselves
    await expect(asUser(pool, member, `select public.cancel_qurban_sale($1, 'tukar fikiran')`, [b])).rejects.toThrow(/FORBIDDEN/);

    await asUser(pool, admin, `select public.cancel_qurban_sale($1, 'Pembeli menarik diri')`, [b]);
    // RM300 - RM80 (standard of b) - RM20 (incentive no longer valid) = RM200 = 5 x RM40
    expect(await commissionTotal(pool, member)).toBe(20000);
    const rev = await pool.query(`select count(*)::int c from public.commission_ledger where member_id = $1 and entry_type = 'reversal'`, [member]);
    expect(rev.rows[0].c).toBe(2);
    const slots = await pool.query(`select count(*)::int c from public.cattle_slots where sale_id = $1`, [b]);
    expect(slots.rows[0].c).toBe(0);
    // cancelling again is a no-op
    await asUser(pool, admin, `select public.cancel_qurban_sale($1, 'ulang')`, [b]);
    expect(await commissionTotal(pool, member)).toBe(20000);
  });
});

describe("commission payouts", () => {
  let member: string;
  let campaign: string;

  beforeAll(async () => {
    campaign = await createOpenCampaign(pool, admin, 1, 2029);
    member = await createActiveMember(pool, admin, "bayar@kita.test");
    const sale = await createSale(pool, member, campaign, 3);
    await payAndApprove(pool, admin, member, sale); // RM120 earned
  });

  const summary = async () =>
    (await asUser<{ earned_sen: string; paid_sen: string; outstanding_sen: string }>(
      pool, member, `select earned_sen, paid_sen, outstanding_sen from public.v_commission_summary where member_id = $1`, [member]))[0];

  it("refuses to record a payout before the bank transfer is confirmed", async () => {
    await expect(asUser(pool, admin,
      `select public.record_commission_payout($1, 1000, current_date, 'TRF-0', null, null, false, null, null)`, [member]),
    ).rejects.toThrow(/pemindahan bank/);
  });

  it("#15 partial payouts correctly update outstanding balances", async () => {
    await asUser(pool, admin,
      `select public.record_commission_payout($1, 5000, current_date, 'TRF-1', null, null, true, null, $2)`, [member, key()]);
    let s = await summary();
    expect([Number(s.earned_sen), Number(s.paid_sen), Number(s.outstanding_sen)]).toEqual([12000, 5000, 7000]);

    await expect(asUser(pool, admin,
      `select public.record_commission_payout($1, 7001, current_date, 'TRF-2', null, null, true, null, null)`, [member]),
    ).rejects.toThrow(/melebihi/);

    await asUser(pool, admin,
      `select public.record_commission_payout($1, 7000, current_date, 'TRF-3', null, null, true, null, null)`, [member]);
    s = await summary();
    expect(Number(s.outstanding_sen)).toBe(0);
    const items = await pool.query(
      `select sum(i.amount_sen)::int s from public.commission_payout_items i join public.commission_payouts p on p.id = i.payout_id where p.member_id = $1`, [member]);
    expect(items.rows[0].s).toBe(12000);
  });

  it("payout reversals restore the outstanding balance with an auditable record", async () => {
    const [{ id }] = (await pool.query(`select id from public.commission_payouts where member_id = $1 and transaction_ref = 'TRF-3'`, [member])).rows;
    await asUser(pool, admin, `select public.reverse_commission_payout($1, 'Pemindahan gagal')`, [id]);
    const s = await summary();
    expect(Number(s.outstanding_sen)).toBe(7000);
    const n = await pool.query(`select count(*)::int c from public.commission_payouts where member_id = $1`, [member]);
    expect(n.rows[0].c).toBe(3);
  });

  it("members see their payouts and earnings but cannot record payouts", async () => {
    await expect(asUser(pool, member,
      `select public.record_commission_payout($1, 100, current_date, 'TRF-X', null, null, true, null, null)`, [member]),
    ).rejects.toThrow(/FORBIDDEN/);
    const rows = await asUser(pool, member, `select * from public.commission_payouts`);
    expect(rows.length).toBe(3);
  });
});

describe("data isolation & immutability", () => {
  it("#16 members cannot access another member's private data", async () => {
    const campaign = await createOpenCampaign(pool, admin, 1, 2030);
    const a = await createActiveMember(pool, admin, "privasi-a@kita.test");
    const b = await createActiveMember(pool, admin, "privasi-b@kita.test");
    const sale = await createSale(pool, a, campaign, 1);
    await asUser(pool, a, `select public.submit_share_payment(5000, current_date, $1, $2, $3)`, [`PRV-${key()}`, `${a}/s.pdf`, key()]);

    const notes = await asUser<{ user_id: string }>(pool, b, `select user_id from public.notifications`);
    expect(notes.every((n) => n.user_id === b)).toBe(true);
    for (const table of ["qurban_sales", "buyers", "qurban_participants", "share_transactions", "commission_ledger", "payment_submissions"]) {
      const rows = await asUser(pool, b, `select * from public.${table}`);
      expect(rows, table).toHaveLength(0);
    }
    const profiles = await asUser<{ id: string }>(pool, b, `select id, ic_number from public.profiles`);
    expect(profiles.map((p) => p.id)).toEqual([b]);
    await expect(asUser(pool, b, `select public.cancel_qurban_sale($1, 'bukan saya')`, [sale])).rejects.toThrow(/NOT_FOUND/);
    await expect(asUser(pool, b, `select public.submit_sale_payment($1, 85000, current_date, 'X-REF', $2, $3)`,
      [sale, `${b}/x.pdf`, key()])).rejects.toThrow(/NOT_FOUND/);
    const audit = await asUser(pool, b, `select * from public.audit_logs`);
    expect(audit).toHaveLength(0);
    const adminView = await asUser(pool, admin, `select * from public.qurban_sales where id = $1`, [sale]);
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
    const { rows: [entry] } = await pool.query(`select id from public.commission_ledger limit 1`);
    await expect(pool.query(`update public.commission_ledger set amount_sen = 1 where id = $1`, [entry.id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.commission_ledger where id = $1`, [entry.id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`truncate public.commission_ledger cascade`)).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.commission_payouts`)).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.share_transactions`)).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.qurban_sales`)).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`update public.audit_logs set action = 'x'`)).rejects.toThrow(/IMMUTABLE_RECORD/);
    const { rows: [approved] } = await pool.query(`select id from public.qurban_sales where status = 'approved' limit 1`);
    await expect(pool.query(`update public.qurban_sales set total_sen = 1, share_count = 1 where id = $1`, [approved.id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    // clients have no write privileges at all
    const m = await createActiveMember(pool, admin, "tulis@kita.test");
    await expect(asUser(pool, m, `insert into public.commission_ledger (member_id, entry_type, amount_sen, description, source_key) values ($1, 'adjustment', 100000, 'x', 'x')`, [m])).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, admin, `delete from public.share_transactions`)).rejects.toThrow(/permission denied/);
  });

  it("administrative and financial actions are written to the audit log", async () => {
    const { rows } = await pool.query(`select distinct action from public.audit_logs`);
    const actions = rows.map((r) => r.action);
    for (const a of ["member.approved", "share_payment.approved", "sale.approved", "commission.payout_recorded", "sale.cancelled", "setting.updated"]) {
      expect(actions).toContain(a);
    }
  });

  it("notification failures do not roll back financial operations", async () => {
    const campaign = await createOpenCampaign(pool, admin, 1, 2031);
    const m = await createActiveMember(pool, admin, "notif@kita.test");
    const sale = await createSale(pool, m, campaign, 1);
    await pool.query(`alter table public.notifications add constraint notif_block check (type <> 'sale_approved') not valid`);
    try {
      await payAndApprove(pool, admin, m, sale);
      const st = (await pool.query(`select status from public.qurban_sales where id = $1`, [sale])).rows[0].status;
      expect(st).toBe("approved");
      expect(await commissionTotal(pool, m)).toBe(4000);
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
