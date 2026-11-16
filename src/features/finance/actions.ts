"use server";
import { z } from "zod";
import { fail, type ActionState } from "@/lib/errors";
import { fieldErrors, moneySchema, pastDateSchema, reasonSchema, receiptPathSchema } from "@/lib/validation";
import { BUSINESSES, FINANCE_IN_CATEGORIES, FINANCE_OUT_CATEGORIES } from "@/lib/labels";
import { callRpc } from "@/lib/rpc";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const entrySchema = z
  .object({
    direction: z.enum(["in", "out"]),
    category: z.string(),
    business: z.enum(Object.keys(BUSINESSES) as [string, ...string[]], { message: "Sila pilih perniagaan" }),
    amount: moneySchema,
    entry_date: pastDateSchema,
    description: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(5, "Sekurang-kurangnya 5 aksara").max(500)),
    reference: z.preprocess(emptyToUndef, z.string().max(100).optional()),
    proof_path: z.preprocess(emptyToUndef, receiptPathSchema.optional()),
    idempotency_key: z.string().uuid(),
  })
  .refine((d) => (d.direction === "in" ? d.category in FINANCE_IN_CATEGORIES : d.category in FINANCE_OUT_CATEGORIES), {
    path: ["category"],
    message: "Sila pilih kategori",
  });

export async function recordCoopEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = entrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat rekod.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("record_coop_entry", {
    p_direction: d.direction, p_category: d.category, p_business: d.business, p_amount_sen: d.amount,
    p_entry_date: d.entry_date, p_description: d.description, p_reference: d.reference ?? null,
    p_proof_path: d.proof_path ?? null, p_idempotency_key: d.idempotency_key,
  }, { success: d.direction === "in" ? "Wang masuk direkodkan." : "Pengeluaran direkodkan.", revalidate: ["/admin"] });
}

export async function reverseCoopEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("entry_id"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!id.success) return fail("Permintaan tidak sah.");
  if (!reason.success) return fail("Sila nyatakan sebab pembalikan.", { reason: ["Sebab diperlukan"] });
  return callRpc("reverse_coop_entry", { p_id: id.data, p_reason: reason.data }, { success: "Rekod dibalikkan.", revalidate: ["/admin"] });
}
