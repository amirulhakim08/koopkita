/**
 * Best-effort in-memory limiter for unauthenticated endpoints (login/registration).
 * Serverless instances do not share memory, so this complements — not replaces —
 * Supabase Auth's built-in rate limits and the database-level limiter used by
 * every authenticated financial operation (app_private.rate_limit).
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function hitRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return false;
  }
  b.count += 1;
  return b.count > max;
}
