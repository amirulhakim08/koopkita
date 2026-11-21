/**
 * Investment projects: funding rules, profit sharing, dividend withdrawals,
 * capital returns and the link with cooperative finances. Runs the real
 * migrations on PostgreSQL as Supabase client roles.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { asUser, configureBank, createActiveMember, createAdmin, createOpenProject, freshDatabase, invest, joinProject, key } from "./db";

let pool: Pool;
let admin: string;
let seq = 0;
const member = (p = "ahli") => createActiveMember(pool, admin, `${p}-${++seq}@kita.test`);

beforeAll(async () => {
  pool = await freshDatabase("koopkita_projects");
  admin = await createAdmin(pool);
  await configureBank(pool, admin);
});

afterAll(async () => {
  await pool.end();
});

const status = async (id: string) => (await pool.query(`select status from public.projects where id = $1`, [id])).rows[0].status as string;
const progress = async (memberId: string, id: string) =>
  (await asUser<{ approved_sen: string; pending_sen: string; available_sen: string }>(
    pool, memberId, `select * from public.project_progress() where project_id = $1`, [id]))[0];

async function activate(id: string, amountSen?: number) {
  if ((await status(id)) === "open") await asUser(pool, admin, `select public.set_project_status($1, 'full', null)`, [id]);
  const cap = amountSen ?? Number((await pool.query(
    `select sum(amount_sen) s from public.project_participations where project_id = $1 and status = 'approved'`, [id])).rows[0].s);
  await asUser(pool, admin, `select public.record_project_investment($1, current_date, $2, 'KOPSYA-REF-1', null)`, [id, cap]);
}

async function declare(projectId: string, data: Record<string, unknown>, received = true) {
  const [{ id }] = await asUser<{ id: string }>(pool, admin, `select public.save_profit_declaration(null, $1, $2) as id`, [projectId, {
    period_label: `Tahun ${++seq}`, announced_on: new Date().toISOString().slice(0, 10), ...data,
  }]);
  await asUser(pool, admin, `select public.confirm_profit_declaration($1, ${received ? "current_date" : "null"})`, [id]);
  return id;
}

const allocations = async (declarationId: string): Promise<Record<string, { a: number; c: number }>> =>
  Object.fromEntries((await pool.query(
    `select member_id, amount_sen::int a, coop_sen::int c from public.project_profit_allocations where declaration_id = $1`, [declarationId],
  )).rows.map((r) => [r.member_id, { a: r.a, c: r.c }]));

describe("project creation and publishing", () => {
  it("creates configurable projects with auto codes; drafts are hidden from members", async () => {
    const m = await member();
    const [{ id }] = await asUser<{ id: string }>(pool, admin, `select public.save_project(null, $1) as id`, [{
      name: "Pelaburan KOPSYA 2027", partner: "KOPSYA", target_sen: 2000000, min_sen: 50000, step_sen: 50000,
      max_per_member_sen: 500000, duration_months: 12, terms: "Terma projek ujian.", risk_disclosure: "Modal tidak dijamin.",
    }]);
    const [p] = (await pool.query(`select code, status from public.projects where id = $1`, [id])).rows;
    expect(p.code).toMatch(/^PRJ-\d{4}-\d{3}$/);
    expect(p.status).toBe("draft");
    expect(await asUser(pool, m, `select id from public.projects where id = $1`, [id])).toHaveLength(0);
    await asUser(pool, admin, `select public.publish_project($1)`, [id]);
    expect(await asUser(pool, m, `select id from public.projects where id = $1`, [id])).toHaveLength(1);
    await expect(asUser(pool, m, `select public.save_project(null, $1)`, [{ name: "Ahli cipta", partner: "X", target_sen: 1, min_sen: 1, step_sen: 1 }]))
      .rejects.toThrow(/FORBIDDEN/);
  });

  it("refuses impossible funding configurations before publishing", async () => {
    const base = { name: "Konfigurasi salah", partner: "KOPSYA", terms: "Terma projek ujian.", risk_disclosure: "Modal tidak dijamin." };
    const draft = async (d: Record<string, unknown>) =>
      (await asUser<{ id: string }>(pool, admin, `select public.save_project(null, $1) as id`, [{ ...base, ...d }]))[0].id;
    await expect(asUser(pool, admin, `select public.publish_project($1)`,
      [await draft({ target_sen: 2025000, min_sen: 50000, step_sen: 50000 })])).rejects.toThrow(/Sasaran tidak boleh dicapai/);
    await expect(asUser(pool, admin, `select public.publish_project($1)`,
      [await draft({ target_sen: 2000000, min_sen: 75000, step_sen: 50000 })])).rejects.toThrow(/Minimum penyertaan mesti gandaan/);
    await expect(asUser(pool, admin, `select public.save_project(null, $1)`, [{ ...base, target_sen: 100000, min_sen: 200000, step_sen: 50000 }]))
      .rejects.toThrow(/VALIDATION/);
    const noTerms = await draft({ target_sen: 1000000, min_sen: 50000, step_sen: 50000, terms: "" });
    await expect(asUser(pool, admin, `select public.publish_project($1)`, [noTerms])).rejects.toThrow(/terma/);
  });

  it("funding rules are fixed once published; drafts can be deleted, published projects cannot", async () => {
    const id = await createOpenProject(pool, admin);
    await asUser(pool, admin, `select public.save_project($1, $2)`, [id, {
      name: "Nama baharu", partner: "KOPSYA", target_sen: 1, min_sen: 1, step_sen: 1, terms: "Terma versi kedua.", risk_disclosure: "Risiko.",
    }]);
    const [p] = (await pool.query(`select name, target_sen::int t, terms_version v from public.projects where id = $1`, [id])).rows;
    expect([p.name, p.t, p.v]).toEqual(["Nama baharu", 2000000, 2]);
    await expect(asUser(pool, admin, `select public.delete_project_draft($1)`, [id])).rejects.toThrow(/draf/);
  });
});

describe("minimum and step rules", () => {
  it("#2/#3 accepts RM500, RM1,000, RM1,500 and rejects RM750 (min RM500, step RM500)", async () => {
    const id = await createOpenProject(pool, admin);
    const m = await member();
    for (const sen of [50000, 100000, 150000]) await expect(joinProject(pool, m, id, sen)).resolves.toBeTruthy();
    await expect(joinProject(pool, m, id, 75000)).rejects.toThrow(/gandaan RM500.00/);
    await expect(joinProject(pool, m, id, 120000)).rejects.toThrow(/gandaan/);
  });

  it("min RM1,000 / step RM500: a first contribution must reach the minimum, top-ups follow the step", async () => {
    const id = await createOpenProject(pool, admin, { min_sen: 100000, step_sen: 50000 });
    const m = await member();
    await expect(joinProject(pool, m, id, 50000)).rejects.toThrow(/Minimum penyertaan ialah RM1,000.00/);
    await invest(pool, admin, m, id, 100000);
    await expect(joinProject(pool, m, id, 50000)).resolves.toBeTruthy(); // #4 RM1,000 then RM500
  });

  it("min RM2,000 / step RM1,000 accepts RM2,000, RM3,000 and refuses RM2,500", async () => {
    const id = await createOpenProject(pool, admin, { min_sen: 200000, step_sen: 100000 });
    const [a, b] = [await member(), await member()];
    await expect(joinProject(pool, a, id, 200000)).resolves.toBeTruthy();
    await expect(joinProject(pool, b, id, 300000)).resolves.toBeTruthy();
    await expect(joinProject(pool, b, id, 250000)).rejects.toThrow(/gandaan RM1,000.00/);
  });

  it("#4 multiple contributions add up, and the maximum applies to the member's total", async () => {
    const id = await createOpenProject(pool, admin, { max_per_member_sen: 200000 });
    const m = await member();
    await invest(pool, admin, m, id, 100000);
    await invest(pool, admin, m, id, 50000);
    const [w] = await asUser<{ capital_sen: string }>(pool, m, `select capital_sen from public.member_project_wallet() where project_id = $1`, [id]);
    expect(Number(w.capital_sen)).toBe(150000);
    await expect(joinProject(pool, m, id, 100000)).rejects.toThrow(/had seorang ahli RM2,000.00/);
    await expect(joinProject(pool, m, id, 50000)).resolves.toBeTruthy();
  });

  it("requires the current terms version", async () => {
    const id = await createOpenProject(pool, admin);
    const m = await member();
    await expect(asUser(pool, m, `select public.join_project($1, 50000, current_date, 'TERMA-1', $2, 99, $3)`,
      [id, `${m}/t.pdf`, key()])).rejects.toThrow(/Terma projek telah dikemas kini/);
  });
});

describe("funding limits", () => {
  it("pending plus approved contributions never exceed the target; a rejection frees the capacity", async () => {
    const id = await createOpenProject(pool, admin, { target_sen: 200000 });
    const [a, b] = [await member(), await member()];
    const first = await joinProject(pool, a, id, 150000);
    await expect(joinProject(pool, b, id, 100000)).rejects.toThrow(/Baki yang masih tersedia RM500.00/);
    await asUser(pool, admin, `select public.review_project_participation($1, false, 'Resit kabur')`, [first]);
    await expect(joinProject(pool, b, id, 100000)).resolves.toBeTruthy();
    const p = await progress(a, id);
    expect([Number(p.approved_sen), Number(p.pending_sen), Number(p.available_sen)]).toEqual([0, 100000, 100000]);
  });

  it("#5 reaching the target closes the project and blocks further funding", async () => {
    const id = await createOpenProject(pool, admin, { target_sen: 100000 });
    const [a, b] = [await member(), await member()];
    await invest(pool, admin, a, id, 50000);
    expect(await status(id)).toBe("open");
    await invest(pool, admin, b, id, 50000);
    expect(await status(id)).toBe("full");
    await expect(joinProject(pool, a, id, 50000)).rejects.toThrow(/tidak dibuka/);
    const notes = (await pool.query(`select count(*)::int c from public.notifications where user_id = $1 and type = 'project_funded'`, [admin])).rows[0].c;
    expect(notes).toBe(1);
  });

  it("#6 concurrent contributions for the last remaining amount never oversubscribe", async () => {
    const id = await createOpenProject(pool, admin, { target_sen: 100000 });
    const members = await Promise.all(Array.from({ length: 6 }, () => member("serentak")));
    const results = await Promise.allSettled(members.map((m) => joinProject(pool, m, id, 50000)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const { rows } = await pool.query(`select sum(amount_sen)::int s from public.project_participations where project_id = $1 and status <> 'rejected'`, [id]);
    expect(rows[0].s).toBe(100000);
  });

  it("#14 approving the same payment twice is idempotent and cannot be reversed", async () => {
    const id = await createOpenProject(pool, admin);
    const m = await member();
    const pp = await invest(pool, admin, m, id, 50000);
    await asUser(pool, admin, `select public.review_project_participation($1, true, null)`, [pp]);
    await expect(asUser(pool, admin, `select public.review_project_participation($1, false, 'Ubah fikiran')`, [pp])).rejects.toThrow(/dimuktamadkan/);
    const p = await progress(m, id);
    expect(Number(p.approved_sen)).toBe(50000);
  });

  it("an admin cannot approve their own contribution", async () => {
    const id = await createOpenProject(pool, admin);
    const pp = await joinProject(pool, admin, id, 50000);
    await expect(asUser(pool, admin, `select public.review_project_participation($1, true, null)`, [pp])).rejects.toThrow(/sendiri/);
  });
});

describe("profit sharing", () => {
  let project: string;
  let A: string, B: string, C: string, D: string, E: string;

  beforeAll(async () => {
    project = await createOpenProject(pool, admin, { target_sen: 2000000 });
    [A, B, C, D, E] = await Promise.all(["a", "b", "c", "d", "e"].map((x) => member(`untung-${x}`)));
    await invest(pool, admin, A, project, 50000);
    await invest(pool, admin, B, project, 100000);
    await invest(pool, admin, C, project, 250000);
    await invest(pool, admin, D, project, 500000);
    await invest(pool, admin, E, project, 1100000);
    expect(await status(project)).toBe("full");
    await activate(project, 2000000);
    expect(await status(project)).toBe("active");
  });

  it("#7 10% on RM20,000: members get 9% (RM1,800), the cooperative 1% (RM200)", async () => {
    const d = await declare(project, { rate_bp: 1000, gross_sen: 200000 });
    const [row] = (await pool.query(`select coop_rate_bp, member_total_sen::int m, coop_total_sen::int c, capital_sen::int k from public.project_profit_declarations where id = $1`, [d])).rows;
    expect([row.coop_rate_bp, row.m, row.c, row.k]).toEqual([100, 180000, 20000, 2000000]);
    const al = await allocations(d);
    expect([al[A].a, al[B].a, al[C].a, al[D].a, al[E].a]).toEqual([4500, 9000, 22500, 45000, 99000]);
    expect([al[A].c, al[D].c]).toEqual([500, 5000]);
  });

  it("#8/#9 default split: 5% -> 5%/0%, 6.5% -> 6%/0.5%", async () => {
    const five = await declare(project, { rate_bp: 500, gross_sen: 100000 });
    const sixHalf = await declare(project, { rate_bp: 650, gross_sen: 130000 });
    const q = async (id: string) => (await pool.query(`select coop_rate_bp, member_total_sen::int m, coop_total_sen::int c from public.project_profit_declarations where id = $1`, [id])).rows[0];
    expect(await q(five)).toEqual({ coop_rate_bp: 0, m: 100000, c: 0 });
    expect(await q(sixHalf)).toEqual({ coop_rate_bp: 50, m: 120000, c: 10000 });
  });

  it("charges are deducted before the split; the admin can override the cooperative's points", async () => {
    const fee = await declare(project, { rate_bp: 1000, gross_sen: 200000, fee_sen: 5000, fee_description: "Yuran pentadbiran" });
    const r = (await pool.query(`select member_total_sen::int m, coop_total_sen::int c from public.project_profit_declarations where id = $1`, [fee])).rows[0];
    expect([r.m, r.c]).toEqual([175500, 19500]);
    const custom = await declare(project, { rate_bp: 1000, gross_sen: 200000, coop_rate_bp: 200 });
    const c = (await pool.query(`select member_total_sen::int m from public.project_profit_declarations where id = $1`, [custom])).rows[0];
    expect(c.m).toBe(160000);
    await expect(asUser(pool, admin, `select public.save_profit_declaration(null, $1, $2)`, [project, {
      period_label: "Salah", announced_on: "2026-01-01", rate_bp: 1000, gross_sen: 200000, fee_sen: 100, fee_description: "",
    }])).rejects.toThrow(/jenis potongan/);
  });

  it("allocations always add up exactly (largest remainder, integer sen)", async () => {
    const p = await createOpenProject(pool, admin, { target_sen: 150000 });
    const ms = await Promise.all([1, 2, 3].map(() => member("bundar")));
    for (const m of ms) await invest(pool, admin, m, p, 50000);
    await activate(p);
    const d = await declare(p, { rate_bp: 733, gross_sen: 10001 });
    const al = Object.values(await allocations(d));
    const [row] = (await pool.query(`select member_total_sen::int m, coop_total_sen::int c from public.project_profit_declarations where id = $1`, [d])).rows;
    expect(al.reduce((s, x) => s + x.a, 0)).toBe(row.m);
    expect(al.reduce((s, x) => s + x.c, 0)).toBe(row.c);
    expect(row.m + row.c).toBe(10001);
    expect(Math.max(...al.map((x) => x.a)) - Math.min(...al.map((x) => x.a))).toBeLessThanOrEqual(1);
  });

  it("drafts are editable and previewable; confirmed declarations are frozen and periods unique", async () => {
    const [{ id }] = await asUser<{ id: string }>(pool, admin, `select public.save_profit_declaration(null, $1, $2) as id`, [project, {
      period_label: "Tahun Draf", announced_on: "2026-06-01", rate_bp: 800, gross_sen: 160000,
    }]);
    await asUser(pool, admin, `select public.save_profit_declaration($1, $2, $3)`, [id, project, {
      period_label: "Tahun Draf", announced_on: "2026-06-01", rate_bp: 900, gross_sen: 180000,
    }]);
    const preview = await asUser<{ amount_sen: string }>(pool, admin, `select * from public.preview_profit_declaration($1)`, [id]);
    expect(preview.reduce((s, r) => s + Number(r.amount_sen), 0)).toBe(160000); // 9% -> 8% to members
    expect(await asUser(pool, A, `select * from public.project_profit_declarations where id = $1`, [id])).toHaveLength(0);
    expect(await asUser(pool, A, `select * from public.project_profit_allocations a join public.project_profit_declarations d on d.id = a.declaration_id where d.id = $1`, [id])).toHaveLength(0);
    await asUser(pool, admin, `select public.confirm_profit_declaration($1, null)`, [id]);
    await asUser(pool, admin, `select public.confirm_profit_declaration($1, null)`, [id]); // repeat is a no-op
    expect((await pool.query(`select count(*)::int c from public.project_profit_allocations where declaration_id = $1`, [id])).rows[0].c).toBe(5);
    await expect(pool.query(`update public.project_profit_declarations set gross_sen = 1 where id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(asUser(pool, admin, `select public.save_profit_declaration($1, $2, $3)`, [id, project, {
      period_label: "Tahun Draf", announced_on: "2026-06-01", rate_bp: 1, gross_sen: 1,
    }])).rejects.toThrow(/tidak boleh diubah/);
    await expect(asUser(pool, admin, `select public.save_profit_declaration(null, $1, $2)`, [project, {
      period_label: "tahun draf ", announced_on: "2026-06-01", rate_bp: 900, gross_sen: 180000,
    }])).rejects.toThrow(/Tempoh ini sudah mempunyai/);
    await expect(asUser(pool, A, `select public.confirm_profit_declaration($1, null)`, [id])).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("dividend withdrawals", () => {
  let project: string;
  let m: string;
  let declared: string;

  beforeAll(async () => {
    project = await createOpenProject(pool, admin, { target_sen: 200000 });
    m = await member("pengeluaran");
    const other = await member("pengeluaran-lain");
    await invest(pool, admin, m, project, 100000);
    await invest(pool, admin, other, project, 100000);
    await activate(project);
    declared = await declare(project, { rate_bp: 1000, gross_sen: 20000 }, false); // RM90 each, not yet received
  });

  const wallet = async () =>
    (await asUser<Record<string, string>>(pool, m, `select * from public.member_project_wallet() where project_id = $1`, [project]))[0];
  const request = (sen: number, k = key("wd")) =>
    asUser<{ id: string }>(pool, m, `select public.request_dividend_withdrawal($1, $2, null, $3) as id`, [project, sen, k]).then((r) => r[0].id);

  it("dividends are available only after the money is received", async () => {
    let w = await wallet();
    expect([Number(w.dividend_declared_sen), Number(w.available_sen)]).toEqual([9000, 0]);
    await expect(request(1000)).rejects.toThrow(/Melebihi dividen tersedia RM0.00/);
    await asUser(pool, admin, `select public.mark_profit_received($1, current_date)`, [declared]);
    w = await wallet();
    expect(Number(w.available_sen)).toBe(9000);
  });

  it("requests reserve the amount; overlapping requests cannot exceed the balance; rejection releases it", async () => {
    const first = await request(6000);
    await expect(request(4000)).rejects.toThrow(/Melebihi dividen tersedia RM30.00/);
    const results = await Promise.allSettled([request(3000), request(3000)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await wallet()).available_sen)).toBe(0);
    await asUser(pool, admin, `select public.review_dividend_withdrawal($1, false, 'Akaun bank tidak sepadan')`, [first]);
    expect(Number((await wallet()).available_sen)).toBe(6000);
  });

  it("payment needs the treasurer's receipt; repeat payments are prevented; member is notified", async () => {
    const id = await request(6000);
    await asUser(pool, admin, `select public.review_dividend_withdrawal($1, true, null)`, [id]);
    await expect(asUser(pool, admin, `select public.record_withdrawal_payment($1, current_date, 'TRF-001', null)`, [id])).rejects.toThrow(/resit pindahan/);
    await expect(asUser(pool, m, `select public.record_withdrawal_payment($1, current_date, 'TRF-001', $2)`, [id, `${m}/x.pdf`])).rejects.toThrow(/FORBIDDEN/);
    await asUser(pool, admin, `select public.record_withdrawal_payment($1, current_date, 'TRF-001', $2)`, [id, `${admin}/bukti.pdf`]);
    await asUser(pool, admin, `select public.record_withdrawal_payment($1, current_date, 'TRF-002', $2)`, [id, `${admin}/bukti2.pdf`]);
    const [row] = (await pool.query(`select status, transaction_ref from public.project_withdrawals where id = $1`, [id])).rows;
    expect(row).toEqual({ status: "paid", transaction_ref: "TRF-001" });
    await expect(asUser(pool, admin, `select public.review_dividend_withdrawal($1, false, 'Terlambat')`, [id])).rejects.toThrow(/dimuktamadkan/);
    const w = await wallet();
    expect([Number(w.withdrawn_sen), Number(w.available_sen)]).toEqual([6000, 0]);
    const n = (await pool.query(`select count(*)::int c from public.notifications where user_id = $1 and type = 'withdrawal_paid'`, [m])).rows[0].c;
    expect(n).toBe(1);
  });

  it("members can cancel their own pending request", async () => {
    const pending = (await pool.query(`select id from public.project_withdrawals where member_id = $1 and status = 'pending'`, [m])).rows[0].id;
    await asUser(pool, m, `select public.cancel_dividend_withdrawal($1)`, [pending]);
    expect(Number((await wallet()).available_sen)).toBe(3000);
  });

  it("a declaration with withdrawn dividends cannot be voided; an untouched one can", async () => {
    await expect(asUser(pool, admin, `select public.void_profit_declaration($1, 'Kadar salah dimasukkan')`, [declared])).rejects.toThrow(/telah dipohon atau dibayar/);
    const second = await declare(project, { rate_bp: 800, gross_sen: 16000 });
    const before = Number((await wallet()).available_sen);
    await asUser(pool, admin, `select public.void_profit_declaration($1, 'Kadar salah dimasukkan')`, [second]);
    expect(Number((await wallet()).available_sen)).toBe(before - 7000);
    await expect(asUser(pool, admin, `select public.save_profit_declaration(null, $1, $2)`, [project, {
      period_label: (await pool.query(`select period_label from public.project_profit_declarations where id = $1`, [second])).rows[0].period_label,
      announced_on: "2026-06-01", rate_bp: 800, gross_sen: 16000,
    }])).resolves.toBeTruthy(); // the voided period may be declared again
  });

  it("requires valid bank details on the profile", async () => {
    await pool.query(`update public.profiles set bank_account_no = null where id = $1`, [m]);
    await expect(request(100)).rejects.toThrow(/akaun bank/);
    await pool.query(`update public.profiles set bank_account_no = '112233445566' where id = $1`, [m]);
  });
});

describe("maturity, capital returns, cancellation and finance", () => {
  it("records maturity and capital returns separately from dividends, never above capital", async () => {
    const p = await createOpenProject(pool, admin, { target_sen: 100000 });
    const [a, b] = [await member("matang"), await member("matang")];
    await invest(pool, admin, a, p, 50000);
    await invest(pool, admin, b, p, 50000);
    await activate(p);
    await expect(asUser(pool, admin, `select public.record_capital_returns($1, 'return', current_date, 'PULANG-1', null, null, $2)`,
      [p, JSON.stringify([{ member_id: a, amount_sen: 50000 }])])).rejects.toThrow(/selepas projek matang/);
    await asUser(pool, admin, `select public.record_project_maturity($1, current_date, 95000, 'KOPSYA-PULANG', null)`, [p]);
    expect(await status(p)).toBe("matured");
    await expect(asUser(pool, admin, `select public.record_capital_returns($1, 'return', current_date, 'PULANG-1', null, null, $2)`,
      [p, JSON.stringify([{ member_id: a, amount_sen: 60000 }])])).rejects.toThrow(/melebihi modal/);
    await asUser(pool, admin, `select public.record_capital_returns($1, 'return', current_date, 'PULANG-1', null, null, $2)`,
      [p, JSON.stringify([{ member_id: a, amount_sen: 47500 }, { member_id: b, amount_sen: 47500 }])]);
    const [w] = await asUser<Record<string, string>>(pool, a, `select * from public.member_project_wallet() where project_id = $1`, [p]);
    expect([Number(w.capital_sen), Number(w.capital_returned_sen), Number(w.available_sen)]).toEqual([50000, 47500, 0]);
    await asUser(pool, admin, `select public.set_project_status($1, 'completed', null)`, [p]);
    expect(await status(p)).toBe("completed");
  });

  it("#13 cancelling rejects pending payments, blocks new ones and allows refunds", async () => {
    const p = await createOpenProject(pool, admin, { target_sen: 1000000 });
    const [a, b] = [await member("batal"), await member("batal")];
    await invest(pool, admin, a, p, 100000);
    const pending = await joinProject(pool, b, p, 50000);
    await expect(asUser(pool, admin, `select public.set_project_status($1, 'cancelled', null)`, [p])).rejects.toThrow(/sebab/);
    await asUser(pool, admin, `select public.set_project_status($1, 'cancelled', 'Rakan kongsi menarik diri')`, [p]);
    expect((await pool.query(`select status from public.project_participations where id = $1`, [pending])).rows[0].status).toBe("rejected");
    await expect(joinProject(pool, b, p, 50000)).rejects.toThrow(/tidak dibuka/);
    await asUser(pool, admin, `select public.record_capital_returns($1, 'refund', current_date, 'REFUND-1', null, 'Projek dibatalkan', $2)`,
      [p, JSON.stringify([{ member_id: a, amount_sen: 100000 }])]);
    const [w] = await asUser<Record<string, string>>(pool, a, `select * from public.member_project_wallet() where project_id = $1`, [p]);
    expect(Number(w.capital_returned_sen)).toBe(100000);
    expect((await pool.query(`select count(*)::int c from public.project_participations where project_id = $1`, [p])).rows[0].c).toBe(2);
  });

  it("project cash flows appear in Kewangan without double counting", async () => {
    const before = (await asUser<{ s: Record<string, number> }>(pool, admin, `select public.admin_finance_summary(null, null) as s`))[0].s;
    const p = await createOpenProject(pool, admin, { target_sen: 100000 });
    const m = await member("kewangan");
    await invest(pool, admin, m, p, 100000);
    await activate(p);
    const d = await declare(p, { rate_bp: 1000, gross_sen: 10000, fee_sen: 500, fee_description: "Caj bank" });
    const wd = (await asUser<{ id: string }>(pool, m, `select public.request_dividend_withdrawal($1, 2000, null, $2) as id`, [p, key()]))[0].id;
    await asUser(pool, admin, `select public.record_withdrawal_payment($1, current_date, 'TRF-K', $2)`, [wd, `${admin}/k.pdf`]);
    const after = (await asUser<{ s: Record<string, number> }>(pool, admin, `select public.admin_finance_summary(null, null) as s`))[0].s;
    const diff = (k: string) => Number(after[k]) - Number(before[k]);
    expect([diff("project_capital_sen"), diff("project_invested_sen"), diff("project_profit_sen"), diff("dividend_paid_sen")])
      .toEqual([100000, 100000, 9500, 2000]);
    expect(diff("total_funds_sen")).toBe(100000 - 100000 + 9500 - 2000);
    const memberShare = Number((await pool.query(`select member_total_sen from public.project_profit_declarations where id = $1`, [d])).rows[0].member_total_sen);
    expect(diff("dividend_liability_sen")).toBe(memberShare - 2000);
    const stats = (await asUser<{ s: Record<string, number> }>(pool, admin, `select public.admin_dashboard_stats() as s`))[0].s;
    expect(Number(stats.dividend_unpaid_sen)).toBeGreaterThanOrEqual(memberShare - 2000);
    await expect(asUser(pool, m, `select public.admin_dashboard_stats()`)).rejects.toThrow(/FORBIDDEN/);
  });
});
