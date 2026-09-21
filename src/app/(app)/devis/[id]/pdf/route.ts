import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { loadQuotePdf } from "@/lib/pdf/loaders";
import { renderDocumentPdf } from "@/lib/pdf/render";

export const dynamic = "force-dynamic";

/** PDF d'un devis (?download=1 pour forcer le téléchargement). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("quotes:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Introuvable", { status: 404 });
  const loaded = await loadQuotePdf(db, id);
  if (!loaded) return new NextResponse("Introuvable", { status: 404 });

  const bytes = await renderDocumentPdf(loaded.data);
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${loaded.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
