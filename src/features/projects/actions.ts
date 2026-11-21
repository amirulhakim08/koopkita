"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMember, requireAdmin } from "@/lib/auth";
import { fail, type ActionState } from "@/lib/errors";
import { parsePctToBp, parseRMToSen } from "@/lib/format";
import { PROJECT_CATEGORY } from "@/lib/labels";
import { callRpc } from "@/lib/rpc";
import { fieldErrors, moneySchema, pastDateSchema, reasonSchema, receiptPathSchema, transactionRefSchema } from "@/lib/validation";

const trim = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : trim(v));
const optionalMoney = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? parseRMToSen(v) : v),
  z.number({ message: "Jumlah tidak sah" }).int().positive("Jumlah mesti lebih daripada sifar").optional());
const optionalDate = z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarikh tidak sah").optional());
const pct = (msg: string) => z.preprocess((v) => (typeof v === "string" ? parsePctToBp(v) : v),
  z.number({ message: msg }).int().min(0, msg).max(100000, msg));
const optionalPct = (msg: string) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? parsePctToBp(v) : v),
  z.number({ message: msg }).int().min(0, msg).max(100000, msg).optional());
const uuid = z.string().uuid();
const optionalPath = z.preprocess(emptyToUndef, receiptPathSchema.optional());

const ADMIN = ["/admin"];
const projectPaths = (id?: string) => (id ? ["/admin/projek", `/ahli/projek/${id}`, "/ahli/projek", "/ahli/wallet", "/ahli"] : ["/admin/projek", "/ahli"]);

// --------------------------------------------------------------------------- projects

const projectSchema = z
  .object({
    id: z.preprocess(emptyToUndef, uuid.optional()),
    name: z.preprocess(trim, z.string().min(3, "Nama projek diperlukan").max(150)),
    partner: z.preprocess(trim, z.string().min(2, "Organisasi pelaburan diperlukan").max(150)),
    category: z.enum(Object.keys(PROJECT_CATEGORY) as [string, ...string[]], { message: "Sila pilih kategori" }),
    description: z.preprocess(emptyToUndef, z.string().max(4000).optional()),
    risk_disclosure: z.preprocess(emptyToUndef, z.string().max(4000).optional()),
    terms: z.preprocess(emptyToUndef, z.string().max(8000).optional()),
    document_path: optionalPath,
    target: moneySchema,
    min: moneySchema,
    step: moneySchema,
    max_per_member: optionalMoney,
    open_date: optionalDate,
    close_date: optionalDate,
    duration_months: z.preprocess(emptyToUndef, z.coerce.number().int().min(1, "Tempoh tidak sah").max(600, "Tempoh tidak sah").optional()),
    maturity_date: optionalDate,
    coop_threshold: pct("Kadar tidak sah"),
    coop_cap: pct("Kadar tidak sah"),
  })
  .refine((d) => d.min <= d.target, { path: ["min"], message: "Minimum tidak boleh melebihi sasaran" })
  .refine((d) => d.min % d.step === 0, { path: ["min"], message: "Minimum mesti gandaan jumlah gandaan" })
  .refine((d) => d.target % d.step === 0, { path: ["target"], message: "Sasaran mesti gandaan jumlah gandaan supaya boleh dicapai" })
  .refine((d) => d.max_per_member == null || (d.max_per_member >= d.min && d.max_per_member % d.step === 0), {
    path: ["max_per_member"], message: "Had mesti sekurang-kurangnya minimum dan gandaan jumlah gandaan",
  })
  .refine((d) => !d.open_date || !d.close_date || d.close_date >= d.open_date, { path: ["close_date"], message: "Tarikh tutup mesti selepas tarikh buka" });

export async function saveProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  if (typeof raw.new_document_path === "string" && raw.new_document_path) raw.document_path = raw.new_document_path;
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) return fail("Sila semak maklumat projek.", fieldErrors(parsed.error));
  const d = parsed.data;
  const res = await callRpc<string>("save_project", {
    p_id: d.id ?? null,
    p_data: {
      name: d.name, partner: d.partner, category: d.category, description: d.description ?? "", risk_disclosure: d.risk_disclosure ?? "",
      terms: d.terms ?? "", document_path: d.document_path ?? "", target_sen: d.target, min_sen: d.min, step_sen: d.step,
      max_per_member_sen: d.max_per_member ?? "", open_date: d.open_date ?? "", close_date: d.close_date ?? "",
      duration_months: d.duration_months ?? "", maturity_date: d.maturity_date ?? "",
      coop_threshold_bp: d.coop_threshold, coop_cap_bp: d.coop_cap,
    },
  }, { success: "Projek disimpan.", revalidate: projectPaths(d.id) });
  if (!res.ok) return res;
  redirect(`/admin/projek/${res.data}?disimpan=1`);
}

