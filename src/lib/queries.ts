import "server-only";
import { createClient } from "@/lib/supabase/server";

export type BankSettings = { bankName: string | null; accountName: string | null; accountNo: string | null; instructions: string | null };

export async function getSettings(): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

export async function getBankSettings(): Promise<BankSettings> {
  const s = await getSettings();
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    bankName: str(s.coop_bank_name), accountName: str(s.coop_bank_account_name),
    accountNo: str(s.coop_bank_account_no), instructions: str(s.coop_payment_instructions),
  };
}
