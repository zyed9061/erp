"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { avoirSchema } from "@/lib/validations/document";
import { calculerLigne, calculerTotaux } from "@/lib/calculs";
import { nextDocumentNumber } from "@/lib/numbering";
import { nouvelleCouleur } from "@/lib/couleurs-serveur";

function parseFormData(formData: FormData) {
  const lignesRaw = formData.get("lignes");
  const lignes = typeof lignesRaw === "string" ? JSON.parse(lignesRaw) : [];

  return {
    factureOrigineId: formData.get("factureOrigineId"),
    motif: formData.get("motif"),
    lignes,
  };
}

export async function createAvoir(formData: FormData) {
  const user = await requireUser();
  const data = avoirSchema.parse(parseFormData(formData));

  const factureOrigine = await prisma.facture.findUniqueOrThrow({
    where: { id: data.factureOrigineId },
  });

  const annee = new Date().getFullYear();
  const numero = await nextDocumentNumber("AVOIR", annee);
  const totaux = calculerTotaux(data.lignes);

  const avoir = await prisma.$transaction(async (tx) => {
    const couleur = await nouvelleCouleur(tx, "avoir", numero);
    return tx.avoir.create({
      data: {
        couleur,
        numero,
        annee,
        motif: data.motif || null,
        clientId: factureOrigine.clientId,
        factureOrigineId: factureOrigine.id,
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
              tauxTva: ligne.tauxTva,
              totalHT: calculee.totalHT,
              produitId: ligne.produitId || null,
            };
          }),
        },
      },
    });
  });

  revalidatePath("/avoirs");
  revalidatePath(`/factures/${factureOrigine.id}`);
  redirect(`/avoirs/${avoir.id}`);
}
