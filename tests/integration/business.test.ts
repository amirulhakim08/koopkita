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
    expect(no).toMatch(/^INV-\d{6}001$/);
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

  it("numbers documents by date (YYMMDD) with a daily sequence that restarts each day", async () => {
    const dated = async (d: string) => {
      const [{ id }] = await asUser<{ id: string }>(pool, owner,
        `select public.save_invoice_draft(null, $1, $2::date, $2::date + 14, null, $3) as id`, [customerId, d, JSON.stringify(items)]);
      return (await asUser<{ no: string }>(pool, owner, `select public.issue_invoice($1) as no`, [id]))[0].no;
    };
    expect(await dated("2026-01-25")).toBe("INV-260125001");
    expect(await dated("2026-01-25")).toBe("INV-260125002");
    expect(await dated("2026-01-26")).toBe("INV-260126001");
    // the 1000th document of a day grows to 4 digits instead of wrapping
    await pool.query(`update app_private.business_daily_counters set last_no = 999 where business_id = $1 and kind = 'INV' and doc_date = '2026-01-25'`, [businessId]);
    expect(await dated("2026-01-25")).toBe("INV-2601251000");
    // receipts use the payment date and their own sequence
    const [{ id: inv }] = await asUser<{ id: string }>(pool, owner,
      `select id from public.business_invoices where invoice_no = 'INV-260126001'`);
    const [{ p }] = await asUser<{ p: string }>(pool, owner,
      `select public.record_invoice_payment($1, 100, '2026-01-27', 'cash', null, null, null) as p`, [inv]);
    expect((await pool.query(`select receipt_no from public.business_payments where id = $1`, [p])).rows[0].receipt_no).toBe("RCP-260127001");
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
    expect(receipts.map((r) => r.receipt_no)).toEqual([expect.stringMatching(/^RCP-\d{6}001$/), expect.stringMatching(/^RCP-\d{6}002$/)]);
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

describe("direct-sale receipts (no invoice)", () => {
  const direct = (uid: string, customer: string | null, it = items, k: string | null = key(), paidOn = "current_date") =>
    asUser<{ id: string }>(pool, uid,
      `select public.create_direct_receipt($1, ${paidOn}, 'cash', 'TUNAI-1', null, 'Terima kasih', $2, $3) as id`,
      [customer, JSON.stringify(it), k]).then((r) => r[0].id);
  const payment = async (id: string) => (await pool.query(`select * from public.business_payments where id = $1`, [id])).rows[0];

  it("creates a paid sale with items and a receipt number, but no invoice number or invoice link", async () => {
    const before = (await pool.query(`select count(*)::int n from public.business_invoices where not is_direct`)).rows[0].n;
    const pid = await direct(owner, customerId);
    const p = await payment(pid);
    expect(p.receipt_no).toMatch(/^RCP-\d{9}$/);
    expect(Number(p.amount_sen)).toBe(21000);
    const inv = await invoice(p.invoice_id);
    expect([inv.is_direct, inv.invoice_no, inv.status, Number(inv.paid_sen), inv.share_enabled]).toEqual([true, null, "paid", 21000, false]);
    expect(inv.customer_snapshot.name).toBe("Encik Ali");
    expect((await pool.query(`select count(*)::int n from public.business_invoices where not is_direct`)).rows[0].n).toBe(before);
    // the receipt document carries the items; the invoice part cannot be shared or paid again
    const [{ d }] = await asRole<{ d: { invoice: { is_direct: boolean; items: unknown[] }; payment: { balance_after_sen: number } } }>(
      pool, "anon", {}, `select public.public_document($1) as d`, [p.share_token]);
    expect([d.invoice.is_direct, d.invoice.items.length, Number(d.payment.balance_after_sen)]).toEqual([true, 2, 0]);
    expect((await asRole<{ d: unknown }>(pool, "anon", {}, `select public.public_document($1) as d`, [inv.share_token]))[0].d).toBeNull();
    await expect(asUser(pool, owner, `select public.set_document_share('invoice', $1, true, false)`, [inv.id])).rejects.toThrow(/NOT_FOUND/);
    await expect(asUser(pool, owner, `select public.record_invoice_payment($1, 100, current_date, 'cash', null, null, null)`, [inv.id])).rejects.toThrow(/CONFLICT/);
    await expect(pool.query(`update public.business_invoices set is_direct = false where id = $1`, [inv.id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`update public.business_invoice_items set unit_price_sen = 1 where invoice_id = $1`, [inv.id])).rejects.toThrow(/IMMUTABLE_RECORD/);
  });

  it("allows a walk-in customer, is idempotent and validates input", async () => {
    const k = key();
    const pid = await direct(owner, null, items, k);
    expect(await direct(owner, null, items, k)).toBe(pid);
    const inv = await invoice((await payment(pid)).invoice_id);
    expect([inv.customer_id, inv.customer_snapshot.name]).toEqual([null, "Pelanggan Tunai"]);
    await expect(direct(owner, null, [])).rejects.toThrow(/sekurang-kurangnya/);
    await expect(direct(owner, null, [{ description: "Percuma", quantity: 1, unit_price_sen: 0, discount_sen: 0 }])).rejects.toThrow(/sifar/);
    await expect(direct(owner, null, items, key(), "(now() at time zone 'Asia/Kuala_Lumpur')::date + 1") /* the app validates dates in Malaysian time */).rejects.toThrow(/Tarikh/);
    // another member's customer cannot be used
    const third = await createActiveMember(pool, admin, "ketiga@kita.test");
    const [{ id: otherBiz }] = await asUser<{ id: string }>(pool, third, `select public.save_my_business($1) as id`, [{ ...profile, name: "Bisnes Lain" }]);
    const [{ id: otherCust }] = await asUser<{ id: string }>(pool, third,
      `insert into public.business_customers (business_id, name) values ($1, 'Pelanggan Lain') returning id`, [otherBiz]);
    await expect(direct(owner, otherCust)).rejects.toThrow(/Pelanggan tidak dijumpai/);
    expect(await asUser(pool, third, `select * from public.business_payments`)).toHaveLength(0);
  });

  it("reversing a direct-sale receipt cancels the sale and it never reopens", async () => {
    const pid = await direct(owner, customerId);
    await asUser(pool, owner, `select public.reverse_invoice_payment($1, 'Barang dipulangkan')`, [pid]);
    const inv = await invoice((await payment(pid)).invoice_id);
    expect([inv.status, Number(inv.paid_sen)]).toEqual(["cancelled", 0]);
    expect(inv.cancel_reason).toMatch(/dibalikkan/);
    await expect(pool.query(`delete from public.business_payments where id = $1`, [pid])).rejects.toThrow(/IMMUTABLE_RECORD/);
  });

  it("admin totals count received money from direct sales but not as invoices", async () => {
    const [row] = await asUser<{ invoice_count: string; received_sen: string; invoiced_sen: string }>(pool, admin,
      `select * from public.admin_business_overview() where business_id = $1`, [businessId]);
    const received = (await pool.query(`select coalesce(sum(amount_sen), 0)::bigint s from public.business_payments where business_id = $1 and reversed_at is null`, [businessId])).rows[0].s;
    const invoices = (await pool.query(`select count(*)::int n from public.business_invoices where business_id = $1 and not is_direct and status not in ('draft', 'cancelled')`, [businessId])).rows[0].n;
    expect([Number(row.received_sen), Number(row.invoice_count)]).toEqual([Number(received), invoices]);
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
    expect((await asUser(pool, admin, `select * from public.business_profiles`)).length).toBe((await pool.query(`select count(*)::int n from public.business_profiles`)).rows[0].n);
    for (const t of ["business_customers", "business_invoices", "business_invoice_items", "business_payments"]) {
      expect(await asUser(pool, admin, `select * from public.${t}`), t).toHaveLength(0);
    }
    const [row] = await asUser<{ invoice_count: string; received_sen: string }>(pool, admin, `select * from public.admin_business_overview() where business_id = $1`, [businessId]);
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

describe("catalogue and Super Admin sales report", () => {
  it("each member keeps a private catalogue; only the owner can hide or delete items; names are unique", async () => {
    const [{ id }] = await asUser<{ id: string }>(pool, owner,
      `insert into public.business_catalog_items (business_id, name, price_sen) values ($1, 'Ikan 1kg', 2000) returning id`, [businessId]);
    await expect(asUser(pool, owner, `insert into public.business_catalog_items (business_id, name, price_sen) values ($1, ' ikan 1KG ', 2500)`, [businessId]))
      .rejects.toThrow(/duplicate key/);
    await asUser(pool, owner, `update public.business_catalog_items set price_sen = 2200, active = false where id = $1`, [id]);
    expect((await pool.query(`select price_sen, active from public.business_catalog_items where id = $1`, [id])).rows[0]).toEqual({ price_sen: "2200", active: false });
    expect(await asUser(pool, other, `select * from public.business_catalog_items`)).toHaveLength(0);
    expect(await asUser(pool, admin, `select * from public.business_catalog_items`)).toHaveLength(0);
    // only the owner can delete an item (other members and admin delete nothing)
    expect(await asUser(pool, other, `delete from public.business_catalog_items where id = $1 returning id`, [id])).toHaveLength(0);
    expect(await asUser(pool, admin, `delete from public.business_catalog_items where id = $1 returning id`, [id])).toHaveLength(0);
    await expect(asRole(pool, "anon", {}, `delete from public.business_catalog_items where id = $1`, [id])).rejects.toThrow(/permission denied/);
    expect(await asUser(pool, owner, `delete from public.business_catalog_items where id = $1 returning id`, [id])).toHaveLength(1);
    expect((await pool.query(`select count(*)::int n from public.business_catalog_items where id = $1`, [id])).rows[0].n).toBe(0);
    await expect(asUser(pool, other, `insert into public.business_catalog_items (business_id, name, price_sen) values ($1, 'Curi', 1)`, [businessId]))
      .rejects.toThrow(/row-level security/);
    await expect(asRole(pool, "anon", {}, `select * from public.business_catalog_items`)).rejects.toThrow(/permission denied/);
  });

  it("reports sales per business for a date range: invoices + direct sales, money received, open balance", async () => {
    // a fresh business with known figures
    const seller = await createActiveMember(pool, admin, "laporan@kita.test");
    const [{ id: biz }] = await asUser<{ id: string }>(pool, seller, `select public.save_my_business($1) as id`, [{ ...profile, name: "Bisnes Laporan" }]);
    const [{ id: cust }] = await asUser<{ id: string }>(pool, seller,
      `insert into public.business_customers (business_id, name) values ($1, 'Pelanggan') returning id`, [biz]);
    const line = (sen: number) => JSON.stringify([{ description: "Barang", quantity: 1, unit_price_sen: sen, discount_sen: 0 }]);
    const [{ id: inv }] = await asUser<{ id: string }>(pool, seller,
      `select public.save_invoice_draft(null, $1, current_date, current_date + 7, null, $2) as id`, [cust, line(10000)]);
    await asUser(pool, seller, `select public.issue_invoice($1)`, [inv]);
    await asUser(pool, seller, `select public.record_invoice_payment($1, 4000, current_date, 'cash', null, null, null)`, [inv]);
    await asUser(pool, seller, `select public.create_direct_receipt(null, current_date, 'cash', null, null, null, $1, null)`, [line(2500)]);
    const [{ id: old }] = await asUser<{ id: string }>(pool, seller,
      `select public.create_direct_receipt(null, current_date - 40, 'cash', null, null, null, $1, null) as id`, [line(700)]);
    expect(old).toBeTruthy();
    const report = (from: string | null, to: string | null) =>
      asUser<Record<string, string>>(pool, admin, `select * from public.admin_business_report($1, $2) where business_id = $3`, [from, to, biz]).then((r) => r[0]);

    const all = await report(null, null);
    expect([all.invoice_count, all.invoiced_sen, all.direct_count, all.direct_sales_sen, all.total_sales_sen, all.received_sen, all.outstanding_sen].map(Number))
      .toEqual([1, 10000, 2, 3200, 13200, 7200, 6000]);
    const [{ d: since }] = (await pool.query(`select (current_date - 7)::text d`)).rows;
    const recent = await report(since, null);
    expect([recent.direct_sales_sen, recent.total_sales_sen, recent.received_sen, recent.outstanding_sen].map(Number)).toEqual([2500, 12500, 6500, 6000]);
    await expect(asUser(pool, admin, `select * from public.admin_business_report(current_date, current_date - 1)`)).rejects.toThrow(/VALIDATION/);
    await expect(asUser(pool, seller, `select * from public.admin_business_report(null, null)`)).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("quotations (sebut harga)", () => {
  const quoteItems = [
    { description: "Kerja mengecat dinding (meter persegi)", quantity: 420, unit_price_sen: 1800, discount_sen: 0 },
    { description: "Baiki dinding retak (lot)", quantity: 1, unit_price_sen: 165000, discount_sen: 0 },
  ];
  const quoteDraft = (uid: string, id: string | null = null) =>
    asUser<{ id: string }>(pool, uid,
      `select public.save_quote_draft($1, $2, current_date, current_date + 30, 'Mengecat 6 bilik darjah', 'Deposit 30% sebelum kerja', $3) as id`,
      [id, customerId, JSON.stringify(quoteItems)]).then((r) => r[0].id);
  const quote = async (id: string) => (await pool.query(`select * from public.business_quotes where id = $1`, [id])).rows[0];

  it("drafts, sends with a QT number and freezes the quotation", async () => {
    const id = await quoteDraft(owner);
    let q = await quote(id);
    expect([q.status, Number(q.total_sen), q.quote_no]).toEqual(["draft", 921000, null]);
    const [{ no }] = await asUser<{ no: string }>(pool, owner, `select public.send_quote($1) as no`, [id]);
    expect(no).toMatch(/^QT-\d{6}001$/);
    q = await quote(id);
    expect([q.status, q.scope, q.terms]).toEqual(["sent", "Mengecat 6 bilik darjah", "Deposit 30% sebelum kerja"]);
    await expect(quoteDraft(owner, id)).rejects.toThrow(/Hanya draf/);
    await expect(pool.query(`update public.business_quotes set total_sen = 1 where id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`update public.business_quote_items set unit_price_sen = 1 where quote_id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(pool.query(`delete from public.business_quotes where id = $1`, [id])).rejects.toThrow(/IMMUTABLE_RECORD/);
    // the customer link shows the quotation with its scope and terms
    const [{ d }] = await asRole<{ d: { kind: string; invoice: { invoice_no: string; scope: string; items: unknown[] } } }>(
      pool, "anon", {}, `select public.public_document($1) as d`, [q.share_token]);
    expect([d.kind, d.invoice.invoice_no, d.invoice.scope, d.invoice.items.length]).toEqual(["quote", no, "Mengecat 6 bilik darjah", 2]);
  });

  it("records the answer, converts to an invoice draft once, and frees it again if that draft is deleted", async () => {
    const id = await quoteDraft(owner);
    await expect(asUser(pool, owner, `select public.convert_quote_to_invoice($1)`, [id])).rejects.toThrow(/dihantar atau diterima/);
    await asUser(pool, owner, `select public.send_quote($1)`, [id]);
    await asUser(pool, owner, `select public.set_quote_status($1, 'rejected')`, [id]);
    await asUser(pool, owner, `select public.set_quote_status($1, 'accepted')`, [id]);
    const [{ inv }] = await asUser<{ inv: string }>(pool, owner, `select public.convert_quote_to_invoice($1) as inv`, [id]);
    const [{ inv: again }] = await asUser<{ inv: string }>(pool, owner, `select public.convert_quote_to_invoice($1) as inv`, [id]);
    expect(again).toBe(inv);
    const i = await invoice(inv);
    expect([i.status, Number(i.total_sen), i.scope, i.terms, i.quote_id]).toEqual(["draft", 921000, "Mengecat 6 bilik darjah", "Deposit 30% sebelum kerja", id]);
    expect((await pool.query(`select count(*)::int n from public.business_invoice_items where invoice_id = $1`, [inv])).rows[0].n).toBe(2);
    expect([(await quote(id)).status, (await quote(id)).converted_invoice_id]).toEqual(["converted", inv]);
    await expect(asUser(pool, owner, `select public.set_quote_status($1, 'rejected')`, [id])).rejects.toThrow(/tidak boleh diubah/);
    // deleting the invoice draft puts the quotation back to accepted
    await asUser(pool, owner, `select public.delete_invoice_draft($1)`, [inv]);
    expect([(await quote(id)).status, (await quote(id)).converted_invoice_id]).toEqual(["accepted", null]);
    // converted again and issued: scope and terms are frozen with the invoice; a deposit is a partial payment
    const [{ inv: inv2 }] = await asUser<{ inv: string }>(pool, owner, `select public.convert_quote_to_invoice($1) as inv`, [id]);
    await asUser(pool, owner, `select public.issue_invoice($1)`, [inv2]);
    await expect(pool.query(`update public.business_invoices set terms = 'lain' where id = $1`, [inv2])).rejects.toThrow(/IMMUTABLE_RECORD/);
    await asUser(pool, owner, `select public.record_invoice_payment($1, 276300, current_date, 'bank_transfer', 'DEPOSIT', null, null)`, [inv2]);
    expect((await invoice(inv2)).status).toBe("partially_paid");
    const [{ d }] = await asUser<{ d: { invoice: { scope: string; terms: string } } }>(pool, owner, `select public.my_business_document('invoice', $1) as d`, [inv2]);
    expect([d.invoice.scope, d.invoice.terms]).toEqual(["Mengecat 6 bilik darjah", "Deposit 30% sebelum kerja"]);
  });

  it("copies a quotation as a new draft; quotations are private and not counted as sales", async () => {
    const id = await quoteDraft(owner);
    await asUser(pool, owner, `select public.send_quote($1)`, [id]);
    const [{ copy }] = await asUser<{ copy: string }>(pool, owner, `select public.duplicate_quote($1) as copy`, [id]);
    const c = await quote(copy);
    expect([c.status, c.quote_no, Number(c.total_sen), c.scope]).toEqual(["draft", null, 921000, "Mengecat 6 bilik darjah"]);
    await asUser(pool, owner, `select public.delete_quote_draft($1)`, [copy]);
    expect(await quote(copy)).toBeUndefined();
    for (const t of ["business_quotes", "business_quote_items"]) {
      expect(await asUser(pool, other, `select * from public.${t}`), t).toHaveLength(0);
      expect(await asUser(pool, admin, `select * from public.${t}`), t).toHaveLength(0);
    }
    await expect(asUser(pool, other, `select public.my_business_document('quote', $1)`, [id])).rejects.toThrow(/NOT_FOUND/);
    await expect(asUser(pool, other, `select public.send_quote($1)`, [id])).rejects.toThrow();
    // sales report: quotations add nothing until they become invoices
    const before = await asUser<{ total_sales_sen: string }>(pool, admin, `select total_sales_sen from public.admin_business_report(null, null) where business_id = $1`, [businessId]);
    const id2 = await quoteDraft(owner);
    await asUser(pool, owner, `select public.send_quote($1)`, [id2]);
    const after = await asUser<{ total_sales_sen: string }>(pool, admin, `select total_sales_sen from public.admin_business_report(null, null) where business_id = $1`, [businessId]);
    expect(after[0].total_sales_sen).toBe(before[0].total_sales_sen);
  });

  it("keeps default terms on the business profile", async () => {
    await asUser(pool, owner, `select public.save_my_business($1)`, [{ ...profile, default_terms: "Deposit 30%. Baki selepas siap." }]);
    expect((await pool.query(`select default_terms from public.business_profiles where id = $1`, [businessId])).rows[0].default_terms).toBe("Deposit 30%. Baki selepas siap.");
  });
});
