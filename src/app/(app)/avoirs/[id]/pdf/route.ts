import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { DocumentPdf } from "@/lib/pdf/DocumentPdf";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [avoir, company] = await Promise.all([
    prisma.avoir.findUnique({
      where: { id },
      include: { client: true, lignes: true, factureOrigine: true },
    }),
    prisma.companyProfile.findFirst(),
  ]);

  if (!avoir) {
    return NextResponse.json({ error: "Avoir introuvable" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    DocumentPdf({
      titre: "AVOIR",
      numero: avoir.numero,
      dateEmission: avoir.dateEmission,
      company: {
        nom: company?.nom ?? "Mon entreprise",
        adresse: company?.adresse,
        ville: company?.ville,
        matriculeFiscal: company?.matriculeFiscal,
        telephone: company?.telephone,
        email: company?.email,
      },
      client: {
        nom: avoir.client.nom,
        adresse: avoir.client.adresse,
        ville: avoir.client.ville,
        matriculeFiscal: avoir.client.matriculeFiscal,
      },
      lignes: avoir.lignes.map((l) => ({
        designation: l.designation,
        quantite: Number(l.quantite),
        prixUnitaireHT: Number(l.prixUnitaireHT),
        tauxTva: Number(l.tauxTva),
        totalHT: Number(l.totalHT),
      })),
      sousTotalHT: Number(avoir.sousTotalHT),
      totalTva: Number(avoir.totalTva),
      totalTTC: Number(avoir.totalTTC),
      notes: avoir.motif
        ? `Motif: ${avoir.motif} — Avoir sur la facture ${avoir.factureOrigine.numero}`
        : `Avoir sur la facture ${avoir.factureOrigine.numero}`,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${avoir.numero}.pdf"`,
    },
  });
}
