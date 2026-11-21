import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminOrNull } from "@/lib/auth";
import { loadMeetingReport, renderMeetingPdf, renderMeetingXlsx, reportFileBase } from "@/features/meetings/report";

export const runtime = "nodejs";

/** Attendance report for one meeting, Super Admin only (PDF or Excel). Never public. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format");
  if (!/^[0-9a-f-]{36}$/.test(id) || (format !== "pdf" && format !== "xlsx")) return new NextResponse("Permintaan tidak sah", { status: 400 });
  const admin = await getAdminOrNull();
  if (!admin) return new NextResponse("Akses ditolak", { status: 403 });

  const supabase = await createClient();
  await supabase.rpc("refresh_meetings");
  const report = await loadMeetingReport(supabase, id);
  if (!report) return new NextResponse("Mesyuarat tidak dijumpai", { status: 404 });
  const { error } = await supabase.rpc("log_export", { p_report: `mesyuarat-${format}`, p_row_count: report.rows.length });
  if (error) return new NextResponse("Eksport tidak dibenarkan", { status: 429 });

  const file = `${reportFileBase(report.meeting)}.${format}`.replace(/[^A-Za-z0-9._-]/g, "_");
  const body = format === "pdf" ? await renderMeetingPdf(report) : await renderMeetingXlsx(report);
  const inline = format === "pdf" && request.nextUrl.searchParams.get("muat") !== "1";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
