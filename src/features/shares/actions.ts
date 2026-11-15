"use server";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth";
import { fail, type ActionState } from "@/lib/errors";
import { fieldErrors, moneySchema, reasonSchema, sharePaymentSchema } from "@/lib/validation";
import { callRpc } from "@/lib/rpc";

export async function submitSharePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireActiveMember();
  const parsed = sharePaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat bayaran.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("submit_share_payment", {
    p_amount_sen: d.amount, p_payment_date: d.payment_date, p_transaction_ref: d.transaction_ref,
    p_receipt_path: d.receipt_path, p_idempotency_key: d.idempotency_key,
  }, { success: "Bayaran saham dihantar untuk semakan.", revalidate: ["/ahli"] });
}

export async function reviewSharePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const approve = formData.get("decision") === "approve";
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  if (!approve && !notes) return fail("Sila nyatakan sebab penolakan.", { notes: ["Sebab diperlukan"] });
  return callRpc("review_share_payment", { p_id: id.data, p_approve: approve, p_notes: notes }, {
    success: approve ? "Bayaran saham diluluskan." : "Bayaran saham ditolak.", revalidate: ["/admin"],
  });
}

export async function createShareAdjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({
    member_id: z.string().uuid(),
    direction: z.enum(["credit", "debit"]),
    amount: moneySchema,
    reason: reasonSchema,
    adjusts_id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
    idempotency_key: z.string().uuid(),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat pelarasan.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("create_share_adjustment", {
    p_member_id: d.member_id, p_amount_sen: d.direction === "debit" ? -d.amount : d.amount, p_reason: d.reason,
    p_adjusts_id: d.adjusts_id ?? null, p_idempotency_key: d.idempotency_key,
  }, { success: "Pelarasan direkodkan.", revalidate: ["/admin"] });
}
