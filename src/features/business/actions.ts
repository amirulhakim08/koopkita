"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveMember } from "@/lib/auth";
import { fail, parseDbError, type ActionState } from "@/lib/errors";
import { fieldErrors, moneySchema, pastDateSchema, phoneSchema, reasonSchema, receiptPathSchema } from "@/lib/validation";
import { callRpc } from "@/lib/rpc";
import { parseRMToSen } from "@/lib/format";
import { findByPhone } from "./customer-match";

const trim = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : trim(v));
const uuid = z.string().uuid();

// ---------------------------------------------------------------- profile
const businessSchema = z
  .object({
    name: z.preprocess(trim, z.string().min(2, "Nama syarikat diperlukan").max(150)),
    ssm_no: z.preprocess(
      (v) => (typeof v === "string" ? v.replace(/\s/g, "").toUpperCase() || undefined : v),
      z.string().regex(/^([0-9]{12}|[A-Z]{0,3}[0-9]{4,10}-?[A-Z])$/, "Format SSM tidak sah (cth. 202403123456 atau 1234567-X)").optional(),
    ),
    phone: phoneSchema,
    email: z.preprocess(emptyToUndef, z.email("E-mel tidak sah").optional()),
    address: z.preprocess(emptyToUndef, z.string().max(500).optional()),
    bank_name: z.preprocess(emptyToUndef, z.string().max(100).optional()),
    bank_account_no: z.preprocess(
      (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") || undefined : v),
      z.string().regex(/^[0-9]{6,20}$/, "Nombor akaun mesti 6–20 digit").optional(),
    ),
    bank_account_holder: z.preprocess(emptyToUndef, z.string().max(150).optional()),
    logo_path: z.preprocess(emptyToUndef, z.string().regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}\.(png|jpe?g)$/i).optional()),
    sst_enabled: z.preprocess((v) => v === "on" || v === true, z.boolean()),
    sst_rate: z.preprocess(emptyToUndef, z.coerce.number().min(0.01, "Kadar SST tidak sah").max(25).optional()),
    sst_reg_no: z.preprocess(emptyToUndef, z.string().max(50).optional()),
    default_notes: z.preprocess(emptyToUndef, z.string().max(1000).optional()),
  })
  .refine((d) => !d.sst_enabled || d.sst_rate, { path: ["sst_rate"], message: "Nyatakan kadar SST (%)" });

export async function saveBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const parsed = businessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat bisnes.", fieldErrors(parsed.error));
  const { sst_rate, ...d } = parsed.data;
  return callRpc("save_my_business", {
    p_data: { ...d, sst_rate_bp: d.sst_enabled && sst_rate ? Math.round(sst_rate * 100) : 0 },
  }, { success: "Profil bisnes disimpan.", revalidate: ["/ahli/bisnes"] });
}

