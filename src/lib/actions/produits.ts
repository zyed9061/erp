"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { produitSchema } from "@/lib/validations/produit";
import { withToast } from "@/lib/toastRedirect";
import { getT } from "@/i18n/server";

function parseFormData(formData: FormData) {
  return {
    reference: formData.get("reference"),
    designation: formData.get("designation"),
    description: formData.get("description"),
    type: formData.get("type"),
    categorie: formData.get("categorie"),
    prixUnitaireHT: formData.get("prixUnitaireHT"),
    uniteMesure: formData.get("uniteMesure") || "unite",
    tauxTva: formData.get("tauxTva"),
    stock: formData.get("stock"),
  };
}

export async function createProduit(formData: FormData) {
  await requireUser();
  const data = produitSchema.parse(parseFormData(formData));

  await prisma.produit.create({
    data: {
      ...data,
      reference: data.reference || null,
      categorie: data.categorie || null,
      stock: data.stock ?? null,
    },
  });

  revalidatePath("/produits");
  const t = await getT();
  redirect(withToast("/produits", t("products.toastCreated")));
}

export async function updateProduit(id: string, formData: FormData) {
  await requireUser();
  const data = produitSchema.parse(parseFormData(formData));

  await prisma.produit.update({
    where: { id },
    data: {
      ...data,
      reference: data.reference || null,
      categorie: data.categorie || null,
      stock: data.stock ?? null,
    },
  });

  revalidatePath("/produits");
  const t = await getT();
  redirect(withToast("/produits", t("products.toastUpdated")));
}

export async function deactivateProduit(id: string) {
  await requireUser();
  await prisma.produit.update({ where: { id }, data: { actif: false } });
  revalidatePath("/produits");
}

export async function activateProduit(id: string) {
  await requireUser();
  await prisma.produit.update({ where: { id }, data: { actif: true } });
  revalidatePath("/produits");
}
