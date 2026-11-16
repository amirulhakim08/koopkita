"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, type ActionState } from "@/lib/errors";
import { fieldErrors, passwordSchema, registerSchema } from "@/lib/validation";
import { hitRateLimit } from "@/lib/rate-limit";
import { clientIp, safeNext, siteUrl } from "@/lib/site";
import { homeFor } from "@/lib/auth";
import type { Profile } from "@/types/db";

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (hitRateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) return fail("Terlalu banyak cubaan pendaftaran. Sila cuba sebentar lagi.");

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak maklumat yang dimasukkan.", fieldErrors(parsed.error));
  const d = parsed.data;

  const supabase = await createClient();
  const { data: signUpData, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/status-akaun`,
      // Copied into public.profiles by a database trigger, then removed from auth metadata.
      data: {
        full_name: d.full_name, phone: d.phone, ic_number: d.ic_number, address: d.address, state: d.state,
        postcode: d.postcode, bank_name: d.bank_name, bank_account_no: d.bank_account_no, bank_account_holder: d.bank_account_holder,
      },
    },
  });
  if (error) {
    if (error.status === 429) return fail("Terlalu banyak cubaan. Sila cuba sebentar lagi.");
    if (/password/i.test(error.message)) return fail("Kata laluan tidak memenuhi syarat keselamatan.");
    // Duplicate IC numbers violate a unique constraint inside the sign-up trigger.
    return fail("Pendaftaran tidak dapat diproses. E-mel atau No. Kad Pengenalan mungkin telah didaftarkan.");
  }
  // With "Confirm email" disabled in Supabase the user is signed in straight away.
  redirect(signUpData.session ? "/status-akaun" : "/daftar/semak-emel");
}

const loginSchema = z.object({ email: z.email("E-mel tidak sah"), password: z.string().min(1, "Kata laluan diperlukan"), next: z.string().optional() });

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila masukkan e-mel dan kata laluan.", fieldErrors(parsed.error));
  const ip = await clientIp();
  if (hitRateLimit(`login:${ip}`, 20, 15 * 60 * 1000) || hitRateLimit(`login:${parsed.data.email.toLowerCase()}`, 8, 15 * 60 * 1000)) {
    return fail("Terlalu banyak cubaan log masuk. Sila cuba selepas 15 minit.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return fail("Akaun anda belum diaktifkan. Sila klik pautan pengesahan dalam e-mel anda, atau tunggu kelulusan Super Admin.");
    }
    return fail("E-mel atau kata laluan tidak sah.");
  }
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  const home = homeFor(profile as Profile | null);
  const next = safeNext(parsed.data.next, home);
  redirect(home === "/status-akaun" ? home : next.startsWith("/admin") && home !== "/admin" ? home : next);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/log-masuk");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return fail("E-mel tidak sah.", { email: ["E-mel tidak sah"] });
  const ip = await clientIp();
  if (hitRateLimit(`reset:${ip}`, 5, 60 * 60 * 1000)) return fail("Terlalu banyak cubaan. Sila cuba sebentar lagi.");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${await siteUrl()}/auth/confirm?next=/tetapkan-kata-laluan` });
  // Same response whether or not the account exists (no account enumeration).
  return { ok: true, message: "Jika e-mel ini berdaftar, pautan tetapan semula kata laluan telah dihantar." };
}

export async function updatePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z
    .object({ password: passwordSchema, confirm_password: z.string() })
    .refine((d) => d.password === d.confirm_password, { path: ["confirm_password"], message: "Kata laluan tidak sepadan" });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak kata laluan.", fieldErrors(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("Kata laluan tidak dapat dikemas kini. Sila minta pautan baharu.");
  return { ok: true, message: "Kata laluan telah dikemas kini." };
}
