import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { getEinvoiceExport } from "@/lib/einvoice/service";
import { latestSubmission } from "@/lib/einvoice/submission";
import { getInvoice } from "@/lib/invoicing/invoices";
import { isDemoMode } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";

/** Télécharge le fichier TEIF déjà préparé (le fichier conservé, jamais régénéré à la volée). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("invoices:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Introuvable", { status: 404 });
  // ?signed=1 : XML signé de démonstration (uniquement en mode démonstration).
  if (new URL(request.url).searchParams.get("signed") === "1") {
    const sub = isDemoMode() ? await latestSubmission(db, id) : null;
    const inv = sub ? await getInvoice(db, id) : null;
    if (!sub || !inv?.invoice.number) return new NextResponse("Aucun fichier signé (démonstration) pour cette facture", { status: 404 });
    return new NextResponse(sub.signedXml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${inv.invoice.number.replace(/[^A-Za-z0-9._-]+/g, "_")}.DEMO-signe.xml"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const [exp, details] = await Promise.all([getEinvoiceExport(db, id), getInvoice(db, id)]);
  if (!exp || !details?.invoice.number) return new NextResponse("Aucun fichier TEIF préparé pour cette facture", { status: 404 });
  const filename = `${details.invoice.number.replace(/[^A-Za-z0-9._-]+/g, "_")}.teif-preparation.xml`;
  return new NextResponse(exp.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
