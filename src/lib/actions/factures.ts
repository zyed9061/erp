"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { factureSchema, paiementSchema } from "@/lib/validations/document";
import { calculerLigne, calculerTotaux } from "@/lib/calculs";
import { nextDocumentNumber } from "@/lib/numbering";

function parseFormData(formData: FormData) {
  const lignesRaw = formData.get("lignes");
  const lignes = typeof lignesRaw === "string" ? JSON.parse(lignesRaw) : [];

  return {
    clientId: formData.get("clientId"),
    dateEmission: formData.get("dateEmission"),
    dateEcheance: formData.get("dateEcheance"),
    conditionsPaiement: formData.get("conditionsPaiement"),
    notes: formData.get("notes"),
    appliquerTimbreFiscal: formData.get("appliquerTimbreFiscal") === "on",
    lignes,
  };
}

export async function createFacture(formData: FormData) {
  const user = await requireUser();
  const data = factureSchema.parse(parseFormData(formData));

  const annee = new Date(data.dateEmission).getFullYear();
  const numero = await nextDocumentNumber("FACTURE", annee);

  const companyProfile = await prisma.companyProfile.findFirst();
  const timbreFiscal = data.appliquerTimbreFiscal
    ? Number(companyProfile?.tauxTimbreFiscal ?? 1)
    : 0;

  const totaux = calculerTotaux(data.lignes, timbreFiscal);

  const facture = await prisma.facture.create({
    data: {
      numero,
      annee,
      dateEmission: new Date(data.dateEmission),
      dateEcheance: data.dateEcheance ? new Date(data.dateEcheance) : null,
      conditionsPaiement: data.conditionsPaiement || null,
      notes: data.notes || null,
      clientId: data.clientId,
      createdById: user.id,
      sousTotalHT: totaux.sousTotalHT,
      totalTva: totaux.totalTva,
      timbreFiscal,
      totalTTC: totaux.totalTTC,
      lignes: {
        create: data.lignes.map((ligne, index) => {
          const calculee = calculerLigne(ligne);
          return {
            ordre: index,
            designation: ligne.designation,
            description: ligne.description || null,
            quantite: ligne.quantite,
            prixUnitaireHT: ligne.prixUnitaireHT,
            remisePct: ligne.remisePct,
            tauxTva: ligne.tauxTva,
            totalHT: calculee.totalHT,
            produitId: ligne.produitId || null,
          };
        }),
      },
    },
  });

  revalidatePath("/factures");
  redirect(`/factures/${facture.id}`);
}

export async function updateFactureStatut(
  id: string,
  statut: "BROUILLON" | "ENVOYEE" | "ANNULEE",
) {
  await requireUser();
  await prisma.facture.update({ where: { id }, data: { statut } });
  revalidatePath(`/factures/${id}`);
  revalidatePath("/factures");
}

async function recalculerStatutPaiement(factureId: string) {
  const facture = await prisma.facture.findUniqueOrThrow({ where: { id: factureId } });
  const totalTTC = Number(facture.totalTTC);
  const montantPaye = Number(facture.montantPaye);

  let statut = facture.statut;
  if (montantPaye <= 0) {
    statut = facture.statut === "ANNULEE" ? "ANNULEE" : "ENVOYEE";
  } else if (montantPaye >= totalTTC) {
    statut = "PAYEE";
  } else {
    statut = "PARTIELLEMENT_PAYEE";
  }

  await prisma.facture.update({ where: { id: factureId }, data: { statut } });
}

export async function enregistrerPaiement(formData: FormData) {
  const user = await requireUser();
  const data = paiementSchema.parse({
    factureId: formData.get("factureId"),
    datePaiement: formData.get("datePaiement"),
    montant: formData.get("montant"),
    modePaiement: formData.get("modePaiement"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });

  await prisma.$transaction(async (tx) => {
    await tx.paiement.create({
      data: {
        factureId: data.factureId,
        datePaiement: new Date(data.datePaiement),
        montant: data.montant,
        modePaiement: data.modePaiement,
        reference: data.reference || null,
        notes: data.notes || null,
        createdById: user.id,
      },
    });

    const facture = await tx.facture.findUniqueOrThrow({ where: { id: data.factureId } });
    await tx.facture.update({
      where: { id: data.factureId },
      data: { montantPaye: Number(facture.montantPaye) + data.montant },
    });
  });

  await recalculerStatutPaiement(data.factureId);

  revalidatePath(`/factures/${data.factureId}`);
}
