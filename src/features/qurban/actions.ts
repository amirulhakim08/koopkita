"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth";
import { fail, type ActionState } from "@/lib/errors";
import { campaignSchema, fieldErrors, reasonSchema, salePaymentSchema, saleSchema } from "@/lib/validation";
import { callRpc } from "@/lib/rpc";

export async function createSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const shareCount = Number(formData.get("share_count") ?? 0);
  const participants = Array.from({ length: Math.min(Math.max(shareCount, 0), 70) }, (_, i) => ({
    participant_name: formData.get(`participants.${i}.participant_name`),
    qurban_type: formData.get(`participants.${i}.qurban_type`) || undefined,
    on_behalf_of: formData.get(`participants.${i}.on_behalf_of`),
  }));
  const parsed = saleSchema.safeParse({ ...Object.fromEntries(formData), participants });
  if (!parsed.success) return fail("Sila semak maklumat jualan.", fieldErrors(parsed.error));
  const d = parsed.data;
  const res = await callRpc<string>("create_qurban_sale", {
    p_campaign_id: d.campaign_id,
    p_share_count: d.share_count,
    p_buyer: { full_name: d.buyer_full_name, phone: d.buyer_phone, email: d.buyer_email ?? null, address: d.buyer_address ?? null },
    p_participants: d.participants,
    p_notes: d.notes ?? null,
    p_idempotency_key: d.idempotency_key,
  }, { success: "Slot korban telah ditempah.", revalidate: ["/ahli"] });
  if (!res?.ok) return res;
  redirect(`/ahli/korban/jualan/${res.data}?baru=1`);
}

export async function submitSalePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const parsed = salePaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat bayaran.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("submit_sale_payment", {
    p_sale_id: d.sale_id, p_amount_sen: d.amount, p_payment_date: d.payment_date, p_transaction_ref: d.transaction_ref,
    p_receipt_path: d.receipt_path, p_idempotency_key: d.idempotency_key,
  }, { success: "Bukti bayaran dihantar untuk semakan.", revalidate: ["/ahli", "/admin"] });
}

export async function cancelSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("sale_id"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!id.success) return fail("Permintaan tidak sah.");
  if (!reason.success) return fail("Sila nyatakan sebab pembatalan.", { reason: ["Sebab diperlukan"] });
  return callRpc("cancel_qurban_sale", { p_sale_id: id.data, p_reason: reason.data }, {
    success: "Jualan dibatalkan.", revalidate: ["/ahli", "/admin"],
  });
}

// ---------------- Super Admin ----------------

export async function saveCampaignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat kempen.", fieldErrors(parsed.error));
  const d = parsed.data;
  const res = await callRpc<string>("save_campaign", {
    p_id: d.id ?? null, p_name: d.name, p_year: d.year, p_start_date: d.start_date, p_closing_date: d.closing_date,
    p_price_per_share_sen: d.price_per_share, p_commission_per_share_sen: d.commission_per_share,
    p_full_cattle_commission_sen: d.full_cattle_commission, p_reservation_expiry_hours: d.reservation_expiry_hours,
    p_description: d.description ?? null,
  }, { success: "Kempen disimpan.", revalidate: ["/admin/kempen"] });
  if (res?.ok && !d.id) redirect(`/admin/kempen/${res.data}`);
  return res;
}

export async function setCampaignStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const status = z.enum(["draft", "open", "closed", "completed"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) return fail("Permintaan tidak sah.");
  return callRpc("set_campaign_status", { p_id: id.data, p_status: status.data }, {
    success: "Status kempen dikemas kini.", revalidate: ["/admin/kempen", "/ahli"],
  });
}

export async function addCattleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({
    campaign_id: z.string().uuid(),
    count: z.coerce.number().int().min(1, "Minimum 1").max(200, "Maksimum 200"),
    notes: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(500).optional()),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat.", fieldErrors(parsed.error));
  return callRpc("add_cattle", { p_campaign_id: parsed.data.campaign_id, p_count: parsed.data.count, p_notes: parsed.data.notes ?? null }, {
    success: `${parsed.data.count} ekor lembu ditambah.`, revalidate: ["/admin/kempen"],
  });
}

export async function updateCattleNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("cattle_id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  return callRpc("update_cattle_notes", { p_cattle_id: id.data, p_notes: String(formData.get("notes") ?? "").slice(0, 500) }, {
    success: "Catatan dikemas kini.", revalidate: ["/admin/kempen"],
  });
}

export async function setSlotCancelledAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("slot_id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const cancelled = formData.get("cancelled") === "true";
  return callRpc("set_slot_cancelled", { p_slot_id: id.data, p_cancelled: cancelled }, {
    success: cancelled ? "Slot dibatalkan." : "Slot dipulihkan.", revalidate: ["/admin/kempen"],
  });
}

export async function reviewSalePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("payment_id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const verify = formData.get("decision") === "verify";
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  if (!verify && !notes) return fail("Sila nyatakan sebab penolakan.", { notes: ["Sebab diperlukan"] });
  return callRpc("review_sale_payment", { p_payment_id: id.data, p_verify: verify, p_notes: notes }, {
    success: verify ? "Bayaran disahkan." : "Bayaran ditolak.", revalidate: ["/admin/jualan"],
  });
}

export async function approveSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("sale_id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  return callRpc("approve_qurban_sale", { p_sale_id: id.data, p_notes: (formData.get("notes") as string)?.trim() || null }, {
    success: "Jualan diluluskan dan komisen dijana.", revalidate: ["/admin"],
  });
}

export async function rejectSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("sale_id"));
  const notes = reasonSchema.safeParse(formData.get("notes"));
  if (!id.success) return fail("Permintaan tidak sah.");
  if (!notes.success) return fail("Sila nyatakan sebab penolakan.", { notes: ["Sebab diperlukan"] });
  return callRpc("reject_qurban_sale", { p_sale_id: id.data, p_notes: notes.data }, { success: "Jualan ditolak.", revalidate: ["/admin"] });
}

export async function reassignSlotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const p = z.string().uuid().safeParse(formData.get("participant_id"));
  const t = z.string().uuid().safeParse(formData.get("target_slot_id"));
  if (!p.success || !t.success) return fail("Sila pilih slot sasaran.");
  return callRpc("admin_reassign_slot", { p_participant_id: p.data, p_target_slot_id: t.data }, {
    success: "Slot dipindahkan.", revalidate: ["/admin"],
  });
}

export async function expireReservationsAction(): Promise<ActionState> {
  return callRpc<number>("expire_stale_reservations", {}, { success: "Tempahan tamat tempoh telah diproses.", revalidate: ["/admin"] });
}
