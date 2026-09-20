"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { devisSchema } from "@/lib/validations/document";
import { calculerLigne, calculerTotaux } from "@/lib/calculs";
import { nextDocumentNumber } from "@/lib/numbering";

function parseFormData(formData: FormData) {
  const lignesRaw = formData.get("lignes");
  const lignes = typeof lignesRaw === "string" ? JSON.parse(lignesRaw) : [];

  return {
    clientId: formData.get("clientId"),
    dateEmission: formData.get("dateEmission"),
    dateValidite: formData.get("dateValidite"),
    conditions: formData.get("conditions"),
    notes: formData.get("notes"),
    lignes,
  };
}

export async function createDevis(formData: FormData) {
  const user = await requireUser();
  const data = devisSchema.parse(parseFormData(formData));

  const annee = new Date(data.dateEmission).getFullYear();
  const totaux = calculerTotaux(data.lignes);
  const numero = await nextDocumentNumber("DEVIS", annee);

  const devis = await prisma.devis.create({
    data: {
      numero,
      annee,
      dateEmission: new Date(data.dateEmission),
      dateValidite: data.dateValidite ? new Date(data.dateValidite) : null,
      conditions: data.conditions || null,
      notes: data.notes || null,
      clientId: data.clientId,
      createdById: user.id,
      sousTotalHT: totaux.sousTotalHT,
      totalTva: totaux.totalTva,
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

  revalidatePath("/devis");
  redirect(`/devis/${devis.id}`);
}

export async function updateDevisStatut(
  id: string,
  statut: "BROUILLON" | "ENVOYE" | "ACCEPTE" | "REFUSE" | "EXPIRE",
) {
  await requireUser();
  await prisma.devis.update({ where: { id }, data: { statut } });
  revalidatePath(`/devis/${id}`);
  revalidatePath("/devis");
}

export async function convertirDevisEnFacture(devisId: string) {
  const user = await requireUser();

  const devis = await prisma.devis.findUniqueOrThrow({
    where: { id: devisId },
    include: { lignes: true },
  });

  const facture = await prisma.$transaction(async (tx) => {
    const annee = new Date().getFullYear();
    const numero = await nextDocumentNumber("FACTURE", annee);

    const timbreFiscalConfig = await tx.companyProfile.findFirst();
    const timbreFiscal = Number(timbreFiscalConfig?.tauxTimbreFiscal ?? 1);

    const totaux = calculerTotaux(
      devis.lignes.map((l) => ({
        quantite: Number(l.quantite),
        prixUnitaireHT: Number(l.prixUnitaireHT),
        remisePct: Number(l.remisePct),
        tauxTva: Number(l.tauxTva),
      })),
      timbreFiscal,
    );

    const nouvelleFacture = await tx.facture.create({
      data: {
        numero,
        annee,
        clientId: devis.clientId,
        devisOrigineId: devis.id,
        createdById: user.id,
        sousTotalHT: totaux.sousTotalHT,
        totalTva: totaux.totalTva,
        timbreFiscal,
        totalTTC: totaux.totalTTC,
        lignes: {
          create: devis.lignes.map((l) => ({
            ordre: l.ordre,
            designation: l.designation,
            description: l.description,
            quantite: l.quantite,
            prixUnitaireHT: l.prixUnitaireHT,
            remisePct: l.remisePct,
            tauxTva: l.tauxTva,
            totalHT: l.totalHT,
            produitId: l.produitId,
          })),
        },
      },
    });

    await tx.devis.update({ where: { id: devis.id }, data: { statut: "CONVERTI" } });

    return nouvelleFacture;
  });

  revalidatePath("/devis");
  revalidatePath("/factures");
  redirect(`/factures/${facture.id}`);
}