// ---------------------------------------------------------------- customers
const customerSchema = z.object({
  id: z.preprocess(emptyToUndef, uuid.optional()),
  name: z.preprocess(trim, z.string().min(2, "Nama pelanggan diperlukan").max(150)),
  phone: z.preprocess((v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") || undefined : v), z.string().regex(/^\+?[0-9]{9,15}$/, "Nombor telefon tidak sah").optional()),
  email: z.preprocess(emptyToUndef, z.email("E-mel tidak sah").optional()),
  address: z.preprocess(emptyToUndef, z.string().max(500).optional()),
});

async function myBusinessId(): Promise<string | null> {
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  const { data } = await supabase.from("business_profiles").select("id").eq("owner_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function saveCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const businessId = await myBusinessId();
  if (!businessId) return fail("Sila lengkapkan Profil Bisnes dahulu.");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat pelanggan.", fieldErrors(parsed.error));
  const { id, ...d } = parsed.data;
  const row = { name: d.name, phone: d.phone ?? null, email: d.email ?? null, address: d.address ?? null };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("business_customers").update(row).eq("id", id).select("id").single()
    : await supabase.from("business_customers").insert({ ...row, business_id: businessId }).select("id").single();
  if (error) return fail(parseDbError(error).code === "FORBIDDEN" ? "Modul Bisnes anda digantung." : "Pelanggan tidak dapat disimpan.");
  revalidatePath("/ahli/bisnes", "layout");
  return { ok: true, message: id ? "Pelanggan dikemas kini." : "Pelanggan ditambah.", data: data.id };
}

export async function deleteCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const supabase = await createClient();
  const { error } = await supabase.from("business_customers").delete().eq("id", id.data);
  if (error) return fail(error.code === "23503" ? "Pelanggan ini mempunyai invois dan tidak boleh dipadam." : "Pelanggan tidak dapat dipadam.");
  revalidatePath("/ahli/bisnes", "layout");
  return { ok: true, message: "Pelanggan dipadam." };
}

// ---------------------------------------------------------------- catalogue
const catalogSchema = z.object({
  id: z.preprocess(emptyToUndef, uuid.optional()),
  name: z.preprocess(trim, z.string().min(1, "Nama produk / servis diperlukan").max(300)),
  price: z.preprocess((v) => (typeof v === "string" ? parseRMToSen(v || "") : v), z.number({ message: "Harga tidak sah" }).int().min(0, "Harga tidak sah")),
});

export async function saveCatalogItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const businessId = await myBusinessId();
  if (!businessId) return fail("Sila lengkapkan Profil Bisnes dahulu.");
  const parsed = catalogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak item katalog.", fieldErrors(parsed.error));
  const { id, name, price } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("business_catalog_items").update({ name, price_sen: price }).eq("id", id)
    : await supabase.from("business_catalog_items").insert({ business_id: businessId, name, price_sen: price });
  if (error) return fail(error.code === "23505" ? "Nama ini sudah ada dalam katalog." : "Item katalog tidak dapat disimpan.");
  revalidatePath("/ahli/bisnes", "layout");
  return { ok: true, message: id ? "Item katalog dikemas kini." : "Item ditambah ke katalog." };
}

export async function setCatalogActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const active = formData.get("active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("business_catalog_items").update({ active }).eq("id", id.data);
  if (error) return fail("Item katalog tidak dapat dikemas kini.");
  revalidatePath("/ahli/bisnes", "layout");
  return { ok: true, message: active ? "Item dipaparkan semula." : "Item disembunyikan daripada pilihan." };
}

// ---------------------------------------------------------------- invoices
const itemSchema = z.object({
  description: z.preprocess(trim, z.string().min(1, "Perkara diperlukan").max(300)),
  quantity: z.coerce.number({ message: "Unit tidak sah" }).positive("Unit mesti lebih daripada 0").max(1_000_000),
  unit_price: z.preprocess((v) => (typeof v === "string" ? parseRMToSen(v || "0") : v), z.number({ message: "Harga tidak sah" }).int().min(0)),
  discount: z.preprocess((v) => (typeof v === "string" ? parseRMToSen(v || "0") : v), z.number({ message: "Diskaun tidak sah" }).int().min(0)),
});

const draftSchema = z.object({
  id: z.preprocess(emptyToUndef, uuid.optional()),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarikh tidak sah"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarikh tidak sah"),
  notes: z.preprocess(emptyToUndef, z.string().max(1000).optional()),
  items: z.array(itemSchema).min(1, "Tambah sekurang-kurangnya satu item").max(100),
  intent: z.enum(["save", "issue"]),
}).refine((d) => d.due_date >= d.issue_date, { path: ["due_date"], message: "Tarikh akhir mesti selepas tarikh invois" });

type ParsedItem = z.infer<typeof itemSchema>;

/** Rows items.N.* posted by LineItemsCard (blank rows are ignored). */
function postedItems(formData: FormData) {
  const count = Number(formData.get("item_count") ?? 0);
  return Array.from({ length: Math.min(Math.max(count, 0), 100) }, (_, i) => ({
    description: formData.get(`items.${i}.description`), quantity: formData.get(`items.${i}.quantity`),
    unit_price: formData.get(`items.${i}.unit_price`), discount: formData.get(`items.${i}.discount`),
    save_catalog: formData.get(`items.${i}.save_catalog`) === "on",
  })).filter((it) => String(it.description ?? "").trim() !== "" || String(it.unit_price ?? "").trim() !== "");
}

