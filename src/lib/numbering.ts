import { prisma } from "@/lib/prisma";
import { DocumentType } from "@/generated/prisma/enums";

const PREFIXES: Record<DocumentType, string> = {
  DEVIS: "DEV",
  FACTURE: "FAC",
  AVOIR: "AV",
};

/**
 * Attribue le prochain numero sequentiel (sans trou) pour un type de document
 * et une annee donnes. L'incrementation atomique via SQL evite les doublons
 * en cas de creations concurrentes.
 */
export async function nextDocumentNumber(type: DocumentType, annee: number): Promise<string> {
  const rows = await prisma.$queryRaw<{ dernierNumero: number }[]>`
    INSERT INTO numbering_sequences (id, type, annee, "dernierNumero")
    VALUES (gen_random_uuid()::text, ${type}::"DocumentType", ${annee}, 1)
    ON CONFLICT (type, annee)
    DO UPDATE SET "dernierNumero" = numbering_sequences."dernierNumero" + 1
    RETURNING "dernierNumero"
  `;

  const numero = rows[0].dernierNumero;
  const prefix = PREFIXES[type];
  return `${prefix}-${annee}-${String(numero).padStart(4, "0")}`;
}
