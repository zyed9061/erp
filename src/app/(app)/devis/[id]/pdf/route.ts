import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { DocumentPdf } from "@/lib/pdf/DocumentPdf";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [devis, company] = await Promise.all([
    prisma.devis.findUnique({ where: { id }, include: { client: true, lignes: true } }),
    prisma.companyProfile.findFirst(),
  ]);

  if (!devis) {
    return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    DocumentPdf({
      titre: "DEVIS",
      numero: devis.numero,
      dateEmission: devis.dateEmission,
      dateSecondaire: devis.dateValidite,
      labelDateSecondaire: "Valable jusqu'au",
      company: {
        nom: company?.nom ?? "Mon entreprise",
        adresse: company?.adresse,
        ville: company?.ville,
        matriculeFiscal: company?.matriculeFiscal,
        telephone: company?.telephone,
        email: company?.email,
      },
      client: {
        nom: devis.client.nom,
        adresse: devis.client.adresse,
        ville: devis.client.ville,
        matriculeFiscal: devis.client.matriculeFiscal,
      },
      lignes: devis.lignes.map((l) => ({
        designation: l.designation,
        quantite: Number(l.quantite),
        prixUnitaireHT: Number(l.prixUnitaireHT),
        tauxTva: Number(l.tauxTva),
        totalHT: Number(l.totalHT),
      })),
      sousTotalHT: Number(devis.sousTotalHT),
      totalTva: Number(devis.totalTva),
      totalTTC: Number(devis.totalTTC),
      notes: devis.conditions,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${devis.numero}.pdf"`,
    },
  });
}
