"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { withToast } from "@/lib/toastRedirect";
import { getT } from "@/i18n/server";

function parseFormData(formData: FormData) {
  return {
    nom: String(formData.get("nom") ?? ""),
    matriculeFiscal: (formData.get("matriculeFiscal") as string) || null,
    adresse: (formData.get("adresse") as string) || null,
    ville: (formData.get("ville") as string) || null,
    codePostal: (formData.get("codePostal") as string) || null,
    pays: (formData.get("pays") as string) || "Tunisie",
    telephone: (formData.get("telephone") as string) || null,
    email: (formData.get("email") as string) || null,
    devise: (formData.get("devise") as string) || "TND",
    tauxTimbreFiscal: Number(formData.get("tauxTimbreFiscal") ?? 1),
  };
}

export async function updateCompanyProfile(formData: FormData) {
  await requireUser();
  const data = parseFormData(formData);

  const existing = await prisma.companyProfile.findFirst();
  if (existing) {
    await prisma.companyProfile.update({ where: { id: existing.id }, data });
  } else {
    await prisma.companyProfile.create({ data });
  }

  revalidatePath("/parametres");
  const t = await getT();
  redirect(withToast("/parametres", t("settings.toastSaved")));
}
