import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { getEinvoiceExport } from "@/lib/einvoice/service";
import { getInvoice } from "@/lib/invoicing/invoices";

export const dynamic = "force-dynamic";

/** Télécharge le fichier TEIF déjà préparé (le fichier conservé, jamais régénéré à la volée). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("invoices:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Introuvable", { status: 404 });
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
