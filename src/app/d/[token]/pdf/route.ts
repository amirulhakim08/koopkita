import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { documentFileName, pdfResponse, renderBusinessPdf } from "@/features/business/pdf";
import type { DocumentJson } from "@/features/business/types";

export const runtime = "nodejs";

/** Public PDF for a customer holding the share link. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return new NextResponse("Pautan tidak sah", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_document", { p_token: token });
  if (!data) return new NextResponse("Dokumen tidak dijumpai atau pautan telah dimatikan", { status: 404 });
  const doc = data as DocumentJson;
  return pdfResponse(await renderBusinessPdf(doc), documentFileName(doc), request.nextUrl.searchParams.get("muat") !== "1");
}
