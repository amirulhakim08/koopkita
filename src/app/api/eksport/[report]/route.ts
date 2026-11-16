import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminOrNull } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { todayKL } from "@/lib/format";
import { REPORTS } from "@/features/reports/reports";

export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const def = REPORTS[report];
  if (!def) return new NextResponse("Laporan tidak dijumpai", { status: 404 });
  const admin = await getAdminOrNull();
  if (!admin) return new NextResponse("Akses ditolak", { status: 403 });

  const supabase = await createClient();
  const { headers, rows } = await def.build(supabase, request.nextUrl.searchParams);
  const { error } = await supabase.rpc("log_export", { p_report: report, p_row_count: rows.length });
  if (error) return new NextResponse("Eksport tidak dibenarkan", { status: 429 });

  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="koopkita-${report}-${todayKL()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
