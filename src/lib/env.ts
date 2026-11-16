import { z } from "zod";

/**
 * Public (browser-safe) environment. Validated lazily so that `next build`
 * succeeds without credentials; any request that needs Supabase fails loudly
 * with a clear message instead.
 *
 * The application never needs the Supabase service-role key at runtime: every
 * request runs with the signed-in user's JWT and is filtered by RLS. The
 * service-role key is only used by scripts/provision-super-admin.mjs.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL mesti URL yang sah" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY diperlukan"),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | null = null;

export function isSupabaseConfigured(): boolean {
  return publicSchema.safeParse(readRaw()).success;
}

function readRaw() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  };
}

export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicSchema.safeParse(readRaw());
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Konfigurasi persekitaran tidak sah — ${issues}. Lihat .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
