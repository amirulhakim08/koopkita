import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseDbError, type ActionState } from "@/lib/errors";

/**
 * Calls a database function with the user's own JWT. All authorization,
 * validation, locking, idempotency and audit logging happen in the database.
 */
export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  opts: { success: string; revalidate?: string[] },
): Promise<ActionState & { data?: T }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const parsed = parseDbError(error);
    if (parsed.code === "UNKNOWN") console.error(`[rpc:${fn}]`, error.code, error.message);
    if (parsed.code === "MFA_REQUIRED") return { ok: false, message: "Sesi MFA diperlukan. Sila sahkan MFA semula." };
    return { ok: false, message: parsed.message };
  }
  for (const p of opts.revalidate ?? []) revalidatePath(p, "layout");
  return { ok: true, message: opts.success, data: data as T };
}