const idOnly = (formData: FormData) => uuid.safeParse(formData.get("id"));

export async function deleteProjectDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = idOnly(formData);
  if (!id.success) return fail("Permintaan tidak sah.");
  const res = await callRpc("delete_project_draft", { p_id: id.data }, { success: "Draf dipadam.", revalidate: ADMIN });
  if (!res.ok) return res;
  redirect("/admin/projek");
}

export async function publishProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = idOnly(formData);
  if (!id.success) return fail("Permintaan tidak sah.");
  return callRpc("publish_project", { p_id: id.data }, { success: "Projek diterbitkan dan dibuka kepada ahli.", revalidate: projectPaths(id.data) });
}

export async function setProjectStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const schema = z.object({ id: uuid, status: z.enum(["open", "full", "completed", "cancelled"]), reason: z.preprocess(emptyToUndef, z.string().max(500).optional()) });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Permintaan tidak sah.", fieldErrors(parsed.error));
  const d = parsed.data;
  if (d.status === "cancelled" && (d.reason?.length ?? 0) < 5) return fail("Sila nyatakan sebab pembatalan.", { reason: ["Sebab diperlukan"] });
  const messages = { open: "Projek dibuka semula.", full: "Penyertaan ditutup.", completed: "Projek ditandakan selesai.", cancelled: "Projek dibatalkan." };
  return callRpc("set_project_status", { p_id: d.id, p_status: d.status, p_reason: d.reason ?? null }, { success: messages[d.status], revalidate: projectPaths(d.id) });
}

export async function recordInvestmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const schema = z.object({ id: uuid, amount: moneySchema, invested_on: pastDateSchema, reference: transactionRefSchema, proof_path: optionalPath });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat pelaburan.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("record_project_investment", {
    p_id: d.id, p_invested_on: d.invested_on, p_amount_sen: d.amount, p_reference: d.reference, p_proof_path: d.proof_path ?? null,
  }, { success: "Pelaburan direkodkan. Projek kini aktif.", revalidate: projectPaths(d.id) });
}

export async function recordMaturityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const schema = z.object({
    id: uuid, matured_on: pastDateSchema,
    capital_received: z.preprocess((v) => (typeof v === "string" ? parseRMToSen(v) : v), z.number({ message: "Jumlah tidak sah" }).int().min(0, "Jumlah tidak sah")),
    reference: z.preprocess(emptyToUndef, z.string().max(100).optional()), proof_path: optionalPath,
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat matang.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("record_project_maturity", {
    p_id: d.id, p_matured_on: d.matured_on, p_capital_received_sen: d.capital_received, p_reference: d.reference ?? null, p_proof_path: d.proof_path ?? null,
  }, { success: "Projek ditandakan matang.", revalidate: projectPaths(d.id) });
}

export async function reviewParticipationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = idOnly(formData);
  if (!id.success) return fail("Permintaan tidak sah.");
  const approve = formData.get("decision") === "approve";
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  if (!approve && !notes) return fail("Sila nyatakan sebab penolakan.", { notes: ["Sebab diperlukan"] });
  return callRpc("review_project_participation", { p_id: id.data, p_approve: approve, p_notes: notes }, {
    success: approve ? "Bayaran diluluskan sebagai modal." : "Bayaran ditolak.", revalidate: ADMIN,
  });
}

// --------------------------------------------------------------------------- profit declarations

