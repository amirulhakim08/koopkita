import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { documentFileName, pdfResponse, renderBusinessPdf } from "@/features/business/pdf";
import type { DocumentJson } from "@/features/business/types";

export const runtime = "nodejs";

/** Owner-only PDF of an invoice or receipt (used by the Share / PDF buttons). */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("jenis");
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if ((kind !== "invoice" && kind !== "receipt") || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Permintaan tidak sah", { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_business_document", { p_kind: kind, p_id: id });
  if (error || !data) return new NextResponse("Dokumen tidak dijumpai", { status: 404 });
  const doc = data as DocumentJson;
  return pdfResponse(await renderBusinessPdf(doc), documentFileName(doc), request.nextUrl.searchParams.get("muat") !== "1");
}
