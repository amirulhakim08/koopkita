export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[] | undefined>; data?: unknown } | null;

export const ERROR_CODES = [
  "AUTH_REQUIRED", "FORBIDDEN", "MFA_REQUIRED", "VALIDATION", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "CONFIG_REQUIRED",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Parse a database error raised as 'CODE|Mesej'. Unknown errors become a generic message (no internals leak). */
export function parseDbError(error: { message?: string; code?: string } | null | undefined): { code: ErrorCode | "UNKNOWN"; message: string } {
  const raw = error?.message ?? "";
  const m = raw.match(/^([A-Z_]+)\|([\s\S]+)$/);
  if (m && (ERROR_CODES as readonly string[]).includes(m[1])) {
    return { code: m[1] as ErrorCode, message: m[2] };
  }
  if (raw.includes("IMMUTABLE_RECORD")) return { code: "CONFLICT", message: "Rekod kewangan tidak boleh diubah." };
  if (error?.code === "23505") return { code: "CONFLICT", message: "Rekod pendua dikesan." };
  if (error?.code === "42501") return { code: "FORBIDDEN", message: "Anda tidak mempunyai kebenaran." };
  return { code: "UNKNOWN", message: "Ralat tidak dijangka berlaku. Sila cuba lagi." };
}

export function fail(message: string, fieldErrors?: Record<string, string[] | undefined>): ActionState {
  return { ok: false, message, fieldErrors };
}
