"use server";
import { z } from "zod";
import { fail, type ActionState } from "@/lib/errors";
import { parseRMToSen } from "@/lib/format";
import { callRpc } from "@/lib/rpc";
import { requireAdmin } from "@/lib/auth";

const TEXT_KEYS = ["coop_bank_name", "coop_bank_account_name", "coop_bank_account_no", "coop_payment_instructions"] as const;
const MONEY_KEYS = ["share_min_payment_sen", "share_min_total_sen", "share_max_total_sen"] as const;

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const updates: [string, unknown][] = [];
  for (const k of TEXT_KEYS) {
    const v = String(formData.get(k) ?? "").trim();
    if (k === "coop_bank_account_no" && v && !/^[0-9-]{6,25}$/.test(v)) return fail("Nombor akaun bank tidak sah.", { [k]: ["Nombor akaun tidak sah"] });
    if (v.length > 500) return fail("Teks terlalu panjang.");
    updates.push([k, v === "" ? null : v]);
  }
  for (const k of MONEY_KEYS) {
    const sen = parseRMToSen(String(formData.get(k) ?? ""));
    if (sen == null) return fail("Jumlah tidak sah.", { [k]: ["Jumlah tidak sah"] });
    updates.push([k, sen]);
  }
  const hours = z.coerce.number().int().min(1).max(720).safeParse(formData.get("reservation_expiry_hours"));
  if (!hours.success) return fail("Tempoh tempahan mesti 1–720 jam.", { reservation_expiry_hours: ["1–720 jam"] });
  updates.push(["reservation_expiry_hours", hours.data]);
  updates.push(["admin_mfa_required", formData.get("admin_mfa_required") === "on"]);

  for (const [key, value] of updates) {
    const res = await callRpc("update_system_setting", { p_key: key, p_value: value }, { success: "" });
    if (!res?.ok) return res;
  }
  return callRpc("expire_stale_reservations", {}, { success: "Tetapan disimpan.", revalidate: ["/admin/tetapan", "/ahli"] });
}
