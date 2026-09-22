import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { attribuerCouleur, FAMILLE_PAR_ENTITE, type Entite } from "@/lib/couleur";

// Le verrou (pg_advisory_xact_lock) serialise les attributions de couleur d'une
// section : deux requetes simultanees ne peuvent pas prendre des couleurs proches.
const VERROU_BASE = 7_311_000;
const ENTITES: Entite[] = ["client", "produit", "devis", "avoir", "facture"];

export function estEntite(valeur: unknown): valeur is Entite {
  return typeof valeur === "string" && (ENTITES as string[]).includes(valeur);
}

export async function verrouillerCouleurs(tx: Prisma.TransactionClient, entite: Entite) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_BASE + ENTITES.indexOf(entite)})`;
}

/** Couleurs deja prises dans la section (hors `sauf`, l'element en cours de modification). */
export async function couleursPrises(
  tx: Prisma.TransactionClient,
  entite: Entite,
  sauf?: string,
): Promise<string[]> {
  const where = { couleur: { not: null }, ...(sauf ? { id: { not: sauf } } : {}) };
  const select = { couleur: true } as const;

  const lignes =
    entite === "client"
      ? await tx.client.findMany({ where, select })
      : entite === "produit"
        ? await tx.produit.findMany({ where, select })
        : entite === "devis"
          ? await tx.devis.findMany({ where, select })
          : entite === "avoir"
            ? await tx.avoir.findMany({ where, select })
            : await tx.facture.findMany({ where, select });

  return lignes.map((l) => l.couleur as string);
}

export async function lireCouleur(
  tx: Prisma.TransactionClient,
  entite: Entite,
  id: string,
): Promise<string | null> {
  const where = { id };
  const select = { couleur: true } as const;
  const ligne =
    entite === "client"
      ? await tx.client.findUnique({ where, select })
      : entite === "produit"
        ? await tx.produit.findUnique({ where, select })
        : entite === "devis"
          ? await tx.devis.findUnique({ where, select })
          : entite === "avoir"
            ? await tx.avoir.findUnique({ where, select })
            : await tx.facture.findUnique({ where, select });
  return ligne?.couleur ?? null;
}

export async function ecrireCouleur(
  tx: Prisma.TransactionClient,
  entite: Entite,
  id: string,
  couleur: string,
) {
  const where = { id };
  const data = { couleur };
  if (entite === "client") await tx.client.update({ where, data });
  else if (entite === "produit") await tx.produit.update({ where, data });
  else if (entite === "devis") await tx.devis.update({ where, data });
  else if (entite === "avoir") await tx.avoir.update({ where, data });
  else await tx.facture.update({ where, data });
}

/**
 * Verrouille la section puis renvoie une couleur libre pour un nouvel element.
 * A appeler dans la meme transaction que la creation de l'element.
 */
export async function nouvelleCouleur(
  tx: Prisma.TransactionClient,
  entite: Entite,
  graine: string,
): Promise<string> {
  await verrouillerCouleurs(tx, entite);
  return attribuerCouleur(FAMILLE_PAR_ENTITE[entite], await couleursPrises(tx, entite), graine);
}

/** Couleurs des autres elements de la section (pour griser le selecteur d'un element). */
export async function couleursDesAutres(entite: Entite, id: string): Promise<string[]> {
  return couleursPrises(prisma, entite, id);
}
