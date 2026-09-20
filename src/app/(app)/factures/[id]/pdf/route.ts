import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { DocumentPdf } from "@/lib/pdf/DocumentPdf";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [facture, company] = await Promise.all([
    prisma.facture.findUnique({ where: { id }, include: { client: true, lignes: true } }),
    prisma.companyProfile.findFirst(),
  ]);

  if (!facture) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    DocumentPdf({
      titre: "FACTURE",
      numero: facture.numero,
      dateEmission: facture.dateEmission,
      dateSecondaire: facture.dateEcheance,
      labelDateSecondaire: "Echeance",
      company: {
        nom: company?.nom ?? "Mon entreprise",
        adresse: company?.adresse,
        ville: company?.ville,
        matriculeFiscal: company?.matriculeFiscal,
        telephone: company?.telephone,
        email: company?.email,
      },
      client: {
        nom: facture.client.nom,
        adresse: facture.client.adresse,
        ville: facture.client.ville,
        matriculeFiscal: facture.client.matriculeFiscal,
      },
      lignes: facture.lignes.map((l) => ({
        designation: l.designation,
        quantite: Number(l.quantite),
        prixUnitaireHT: Number(l.prixUnitaireHT),
        tauxTva: Number(l.tauxTva),
        totalHT: Number(l.totalHT),
      })),
      sousTotalHT: Number(facture.sousTotalHT),
      totalTva: Number(facture.totalTva),
      timbreFiscal: Number(facture.timbreFiscal),
      totalTTC: Number(facture.totalTTC),
      notes: facture.conditionsPaiement,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${facture.numero}.pdf"`,
    },
  });
}
