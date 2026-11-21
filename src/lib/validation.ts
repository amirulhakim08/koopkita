import { z } from "zod";
import { MALAYSIAN_STATES } from "@/lib/labels";
import { parseRMToSen, todayKL } from "@/lib/format";

const trim = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : trim(v));

export const phoneSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v),
  z.string().regex(/^\+?[0-9]{9,15}$/, "Nombor telefon tidak sah"),
);

export const icSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v),
  z.string().regex(/^[0-9]{12}$/, "No. Kad Pengenalan mesti 12 digit").refine((ic) => {
    const mm = Number(ic.slice(2, 4));
    const dd = Number(ic.slice(4, 6));
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
  }, "No. Kad Pengenalan tidak sah"),
);

export const moneySchema = z.preprocess(
  (v) => (typeof v === "string" ? parseRMToSen(v) : v),
  z.number({ message: "Jumlah tidak sah" }).int().positive("Jumlah mesti lebih daripada sifar"),
);

export const pastDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarikh tidak sah")
  .refine((d) => d <= todayKL(), "Tarikh tidak boleh pada masa hadapan");

export const transactionRefSchema = z.preprocess(trim, z.string().min(3, "Rujukan transaksi diperlukan").max(100));

export const receiptPathSchema = z.string().regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/, "Sila muat naik resit");

export const idempotencyKeySchema = z.string().uuid();

export const passwordSchema = z
  .string()
  .min(10, "Kata laluan sekurang-kurangnya 10 aksara")
  .max(72)
  .regex(/[a-z]/, "Perlu huruf kecil")
  .regex(/[A-Z]/, "Perlu huruf besar")
  .regex(/[0-9]/, "Perlu nombor");

export const profileFields = {
  full_name: z.preprocess(trim, z.string().min(3, "Nama penuh diperlukan").max(150)),
  phone: phoneSchema,
  address: z.preprocess(trim, z.string().min(5, "Alamat diperlukan").max(500)),
  state: z.enum(MALAYSIAN_STATES, { message: "Sila pilih negeri" }),
  postcode: z.preprocess(trim, z.string().regex(/^[0-9]{5}$/, "Poskod mesti 5 digit")),
  bank_name: z.preprocess(emptyToUndef, z.string().max(100).optional()),
  bank_account_no: z.preprocess(
    (v) => (typeof v === "string" ? (v.replace(/[\s-]/g, "") || undefined) : v),
    z.string().regex(/^[0-9]{6,20}$/, "Nombor akaun mesti 6–20 digit").optional(),
  ),
  bank_account_holder: z.preprocess(emptyToUndef, z.string().max(150).optional()),
};

export const registerSchema = z
  .object({
    ...profileFields,
    email: z.preprocess(trim, z.email("E-mel tidak sah").max(254)),
    ic_number: icSchema,
    password: passwordSchema,
    confirm_password: z.string(),
    consent: z.literal("on", { message: "Sila bersetuju dengan notis privasi" }),
  })
  .refine((d) => d.password === d.confirm_password, { path: ["confirm_password"], message: "Kata laluan tidak sepadan" })
  .superRefine(bankComplete);

/** Bank details are optional, but when any field is given all three must be valid. */
export function bankComplete<T extends { bank_name?: string; bank_account_no?: string; bank_account_holder?: string }>(d: T, ctx: z.RefinementCtx) {
  const any = d.bank_name || d.bank_account_no || d.bank_account_holder;
  if (!any) return;
  if (!d.bank_name) ctx.addIssue({ code: "custom", path: ["bank_name"], message: "Sila pilih bank" });
  if (!d.bank_account_no) ctx.addIssue({ code: "custom", path: ["bank_account_no"], message: "Nombor akaun diperlukan" });
  if (!d.bank_account_holder || d.bank_account_holder.length < 3)
    ctx.addIssue({ code: "custom", path: ["bank_account_holder"], message: "Nama pemegang akaun diperlukan" });
}

export const profileUpdateSchema = z.object(profileFields).superRefine(bankComplete);
export const adminProfileUpdateSchema = z.object({ ...profileFields, ic_number: icSchema }).superRefine(bankComplete);

export const sharePaymentSchema = z.object({
  amount: moneySchema,
  payment_date: pastDateSchema,
  transaction_ref: transactionRefSchema,
  receipt_path: receiptPathSchema,
  idempotency_key: idempotencyKeySchema,
});

export const reasonSchema = z.preprocess(trim, z.string().min(3, "Sila nyatakan sebab").max(1000));

export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validateUpload(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) return "Hanya JPG, PNG, WEBP atau PDF dibenarkan";
  if (file.size > MAX_UPLOAD_BYTES) return "Saiz fail maksimum 5MB";
  if (file.size === 0) return "Fail kosong";
  return null;
}

/** Flatten zod errors to { field: [messages] } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
