import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { buildReportCsv, isExportType } from "@/lib/report-exports";

export const dynamic = "force-dynamic";

/** Export CSV d'un rapport (Excel FR : « ; », virgule décimale, BOM UTF-8). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  await requirePermission("reports:read");
  const { type } = await params;
  if (!isExportType(type)) return new NextResponse("Introuvable", { status: 404 });
  const q = request.nextUrl.searchParams;
  const { filename, csv } = await buildReportCsv(db, type, {
    from: q.get("from") ?? undefined, to: q.get("to") ?? undefined, asOf: q.get("asOf") ?? undefined,
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
