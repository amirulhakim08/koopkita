import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";

export type Session = {
  userId: string;
  email: string | null;
  aal: string | null;
  profile: Profile | null;
};

/** Verified session for the current request (JWT validated by getClaims). */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; email?: string; aal?: string };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", claims.sub).maybeSingle();
  return { userId: claims.sub, email: claims.email ?? null, aal: claims.aal ?? null, profile: (profile as Profile) ?? null };
});

export function homeFor(profile: Profile | null): string {
  if (!profile || profile.status !== "active") return "/status-akaun";
  return profile.role === "super_admin" ? "/admin" : "/ahli";
}

/** Any signed-in user (any status). */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/log-masuk");
  return s;
}

/** Approved (active) member or admin. Rejected, suspended and pending users are redirected. */
export async function requireActiveMember(): Promise<Session & { profile: Profile }> {
  const s = await requireSession();
  if (!s.profile || s.profile.status !== "active") redirect("/status-akaun");
  return s as Session & { profile: Profile };
}

const adminMfaRequired = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  // Only visible once the caller already satisfies is_admin(); otherwise default to required.
  const { data } = await supabase.from("system_settings").select("value").eq("key", "admin_mfa_required").maybeSingle();
  return data ? data.value !== false : true;
});

/** Active Super Admin with MFA (AAL2) when required. Database functions re-check all of this. */
export async function requireAdmin(opts: { allowAal1?: boolean } = {}): Promise<Session & { profile: Profile }> {
  const s = await requireActiveMember();
  if (s.profile.role !== "super_admin") redirect("/ahli");
  if (!opts.allowAal1 && s.aal !== "aal2" && (await adminMfaRequired())) redirect("/mfa");
  return s;
}

/** For route handlers: returns the admin session or null (no redirects). */
export async function getAdminOrNull(): Promise<(Session & { profile: Profile }) | null> {
  const s = await getSession();
  if (!s?.profile || s.profile.status !== "active" || s.profile.role !== "super_admin") return null;
  if (s.aal !== "aal2" && (await adminMfaRequired())) return null;
  return s as Session & { profile: Profile };
}
