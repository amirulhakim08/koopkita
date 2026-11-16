"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveMember } from "@/lib/auth";
import { fail, parseDbError, type ActionState } from "@/lib/errors";
import { fieldErrors, icSchema, profileUpdateSchema, reasonSchema } from "@/lib/validation";
import { callRpc } from "@/lib/rpc";
import { z } from "zod";

/** Members update their own non-sensitive profile columns (column-level grants + RLS). */
export async function updateOwnProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireActiveMember();
  const parsed = profileUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat.", fieldErrors(parsed.error));
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: d.full_name, phone: d.phone, address: d.address, state: d.state, postcode: d.postcode,
      bank_name: d.bank_name ?? null, bank_account_no: d.bank_account_no ?? null, bank_account_holder: d.bank_account_holder ?? null,
    })
    .eq("id", session.userId);
  if (error) return fail(parseDbError(error).message);
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil dikemas kini." };
}

const idSchema = z.string().uuid();

export async function approveMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = idSchema.safeParse(formData.get("user_id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  return callRpc("approve_member", { p_user_id: id.data, p_notes: (formData.get("notes") as string) || null }, {
    success: "Ahli diluluskan.", revalidate: ["/admin"],
  });
}

export async function rejectMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = idSchema.safeParse(formData.get("user_id"));
  const notes = reasonSchema.safeParse(formData.get("notes"));
  if (!id.success) return fail("Permintaan tidak sah.");
  if (!notes.success) return fail("Sila nyatakan sebab penolakan.", { notes: ["Sebab diperlukan"] });
  return callRpc("reject_member", { p_user_id: id.data, p_notes: notes.data }, { success: "Permohonan ditolak.", revalidate: ["/admin"] });
}

export async function setSuspensionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = idSchema.safeParse(formData.get("user_id"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!id.success) return fail("Permintaan tidak sah.");
  if (!reason.success) return fail("Sila nyatakan sebab.", { reason: ["Sebab diperlukan"] });
  const suspend = formData.get("suspend") === "true";
  return callRpc("set_member_suspension", { p_user_id: id.data, p_suspend: suspend, p_reason: reason.data }, {
    success: suspend ? "Ahli digantung." : "Ahli diaktifkan semula.", revalidate: ["/admin"],
  });
}

export async function adminUpdateMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = idSchema.safeParse(formData.get("user_id"));
  if (!id.success) return fail("Permintaan tidak sah.");
  const schema = profileUpdateSchema.extend({ ic_number: icSchema });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat.", fieldErrors(parsed.error));
  const d = parsed.data;
  return callRpc("admin_update_member", {
    p_user_id: id.data,
    p_data: {
      full_name: d.full_name, phone: d.phone, ic_number: d.ic_number, address: d.address, state: d.state, postcode: d.postcode,
      bank_name: d.bank_name ?? "", bank_account_no: d.bank_account_no ?? "", bank_account_holder: d.bank_account_holder ?? "",
    },
  }, { success: "Maklumat ahli dikemas kini.", revalidate: ["/admin/ahli"] });
}