const declarationSchema = z
  .object({
    id: z.preprocess(emptyToUndef, uuid.optional()),
    project_id: uuid,
    period_label: z.preprocess(trim, z.string().min(2, "Tempoh diperlukan (cth. Tahun 2027)").max(60)),
    period_start: optionalDate,
    period_end: optionalDate,
    announced_on: pastDateSchema,
    rate: pct("Kadar keuntungan tidak sah"),
    gross: z.preprocess((v) => (typeof v === "string" ? parseRMToSen(v) : v), z.number({ message: "Jumlah tidak sah" }).int().min(0, "Jumlah tidak sah")),
    fee: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? 0 : typeof v === "string" ? parseRMToSen(v) : v),
      z.number({ message: "Jumlah tidak sah" }).int().min(0, "Jumlah tidak sah")),
    fee_description: z.preprocess(emptyToUndef, z.string().max(200).optional()),
    coop_rate: optionalPct("Kadar tidak sah"),
    document_path: optionalPath,
    notes: z.preprocess(emptyToUndef, z.string().max(1000).optional()),
  })
  .refine((d) => d.fee <= d.gross, { path: ["fee"], message: "Potongan tidak boleh melebihi keuntungan" })
  .refine((d) => d.fee === 0 || (d.fee_description?.length ?? 0) >= 3, { path: ["fee_description"], message: "Nyatakan jenis potongan" })
  .refine((d) => d.coop_rate == null || d.coop_rate <= d.rate, { path: ["coop_rate"], message: "Tidak boleh melebihi kadar keuntungan" });

export async function saveDeclarationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  if (typeof raw.new_document_path === "string" && raw.new_document_path) raw.document_path = raw.new_document_path;
  const parsed = declarationSchema.safeParse(raw);
  if (!parsed.success) return fail("Sila semak maklumat keuntungan.", fieldErrors(parsed.error));
  const d = parsed.data;
  const res = await callRpc<string>("save_profit_declaration", {
    p_id: d.id ?? null, p_project_id: d.project_id,
    p_data: {
      period_label: d.period_label, period_start: d.period_start ?? "", period_end: d.period_end ?? "", announced_on: d.announced_on,
      rate_bp: d.rate, gross_sen: d.gross, fee_sen: d.fee, fee_description: d.fee_description ?? "",
      coop_rate_bp: d.coop_rate ?? "", document_path: d.document_path ?? "", notes: d.notes ?? "",
    },
  }, { success: "Draf pengumuman disimpan. Semak agihan sebelum mengesahkan.", revalidate: ADMIN });
  if (!res.ok) return res;
  redirect(`/admin/projek/${d.project_id}/keuntungan/${res.data}`);
}

export async function deleteDeclarationDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, project_id: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Permintaan tidak sah.");
  const res = await callRpc("delete_profit_declaration_draft", { p_id: parsed.data.id }, { success: "Draf dipadam.", revalidate: ADMIN });
  if (!res.ok) return res;
  redirect(`/admin/projek/${parsed.data.project_id}?tab=keuntungan`);
}

export async function confirmDeclarationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const schema = z.object({ id: uuid, project_id: uuid, received: z.enum(["ya", "belum"]), received_on: optionalDate });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Permintaan tidak sah.", fieldErrors(parsed.error));
  const d = parsed.data;
  if (d.received === "ya" && !d.received_on) return fail("Sila isi tarikh wang diterima.", { received_on: ["Tarikh diperlukan"] });
  return callRpc("confirm_profit_declaration", { p_id: d.id, p_received_on: d.received === "ya" ? d.received_on : null }, {
    success: d.received === "ya" ? "Keuntungan disahkan. Dividen ahli kini tersedia untuk pengeluaran." : "Keuntungan disahkan. Tandakan wang diterima apabila koperasi menerimanya.",
    revalidate: projectPaths(d.project_id),
  });
}

export async function markProfitReceivedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, project_id: uuid, received_on: pastDateSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila isi tarikh wang diterima.", fieldErrors(parsed.error));
  return callRpc("mark_profit_received", { p_id: parsed.data.id, p_received_on: parsed.data.received_on }, {
    success: "Wang diterima. Dividen ahli kini tersedia untuk pengeluaran.", revalidate: projectPaths(parsed.data.project_id),
  });
}

export async function voidDeclarationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, project_id: uuid, reason: reasonSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila nyatakan sebab pembatalan.", fieldErrors(parsed.error));
  return callRpc("void_profit_declaration", { p_id: parsed.data.id, p_reason: parsed.data.reason }, {
    success: "Pengumuman dibatalkan.", revalidate: projectPaths(parsed.data.project_id),
  });
}

// --------------------------------------------------------------------------- capital returns

