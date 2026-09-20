"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { produitSchema } from "@/lib/validations/produit";

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

  await prisma.produit.create({
    data: {
      ...data,
      reference: data.reference || null,
    },
  });

  revalidatePath("/produits");
  redirect("/produits");
}

export async function updateProduit(id: string, formData: FormData) {
  await requireUser();
  const data = produitSchema.parse(parseFormData(formData));

  await prisma.produit.update({
    where: { id },
    data: {
      ...data,
      reference: data.reference || null,
    },
  });

  revalidatePath("/produits");
  redirect("/produits");
}

export async function deactivateProduit(id: string) {
  await requireUser();
  await prisma.produit.update({ where: { id }, data: { actif: false } });
  revalidatePath("/produits");
}
