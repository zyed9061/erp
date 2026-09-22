// Attribue une couleur unique (famille de la section) aux elements qui n'en ont pas encore
// (clients, produits, devis, avoirs, factures). Idempotent.
// Usage : npx tsx prisma/backfill-couleurs.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { attribuerCouleur, FAMILLE_PAR_ENTITE, type Entite } from "../src/lib/couleur";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type Ligne = { id: string; couleur: string | null };

async function colorier(
  entite: Entite,
  lignes: Ligne[],
  ecrire: (id: string, couleur: string) => Promise<unknown>,
) {
  const prises = lignes.flatMap((l) => (l.couleur ? [l.couleur] : []));
  let attribuees = 0;
  for (const ligne of lignes.filter((l) => !l.couleur)) {
    const couleur = attribuerCouleur(FAMILLE_PAR_ENTITE[entite], prises, ligne.id);
    await ecrire(ligne.id, couleur);
    prises.push(couleur);
    attribuees++;
  }
  console.log(`${entite}: ${attribuees} colorie(s) sur ${lignes.length}`);
}

async function main() {
  const orderBy = { createdAt: "asc" } as const;
  const select = { id: true, couleur: true } as const;

  await colorier("client", await prisma.client.findMany({ select, orderBy }), (id, couleur) =>
    prisma.client.update({ where: { id }, data: { couleur } }),
  );
  await colorier("produit", await prisma.produit.findMany({ select, orderBy }), (id, couleur) =>
    prisma.produit.update({ where: { id }, data: { couleur } }),
  );
  await colorier("devis", await prisma.devis.findMany({ select, orderBy }), (id, couleur) =>
    prisma.devis.update({ where: { id }, data: { couleur } }),
  );
  await colorier("avoir", await prisma.avoir.findMany({ select, orderBy }), (id, couleur) =>
    prisma.avoir.update({ where: { id }, data: { couleur } }),
  );
  await colorier("facture", await prisma.facture.findMany({ select, orderBy }), (id, couleur) =>
    prisma.facture.update({ where: { id }, data: { couleur } }),
  );
}

main().finally(() => prisma.$disconnect());
