import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pdfResponse, renderCoopReceiptPdf } from "@/features/business/pdf";
import type { CoopReceiptJson } from "@/features/business/types";

export const runtime = "nodejs";

/** Official cooperative receipt for an approved Qurban sale (seller or Super Admin). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(saleId)) return new NextResponse("Permintaan tidak sah", { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("coop_sale_receipt", { p_sale_id: saleId });
  if (error || !data) return new NextResponse("Resit tidak tersedia", { status: 404 });
  const r = data as CoopReceiptJson;
  return pdfResponse(await renderCoopReceiptPdf(r), `Resit-Rasmi-${r.sale_no}.pdf`, request.nextUrl.searchParams.get("muat") !== "1");
}
