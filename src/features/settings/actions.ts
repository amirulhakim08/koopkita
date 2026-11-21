"use server";
import { revalidatePath } from "next/cache";
import { fail, type ActionState } from "@/lib/errors";
import { parseRMToSen } from "@/lib/format";
import { callRpc } from "@/lib/rpc";
import { requireAdmin } from "@/lib/auth";

const TEXT_KEYS = ["coop_bank_name", "coop_bank_account_name", "coop_bank_account_no", "coop_payment_instructions",
  "coop_name", "coop_reg_no", "coop_address", "coop_phone", "coop_email", "coop_logo_path"] as const;
const MONEY_KEYS = ["share_min_payment_sen", "share_min_total_sen", "share_max_total_sen"] as const;

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const updates: [string, unknown][] = [];
  for (const k of TEXT_KEYS) {
    const v = String(formData.get(k) ?? "").trim();
    if (k === "coop_bank_account_no" && v && !/^[0-9-]{6,25}$/.test(v)) return fail("Nombor akaun bank tidak sah.", { [k]: ["Nombor akaun tidak sah"] });
    if (v.length > 500) return fail("Teks terlalu panjang.");
    if (k === "coop_logo_path" && v && !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}\.(png|jpe?g)$/i.test(v)) return fail("Logo tidak sah.");
    if (k === "coop_email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return fail("E-mel koperasi tidak sah.", { coop_email: ["E-mel tidak sah"] });
    updates.push([k, v === "" ? null : v]);
  }
  for (const k of MONEY_KEYS) {
    const sen = parseRMToSen(String(formData.get(k) ?? ""));
    if (sen == null) return fail("Jumlah tidak sah.", { [k]: ["Jumlah tidak sah"] });
    updates.push([k, sen]);
  }
  updates.push(["admin_mfa_required", formData.get("admin_mfa_required") === "on"]);

  for (const [key, value] of updates) {
    const res = await callRpc("update_system_setting", { p_key: key, p_value: value }, { success: "" });
    if (!res?.ok) return res;
  }
  revalidatePath("/admin/tetapan");
  revalidatePath("/ahli", "layout");
  return { ok: true, message: "Tetapan disimpan." };
}