/** Lines the member ticked "Simpan ke katalog" for: added to the catalogue unless the name is already there. */
async function saveLinesToCatalog(formData: FormData) {
  const wanted = postedItems(formData).filter((it) => it.save_catalog);
  if (!wanted.length) return;
  const businessId = await myBusinessId();
  if (!businessId) return;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("business_catalog_items").select("name").eq("business_id", businessId);
  const taken = new Set((existing ?? []).map((c) => c.name.trim().toLowerCase()));
  const rows: { business_id: string; name: string; price_sen: number }[] = [];
  for (const it of wanted) {
    const name = String(it.description ?? "").trim();
    const price = parseRMToSen(String(it.unit_price ?? "") || "0");
    if (!name || name.length > 300 || price === null || price < 0 || taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    rows.push({ business_id: businessId, name, price_sen: price });
  }
  if (rows.length) await supabase.from("business_catalog_items").insert(rows);
}

function itemsForRpc(items: ParsedItem[]): { error?: string; rows: { description: string; quantity: number; unit_price_sen: number; discount_sen: number }[] } {
  for (const [i, it] of items.entries()) {
    if (it.discount > Math.round(it.quantity * it.unit_price)) return { error: `Diskaun item ${i + 1} melebihi jumlah item.`, rows: [] };
  }
  return { rows: items.map((it) => ({ description: it.description, quantity: it.quantity, unit_price_sen: it.unit_price, discount_sen: it.discount })) };
}

const newCustomerSchema = z.object({
  name: z.preprocess(trim, z.string().min(2, "Nama pelanggan diperlukan").max(150)),
  phone: z.preprocess((v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") || undefined : v), z.string().regex(/^\+?[0-9]{9,15}$/, "Nombor telefon tidak sah").optional()),
});

/**
 * The customer chosen in CustomerPicker: an existing one, a new one (saved now; a customer
 * with the same phone number is reused), or none for a walk-in sale.
 */
async function resolveCustomer(formData: FormData, allowWalkIn: boolean): Promise<{ id: string | null } | { error: ActionState }> {
  const mode = formData.get("customer_mode");
  if (mode === "walkin" && allowWalkIn) return { id: null };
  if (mode === "existing") {
    const id = uuid.safeParse(formData.get("customer_id"));
    if (id.success) return { id: id.data };
  }
  if (mode !== "new") return { error: fail("Sila pilih pelanggan.", { customer: ["Sila pilih atau tambah pelanggan"] }) };

  const parsed = newCustomerSchema.safeParse({ name: formData.get("customer_name"), phone: formData.get("customer_phone") });
  if (!parsed.success) {
    const fe = fieldErrors(parsed.error);
    return { error: fail("Sila semak maklumat pelanggan.", { customer_name: fe.name ?? [], customer_phone: fe.phone ?? [] }) };
  }
  const businessId = await myBusinessId();
  if (!businessId) return { error: fail("Sila lengkapkan Profil Bisnes dahulu.") };
  const supabase = await createClient();
  // reuse a customer with the same phone number (or, without a number, the same name and no number),
  // so a retried submission or a typed-in regular customer does not create a duplicate
  const { data: existing } = await supabase.from("business_customers").select("id, name, phone").eq("business_id", businessId);
  const name = parsed.data.name.toLowerCase();
  const same = parsed.data.phone
    ? findByPhone(existing ?? [], parsed.data.phone)
    : (existing ?? []).find((c) => !c.phone && c.name.trim().toLowerCase() === name);
  if (same) return { id: same.id };
  const { data, error } = await supabase.from("business_customers")
    .insert({ business_id: businessId, name: parsed.data.name, phone: parsed.data.phone ?? null }).select("id").single();
  if (error) return { error: fail("Pelanggan tidak dapat disimpan.") };
  revalidatePath("/ahli/bisnes", "layout");
  return { id: data.id };
}

export async function saveInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const parsed = draftSchema.safeParse({ ...Object.fromEntries(formData), items: postedItems(formData), intent: formData.get("intent") ?? "save" });
  if (!parsed.success) return fail("Sila semak invois.", fieldErrors(parsed.error));
  const d = parsed.data;
  const items = itemsForRpc(d.items);
  if (items.error) return fail(items.error);
  const customer = await resolveCustomer(formData, false);
  if ("error" in customer) return customer.error;
  const saved = await callRpc<string>("save_invoice_draft", {
    p_id: d.id ?? null, p_customer_id: customer.id, p_issue_date: d.issue_date, p_due_date: d.due_date, p_notes: d.notes ?? null,
    p_items: items.rows,
  }, { success: "Draf disimpan.", revalidate: ["/ahli/bisnes"] });
  if (!saved?.ok) return saved;
  await saveLinesToCatalog(formData);
  if (d.intent === "issue") {
    const issued = await callRpc<string>("issue_invoice", { p_id: saved.data }, { success: "Invois dikeluarkan.", revalidate: ["/ahli/bisnes"] });
    if (!issued?.ok) return issued;
  }
  redirect(`/ahli/bisnes/invois/${saved.data}${d.intent === "issue" ? "?dikeluarkan=1" : ""}`);
}

const directSchema = z.object({
  paid_on: pastDateSchema,
  method: z.enum(["bank_transfer", "duitnow", "cash", "card", "cheque", "other"]),
  reference: z.preprocess(emptyToUndef, z.string().max(100).optional()),
  proof_path: z.preprocess(emptyToUndef, receiptPathSchema.optional()),
  notes: z.preprocess(emptyToUndef, z.string().max(1000).optional()),
  items: z.array(itemSchema).min(1, "Tambah sekurang-kurangnya satu item").max(100),
  idempotency_key: uuid,
});

/** Resit Jualan Langsung: a receipt for a sale paid on the spot, without an invoice. */
export async function createDirectReceiptAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const parsed = directSchema.safeParse({ ...Object.fromEntries(formData), items: postedItems(formData) });
  if (!parsed.success) return fail("Sila semak resit.", fieldErrors(parsed.error));
  const d = parsed.data;
  const items = itemsForRpc(d.items);
  if (items.error) return fail(items.error);
  const customer = await resolveCustomer(formData, true);
  if ("error" in customer) return customer.error;
  const res = await callRpc<string>("create_direct_receipt", {
    p_customer_id: customer.id, p_paid_on: d.paid_on, p_method: d.method, p_reference: d.reference ?? null,
    p_proof_path: d.proof_path ?? null, p_notes: d.notes ?? null, p_items: items.rows, p_idempotency_key: d.idempotency_key,
  }, { success: "Resit dijana.", revalidate: ["/ahli/bisnes"] });
  if (!res?.ok) return res;
  await saveLinesToCatalog(formData);
  redirect(`/ahli/bisnes/resit/${res.data}?dijana=1`);
}

export async function deleteDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const res = await callRpc("delete_invoice_draft", { p_id: id.data }, { success: "Draf dipadam.", revalidate: ["/ahli/bisnes"] });
  if (!res?.ok) return res;
  redirect("/ahli/bisnes");
}

