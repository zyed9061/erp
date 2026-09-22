"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  couleurTropProche,
  estCouleurValide,
  FAMILLE_PAR_ENTITE,
  normaliserHex,
  type Entite,
} from "@/lib/couleur";
import {
  couleursPrises,
  ecrireCouleur,
  estEntite,
  verrouillerCouleurs,
} from "@/lib/couleurs-serveur";

export type CouleurState = { ok?: boolean; error?: string };

const CHEMINS: Record<Entite, string> = {
  client: "/clients",
  produit: "/produits",
  devis: "/devis",
  avoir: "/avoirs",
  facture: "/factures",
};

/**
 * Change la couleur d'un element. Refuse toute couleur hors de la famille de la
 * section, deja prise par un autre element ou trop proche de la sienne.
 */
export async function changerCouleur(
  entite: Entite,
  id: string,
  _etat: CouleurState,
  formData: FormData,
): Promise<CouleurState> {
  await requireUser();
  if (!estEntite(entite)) return { error: "Element inconnu." };

  const famille = FAMILLE_PAR_ENTITE[entite];
  const couleur = normaliserHex(String(formData.get("couleur") ?? ""));

  if (!estCouleurValide(famille, couleur)) {
    return { error: "Choisissez une couleur de la palette." };
  }

  const resultat = await prisma.$transaction(async (tx) => {
    await verrouillerCouleurs(tx, entite);
    if (couleurTropProche(famille, couleur, await couleursPrises(tx, entite, id))) {
      return { error: "Cette couleur est deja utilisee ou trop proche d'une autre." };
    }
    await ecrireCouleur(tx, entite, id, couleur);
    return { ok: true };
  });

  if (resultat.ok) {
    revalidatePath(CHEMINS[entite]);
    revalidatePath(`${CHEMINS[entite]}/${id}`);
  }
  return resultat;
}