export async function recordCapitalReturnsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const schema = z.object({
    project_id: uuid, kind: z.enum(["return", "refund"]), paid_on: pastDateSchema,
    reference: z.preprocess(trim, z.string().min(2, "Rujukan diperlukan").max(100)), proof_path: optionalPath,
    notes: z.preprocess(emptyToUndef, z.string().max(500).optional()),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat pemulangan.", fieldErrors(parsed.error));
  const items: { member_id: string; amount_sen: number }[] = [];
  for (const [k, v] of formData.entries()) {
    const m = /^amount_([0-9a-f-]{36})$/.exec(k);
    if (!m || typeof v !== "string" || v.trim() === "") continue;
    const sen = parseRMToSen(v);
    if (sen == null) return fail("Jumlah tidak sah.", { [k]: ["Jumlah tidak sah"] });
    if (sen > 0) items.push({ member_id: m[1], amount_sen: sen });
  }
  if (!items.length) return fail("Sila masukkan jumlah untuk sekurang-kurangnya seorang ahli.");
  const d = parsed.data;
  return callRpc("record_capital_returns", {
    p_project_id: d.project_id, p_kind: d.kind, p_paid_on: d.paid_on, p_transaction_ref: d.reference, p_proof_path: d.proof_path ?? null,
    p_notes: d.notes ?? null, p_items: items,
  }, { success: `${items.length} rekod ${d.kind === "refund" ? "bayaran balik" : "pemulangan modal"} disimpan.`, revalidate: projectPaths(d.project_id) });
}

export async function reverseCapitalReturnAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, project_id: uuid, reason: reasonSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila nyatakan sebab pembalikan.", fieldErrors(parsed.error));
  return callRpc("reverse_capital_return", { p_id: parsed.data.id, p_reason: parsed.data.reason }, {
    success: "Rekod dibalikkan.", revalidate: projectPaths(parsed.data.project_id),
  });
}

// --------------------------------------------------------------------------- withdrawals (admin)

export async function reviewWithdrawalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = idOnly(formData);
  if (!id.success) return fail("Permintaan tidak sah.");
  const approve = formData.get("decision") === "approve";
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  if (!approve && (notes?.length ?? 0) < 3) return fail("Sila nyatakan sebab penolakan.", { notes: ["Sebab diperlukan"] });
  return callRpc("review_dividend_withdrawal", { p_id: id.data, p_approve: approve, p_notes: notes }, {
    success: approve ? "Permohonan diluluskan. Maklumkan Bendahari untuk pindahan." : "Permohonan ditolak. Jumlah dikembalikan ke baki ahli.",
    revalidate: ["/admin", "/ahli/wallet"],
  });
}

export async function recordWithdrawalPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const schema = z.object({ id: uuid, paid_on: pastDateSchema, reference: transactionRefSchema, proof_path: receiptPathSchema });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila lengkapkan maklumat pindahan dan resit Bendahari.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("record_withdrawal_payment", { p_id: d.id, p_paid_on: d.paid_on, p_transaction_ref: d.reference, p_proof_path: d.proof_path }, {
    success: "Bayaran direkodkan. Ahli telah dimaklumkan.", revalidate: ["/admin", "/ahli/wallet"],
  });
}

// --------------------------------------------------------------------------- member

export async function joinProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const schema = z.object({
    project_id: uuid, terms_version: z.coerce.number().int().min(1), amount: moneySchema, payment_date: pastDateSchema,
    transaction_ref: transactionRefSchema, receipt_path: receiptPathSchema, idempotency_key: uuid,
    accept_terms: z.literal("on", { message: "Sila baca dan setuju dengan terma serta risiko projek" }),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat penyertaan.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("join_project", {
    p_project_id: d.project_id, p_amount_sen: d.amount, p_payment_date: d.payment_date, p_transaction_ref: d.transaction_ref,
    p_receipt_path: d.receipt_path, p_terms_version: d.terms_version, p_idempotency_key: d.idempotency_key,
  }, { success: "Bukti bayaran dihantar. Status: Menunggu Pengesahan.", revalidate: projectPaths(d.project_id) });
}

export async function requestWithdrawalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const schema = z.object({
    project_id: uuid, amount: moneySchema, notes: z.preprocess(emptyToUndef, z.string().max(500).optional()), idempotency_key: uuid,
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak jumlah pengeluaran.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("request_dividend_withdrawal", { p_project_id: d.project_id, p_amount_sen: d.amount, p_notes: d.notes ?? null, p_idempotency_key: d.idempotency_key }, {
    success: "Permohonan pengeluaran dihantar. Status: Menunggu Semakan.", revalidate: projectPaths(d.project_id),
  });
}

export async function cancelWithdrawalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const id = idOnly(formData);
  if (!id.success) return fail("Permintaan tidak sah.");
  return callRpc("cancel_dividend_withdrawal", { p_id: id.data }, { success: "Permohonan dibatalkan.", revalidate: ["/ahli"] });
}
