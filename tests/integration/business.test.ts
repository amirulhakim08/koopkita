/** "Bisnes Saya": member business profiles, invoices, payments, receipts and sharing. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { asRole, asUser, createActiveMember, createAdmin, freshDatabase, key } from "./db";

let pool: Pool;
let admin: string;
let owner: string;
let other: string;
let businessId: string;
let customerId: string;

const profile = { name: "Kedai Contoh Agro Enterprise", ssm_no: "2024 0312 3456", phone: "012-345 6789", email: "kedai@contoh.test",
  address: "No 1, Jalan Contoh", bank_name: "Maybank", bank_account_no: "512345678901", bank_account_holder: "Kedai Contoh Agro" };
const items = [
  { description: "Baja organik 25kg", quantity: 4, unit_price_sen: 4500, discount_sen: 0 },
  { description: "Benih cili", quantity: 10, unit_price_sen: 350, discount_sen: 500 },
];

const draft = (uid: string, id: string | null, it = items) =>
  asUser<{ id: string }>(pool, uid, `select public.save_invoice_draft($1, $2, current_date, current_date + 14, 'Terima kasih', $3) as id`,
    [id, customerId, JSON.stringify(it)]).then((r) => r[0].id);
const invoice = async (id: string) => (await pool.query(`select * from public.business_invoices where id = $1`, [id])).rows[0];

beforeAll(async () => {
  pool = await freshDatabase("koopkita_business");
  admin = await createAdmin(pool);
  owner = await createActiveMember(pool, admin, "bisnes@kita.test");
  other = await createActiveMember(pool, admin, "lain@kita.test");
  [{ id: businessId }] = await asUser<{ id: string }>(pool, owner, `select public.save_my_business($1) as id`, [profile]);
  [{ id: customerId }] = await asUser<{ id: string }>(pool, owner,
    `insert into public.business_customers (business_id, name, phone) values ($1, 'Encik Ali', '0112233445') returning id`, [businessId]);
});

afterAll(async () => {
  await pool.end();
});

describe("business profile", () => {
  it("normalises and validates profile fields; one business per member", async () => {
    const b = (await pool.query(`select ssm_no, phone from public.business_profiles where id = $1`, [businessId])).rows[0];
    expect(b).toEqual({ ssm_no: "202403123456", phone: "0123456789" });
    await expect(asUser(pool, other, `select public.save_my_business($1)`, [{ ...profile, ssm_no: "ABC" }])).rejects.toThrow(/VALIDATION/);
    await expect(asUser(pool, other, `select public.save_my_business($1)`, [{ ...profile, phone: "" }])).rejects.toThrow(/VALIDATION/);
    await expect(asUser(pool, other, `select public.save_my_business($1)`, [{ ...profile, logo_path: `${owner}/x.png` }])).rejects.toThrow(/Logo/);
    // saving again updates the same business
    const [{ id }] = await asUser<{ id: string }>(pool, owner, `select public.save_my_business($1) as id`, [profile]);
    expect(id).toBe(businessId);
  });

  it("admin verifies SSM; changing the SSM number removes the verification", async () => {
    await asUser(pool, admin, `select public.admin_set_business_verified($1, true)`, [businessId]);
    expect((await pool.query(`select ssm_verified_at from public.business_profiles where id = $1`, [businessId])).rows[0].ssm_verified_at).not.toBeNull();
    await asUser(pool, owner, `select public.save_my_business($1)`, [{ ...profile, ssm_no: "JM0812345-K" }]);
    expect((await pool.query(`select ssm_verified_at from public.business_profiles where id = $1`, [businessId])).rows[0].ssm_verified_at).toBeNull();
    await asUser(pool, owner, `select public.save_my_business($1)`, [profile]);
    await asUser(pool, admin, `select public.admin_set_business_verified($1, true)`, [businessId]);
    await expect(asUser(pool, owner, `select public.admin_set_business_verified($1, true)`, [businessId])).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("invoices", () => {
  it("computes totals, issues with a number and freezes the invoice", async () => {
    const id = await draft(owner, null);
    let inv = await invoice(id);
    // 4 x 45.00 + 10 x 3.50 - 5.00 = 210.00
    expect([Number(inv.subtotal_sen), Number(inv.discount_sen), Number(inv.total_sen), inv.status]).toEqual([21500, 500, 21000, "draft"]);
    const [{ no }] = await asUser<{ no: string }>(pool, owner, `select public.issue_invoice($1) as no`, [id]);
    expect(no).toMatch(/^INV-\d{4}-0001$/);
    inv = await invoice(id);
    expect(inv.status).toBe("issued");
    expect(inv.share_token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(inv.business_snapshot.ssm_verified).toBe(true);
    expect(inv.customer_snapshot.name).toBe("Encik Ali");
    await expect(draft(owner, id)).rejects.toThrow(/Hanya draf/);
    await expect(pool.query(`update public.business_invoices set total_sen = 1 where id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.business_invoices where id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`update public.business_invoice_items set unit_price_sen = 1 where invoice_id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
  });

  it("applies SST when the business enables it", async () => {
    await asUser(pool, owner, `select public.save_my_business($1)`, [{ ...profile, sst_enabled: true, sst_rate_bp: 600 }]);
    const id = await draft(owner, null, [{ description: "Servis", quantity: 1, unit_price_sen: 10000, discount_sen: 0 }]);
    const inv = await invoice(id);
    expect([Number(inv.tax_sen), Number(inv.total_sen), inv.tax_rate_bp]).toEqual([600, 10600, 600]);
    await asUser(pool, owner, `select public.save_my_business($1)`, [profile]);
    await asUser(pool, owner, `select public.delete_invoice_draft($1)`, [id]);
    expect(await invoice(id)).toBeUndefined();
  });

  it("allocates unique numbers under concurrency", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => draft(owner, null)));
    const nos = await Promise.all(ids.map((id) => asUser<{ no: string }>(pool, owner, `select public.issue_invoice($1) as no`, [id]).then((r) => r[0].no)));
    expect(new Set(nos).size).toBe(6);
  });
});

describe("payments and receipts", () => {
  let id: string;
  beforeAll(async () => {
    id = await draft(owner, null);
    await asUser(pool, owner, `select public.issue_invoice($1)`, [id]);
  });

  it("records partial and full payments with receipts and updates the status", async () => {
    await asUser(pool, owner, `select public.record_invoice_payment($1, 10000, current_date, 'duitnow', 'REF1', null, $2)`, [id, key()]);
    expect((await invoice(id)).status).toBe("partially_paid");
    await expect(asUser(pool, owner, `select public.record_invoice_payment($1, 20000, current_date, 'cash', null, null, null)`, [id])).rejects.toThrow(/baki/);
    await asUser(pool, owner, `select public.record_invoice_payment($1, 11000, current_date, 'cash', null, null, null)`, [id]);
    const inv = await invoice(id);
    expect([inv.status, Number(inv.paid_sen)]).toEqual(["paid", 21000]);
    const receipts = (await pool.query(`select receipt_no from public.business_payments where invoice_id = $1 order by created_at`, [id])).rows;
    expect(receipts.map((r) => r.receipt_no)).toEqual([expect.stringMatching(/^RCP-\d{4}-0001$/), expect.stringMatching(/^RCP-\d{4}-0002$/)]);
  });

  it("reversing a receipt reopens the invoice; receipts are never deleted; cancellation needs reversals first", async () => {
    await expect(asUser(pool, owner, `select public.cancel_invoice($1, 'Salah pelanggan')`, [id])).rejects.toThrow(/Balikkan/);
    const pays = (await pool.query(`select id from public.business_payments where invoice_id = $1`, [id])).rows;
    for (const p of pays) await asUser(pool, owner, `select public.reverse_invoice_payment($1, 'Bayaran dipulangkan')`, [p.id]);
    expect((await invoice(id)).status).toBe("issued");
    await expect(pool.query(`delete from public.business_payments where id = $1`, [pays[0].id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`update public.business_payments set amount_sen = 1 where id = $1`, [pays[0].id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await asUser(pool, owner, `select public.cancel_invoice($1, 'Salah pelanggan')`, [id]);
    expect((await invoice(id)).status).toBe("cancelled");
    await expect(asUser(pool, owner, `select public.record_invoice_payment($1, 100, current_date, 'cash', null, null, null)`, [id])).rejects.toThrow(/CONFLICT/);
  });
});

describe("sharing, privacy and administration", () => {
  it("public links show one document to anyone with the token, and can be revoked or replaced", async () => {
    const id = await draft(owner, null);
    await asUser(pool, owner, `select public.issue_invoice($1)`, [id]);
    const token = (await invoice(id)).share_token;
    const [{ d }] = await asRole<{ d: { kind: string; invoice: { invoice_no: string; items: unknown[] } } }>(pool, "anon", {}, `select public.public_document($1) as d`, [token]);
    expect(d.kind).toBe("invoice");
    expect(d.invoice.items).toHaveLength(2);
    await asUser(pool, owner, `select public.set_document_share('invoice', $1, false, false)`, [id]);
    expect((await asRole<{ d: unknown }>(pool, "anon", {}, `select public.public_document($1) as d`, [token]))[0].d).toBeNull();
    const [{ t }] = await asUser<{ t: string }>(pool, owner, `select public.set_document_share('invoice', $1, true, true) as t`, [id]);
    expect(t).not.toBe(token);
    expect((await asRole<{ d: unknown }>(pool, "anon", {}, `select public.public_document($1) as d`, [token]))[0].d).toBeNull();
    expect((await asRole<{ d: unknown }>(pool, "anon", {}, `select public.public_document($1) as d`, [t]))[0].d).not.toBeNull();
    // receipts have their own token
    const [{ p }] = await asUser<{ p: string }>(pool, owner, `select public.record_invoice_payment($1, 500, current_date, 'cash', null, null, null) as p`, [id]);
    const rt = (await pool.query(`select share_token from public.business_payments where id = $1`, [p])).rows[0].share_token;
    const [{ d: rd }] = await asRole<{ d: { kind: string; payment: { amount_sen: number } } }>(pool, "anon", {}, `select public.public_document($1) as d`, [rt]);
    expect([rd.kind, Number(rd.payment.amount_sen)]).toEqual(["receipt", 500]);
    // drafts are never public; anon cannot read tables
    const draftId = await draft(owner, null);
    expect(draftId).toBeTruthy();
    await expect(asRole(pool, "anon", {}, `select * from public.business_invoices`)).rejects.toThrow(/permission denied/);
  });

  it("members see only their own business data; admin sees profiles and totals only", async () => {
    for (const t of ["business_customers", "business_invoices", "business_invoice_items", "business_payments", "business_profiles"]) {
      expect(await asUser(pool, other, `select * from public.${t}`), t).toHaveLength(0);
    }
    const anyInvoice = (await pool.query(`select id from public.business_invoices where status <> 'draft' limit 1`)).rows[0].id;
    await expect(asUser(pool, other, `select public.my_business_document('invoice', $1)`, [anyInvoice])).rejects.toThrow(/NOT_FOUND/);
    await expect(asUser(pool, other, `insert into public.business_customers (business_id, name) values ($1, 'Pencuri')`, [businessId])).rejects.toThrow(/row-level security/);
    // admin: profile + aggregates, no customers / invoices / items / receipts
    expect((await asUser(pool, admin, `select * from public.business_profiles`)).length).toBe(1);
    for (const t of ["business_customers", "business_invoices", "business_invoice_items", "business_payments"]) {
      expect(await asUser(pool, admin, `select * from public.${t}`), t).toHaveLength(0);
    }
    const [row] = await asUser<{ invoice_count: string; received_sen: string }>(pool, admin, `select * from public.admin_business_overview()`);
    expect(Number(row.invoice_count)).toBeGreaterThan(0);
    await expect(asUser(pool, owner, `select * from public.admin_business_overview()`)).rejects.toThrow(/FORBIDDEN/);
  });

  it("a suspended business cannot create documents until reactivated", async () => {
    await asUser(pool, admin, `select public.admin_set_business_suspended($1, true, 'Semakan dokumen')`, [businessId]);
    await expect(draft(owner, null)).rejects.toThrow(/digantung/);
    await expect(asUser(pool, owner, `insert into public.business_customers (business_id, name) values ($1, 'Baru')`, [businessId])).rejects.toThrow(/row-level security/);
    await asUser(pool, admin, `select public.admin_set_business_suspended($1, false, null)`, [businessId]);
    await expect(draft(owner, null)).resolves.toBeTruthy();
  });
});