export async function cancelInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("id"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!id.success) return fail("Permintaan tidak sah.");
  if (!reason.success) return fail("Sila nyatakan sebab pembatalan.", { reason: ["Sebab diperlukan"] });
  return callRpc("cancel_invoice", { p_id: id.data, p_reason: reason.data }, { success: "Invois dibatalkan.", revalidate: ["/ahli/bisnes"] });
}

// ---------------------------------------------------------------- payments / receipts
const paymentSchema = z.object({
  invoice_id: uuid,
  amount: moneySchema,
  paid_on: pastDateSchema,
  method: z.enum(["bank_transfer", "duitnow", "cash", "card", "cheque", "other"]),
  reference: z.preprocess(emptyToUndef, z.string().max(100).optional()),
  proof_path: z.preprocess(emptyToUndef, receiptPathSchema.optional()),
  idempotency_key: uuid,
});

export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat bayaran.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("record_invoice_payment", {
    p_invoice_id: d.invoice_id, p_amount_sen: d.amount, p_paid_on: d.paid_on, p_method: d.method,
    p_reference: d.reference ?? null, p_proof_path: d.proof_path ?? null, p_idempotency_key: d.idempotency_key,
  }, { success: "Bayaran direkodkan dan resit dijana.", revalidate: ["/ahli/bisnes"] });
}

export async function reversePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("id"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!id.success) return fail("Permintaan tidak sah.");
  if (!reason.success) return fail("Sila nyatakan sebab pembalikan.", { reason: ["Sebab diperlukan"] });
  return callRpc("reverse_invoice_payment", { p_payment_id: id.data, p_reason: reason.data }, { success: "Resit dibalikkan.", revalidate: ["/ahli/bisnes"] });
}

export async function setShareAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const kind = z.enum(["invoice", "receipt"]).safeParse(formData.get("kind"));
  const id = uuid.safeParse(formData.get("id"));
  if (!kind.success || !id.success) return fail("Permintaan tidak sah.");
  const mode = formData.get("mode");
  return callRpc("set_document_share", {
    p_kind: kind.data, p_id: id.data, p_enabled: mode !== "disable", p_regenerate: mode === "regenerate",
  }, {
    success: mode === "disable" ? "Pautan dimatikan." : mode === "regenerate" ? "Pautan baharu dijana; pautan lama tidak lagi berfungsi." : "Pautan diaktifkan.",
    revalidate: ["/ahli/bisnes"],
  });
}

// ---------------------------------------------------------------- Super Admin
export async function adminVerifyBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const verify = formData.get("verify") === "true";
  return callRpc("admin_set_business_verified", { p_business_id: id.data, p_verified: verify }, {
    success: verify ? "SSM disahkan." : "Pengesahan SSM ditarik balik.", revalidate: ["/admin/bisnes"],
  });
}

export async function adminSuspendBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const suspend = formData.get("suspend") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  if (suspend && reason.length < 3) return fail("Sila nyatakan sebab penggantungan.");
  return callRpc("admin_set_business_suspended", { p_business_id: id.data, p_suspend: suspend, p_reason: suspend ? reason : null }, {
    success: suspend ? "Modul Bisnes ahli digantung." : "Modul Bisnes ahli diaktifkan semula.", revalidate: ["/admin/bisnes"],
  });
}
