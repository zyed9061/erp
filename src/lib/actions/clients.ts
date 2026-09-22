"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { clientSchema } from "@/lib/validations/client";
import { lireCouleur, nouvelleCouleur } from "@/lib/couleurs-serveur";

function parseFormData(formData: FormData) {
  return {
    type: formData.get("type"),
    nom: formData.get("nom"),
    matriculeFiscal: formData.get("matriculeFiscal"),
    email: formData.get("email"),
    telephone: formData.get("telephone"),
    adresse: formData.get("adresse"),
    ville: formData.get("ville"),
    codePostal: formData.get("codePostal"),
    pays: formData.get("pays") || "Tunisie",
    notes: formData.get("notes"),
  };
}

export async function createClient(formData: FormData) {
  await requireUser();
  const data = clientSchema.parse(parseFormData(formData));

  await prisma.$transaction(async (tx) => {
    const couleur = await nouvelleCouleur(tx, "client", `${data.nom}${Date.now()}`);
    await tx.client.create({ data: { ...data, couleur } });
  });

  revalidatePath("/clients");
  redirect("/clients");
}

export async function updateClient(id: string, formData: FormData) {
  await requireUser();
  const data = clientSchema.parse(parseFormData(formData));

  await prisma.$transaction(async (tx) => {
    // Client cree avant l'introduction des couleurs : on lui en attribue une maintenant.
    const couleur = (await lireCouleur(tx, "client", id)) ?? (await nouvelleCouleur(tx, "client", id));
    await tx.client.update({ where: { id }, data: { ...data, couleur } });
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect("/clients");
}

export async function deactivateClient(id: string) {
  await requireUser();
  await prisma.client.update({ where: { id }, data: { actif: false } });
  revalidatePath("/clients");
}
