import { prisma } from "@/lib/prisma";

/**
 * Seules operations Prisma autorisees pour l'assistant IA. Toute autre
 * operation (create, update, delete, upsert, ...) est rejetee avant d'atteindre
 * la base, meme si un outil tentait de l'appeler.
 */
export const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

export class ReadOnlyViolationError extends Error {
  constructor(model: string | undefined, operation: string) {
    super(`Operation "${operation}" interdite sur ${model ?? "la base"} : l'assistant IA est en lecture seule.`);
    this.name = "ReadOnlyViolationError";
  }
}

const readOnlyClient = prisma.$extends({
  name: "ai-read-only",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!READ_OPERATIONS.has(operation)) {
          throw new ReadOnlyViolationError(model, operation);
        }
        return query(args);
      },
    },
  },
});

/**
 * Acces base de donnees de l'assistant IA : uniquement les modeles metier
 * necessaires, sans `user` (mots de passe), sans `$executeRaw`/`$queryRaw`
 * ni `$transaction`, et avec le garde-fou lecture seule ci-dessus.
 */
export const aiDb = {
  facture: readOnlyClient.facture,
  ligneFacture: readOnlyClient.ligneFacture,
  paiement: readOnlyClient.paiement,
  devis: readOnlyClient.devis,
  avoir: readOnlyClient.avoir,
  client: readOnlyClient.client,
  produit: readOnlyClient.produit,
  companyProfile: readOnlyClient.companyProfile,
};

export type AiDb = typeof aiDb;
