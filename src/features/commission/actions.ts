"use server";
import { z } from "zod";
import { fail, type ActionState } from "@/lib/errors";
import { fieldErrors, payoutSchema, reasonSchema } from "@/lib/validation";
import { callRpc } from "@/lib/rpc";

export async function recordPayoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const entryIds = formData.getAll("entry_ids").map(String).filter(Boolean);
  const parsed = payoutSchema.safeParse({ ...Object.fromEntries(formData), entry_ids: entryIds.length ? entryIds : undefined });
  if (!parsed.success) return fail("Sila semak maklumat bayaran.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("record_commission_payout", {
    p_member_id: d.member_id, p_amount_sen: d.amount, p_payment_date: d.payment_date, p_transaction_ref: d.transaction_ref,
    p_proof_path: d.proof_path ?? null, p_notes: d.notes ?? null, p_bank_transfer_confirmed: true,
    p_entry_ids: d.entry_ids ?? null, p_idempotency_key: d.idempotency_key,
  }, { success: "Bayaran komisen direkodkan.", revalidate: ["/admin/komisen"] });
}

export async function reversePayoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("payout_id"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!id.success) return fail("Permintaan tidak sah.");
  if (!reason.success) return fail("Sila nyatakan sebab pembalikan.", { reason: ["Sebab diperlukan"] });
  return callRpc("reverse_commission_payout", { p_payout_id: id.data, p_reason: reason.data }, {
    success: "Bayaran dibalikkan.", revalidate: ["/admin/komisen"],
  });
}
