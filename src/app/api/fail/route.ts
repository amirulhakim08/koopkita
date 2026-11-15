import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKETS = new Set(["receipts", "payout-proofs"]);
const PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/;

/**
 * Issues a 60-second signed URL for a private file. The signed URL is created
 * with the caller's own session, so Supabase Storage RLS decides access:
 * uploader or Super Admin for receipts; payee or Super Admin for payout proofs.
 */
export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get("b") ?? "";
  const path = request.nextUrl.searchParams.get("p") ?? "";
  if (!BUCKETS.has(bucket) || !PATH_RE.test(path)) return new NextResponse("Permintaan tidak sah", { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new NextResponse("Sila log masuk", { status: 401 });

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return new NextResponse("Fail tidak dijumpai atau akses ditolak", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
