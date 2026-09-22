"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { produitSchema } from "@/lib/validations/produit";
import { lireCouleur, nouvelleCouleur } from "@/lib/couleurs-serveur";

function parseFormData(formData: FormData) {
  return {
    reference: formData.get("reference"),
    designation: formData.get("designation"),
    description: formData.get("description"),
    type: formData.get("type"),
    prixUnitaireHT: formData.get("prixUnitaireHT"),
    uniteMesure: formData.get("uniteMesure") || "unite",
    tauxTva: formData.get("tauxTva"),
  };
}

export async function createProduit(formData: FormData) {
  await requireUser();
  const data = produitSchema.parse(parseFormData(formData));

  await prisma.$transaction(async (tx) => {
    const couleur = await nouvelleCouleur(tx, "produit", `${data.designation}${Date.now()}`);
    await tx.produit.create({
      data: {
        ...data,
        reference: data.reference || null,
        couleur,
      },
    });
  });

  revalidatePath("/produits");
  redirect("/produits");
}

export async function updateProduit(id: string, formData: FormData) {
  await requireUser();
  const data = produitSchema.parse(parseFormData(formData));

  await prisma.$transaction(async (tx) => {
    // Produit cree avant l'introduction des couleurs : on lui en attribue une maintenant.
    const couleur = (await lireCouleur(tx, "produit", id)) ?? (await nouvelleCouleur(tx, "produit", id));
    await tx.produit.update({
      where: { id },
      data: {
        ...data,
        reference: data.reference || null,
        couleur,
      },
    });
  });

  revalidatePath("/produits");
  revalidatePath(`/produits/${id}`);
  redirect("/produits");
}

export async function deactivateProduit(id: string) {
  await requireUser();
  await prisma.produit.update({ where: { id }, data: { actif: false } });
  revalidatePath("/produits");
}
