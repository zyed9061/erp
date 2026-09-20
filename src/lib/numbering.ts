import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import { documentCounters, documentSeriesConfig, type DocType } from "@/db/schema";
import { audit } from "./audit";
import { ServiceError, type Actor } from "./errors";

type Executor = Pick<Db, "select" | "insert">;

const tunisYear = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric" });

export function fiscalYearOf(date: Date): number {
  return Number(tunisYear.format(date));
}

export function formatDocumentNumber(
  cfg: { prefix: string; padLength: number; resetYearly: boolean },
  fiscalYear: number,
  sequence: number,
): string {
  const seq = String(sequence).padStart(cfg.padLength, "0");
  return cfg.resetYearly ? `${cfg.prefix}-${fiscalYear}-${seq}` : `${cfg.prefix}-${seq}`;
}

/**
 * Attribue le prochain numéro d'un type de document, SANS TROU.
 *
 * À appeler UNIQUEMENT dans la transaction qui valide le document : l'incrément
 * prend un verrou de ligne jusqu'au COMMIT, ce qui sérialise les validations
 * concurrentes de la même série, et un ROLLBACK restitue le numéro. Une SEQUENCE
 * PostgreSQL ne le ferait pas (elle laisse des trous après un rollback).
 */
export async function nextDocumentNumber(
  tx: Executor,
  docType: DocType,
  date: Date = new Date(),
): Promise<{ number: string; sequence: number; fiscalYear: number }> {
  const [cfg] = await tx
    .select()
    .from(documentSeriesConfig)
    .where(eq(documentSeriesConfig.docType, docType));
  if (!cfg) throw new ServiceError(`Numérotation non configurée pour « ${docType} »`);

  const fiscalYear = fiscalYearOf(date);
  // Numérotation continue : un seul compteur (année 0) pour toutes les années.
  const counterYear = cfg.resetYearly ? fiscalYear : 0;
  const [counter] = await tx
    .insert(documentCounters)
    .values({ docType, fiscalYear: counterYear, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [documentCounters.docType, documentCounters.fiscalYear],
      set: { lastNumber: sql`${documentCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: documentCounters.lastNumber });
  if (!counter) throw new Error("Compteur de numérotation indisponible");

  return {
    number: formatDocumentNumber(cfg, fiscalYear, counter.lastNumber),
    sequence: counter.lastNumber,
    fiscalYear,
  };
}

export const seriesConfigSchema = z.object({
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,10}$/, "Préfixe : 1 à 10 caractères (lettres, chiffres, tiret)"),
  padLength: z.coerce.number().int().min(1).max(12),
  resetYearly: z.boolean(),
});

export async function listSeriesConfigs(db: Db) {
  return db.select().from(documentSeriesConfig).orderBy(asc(documentSeriesConfig.docType));
}

/**
 * Modifie le format de numérotation. Dès qu'un numéro a été attribué, le préfixe et la
 * remise à zéro annuelle sont verrouillés (la série doit rester ininterrompue) et la
 * largeur ne peut plus que croître.
 */
export async function updateSeriesConfig(
  db: Db,
  actor: Actor,
  docType: DocType,
  input: z.input<typeof seriesConfigSchema>,
) {
  const data = seriesConfigSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(documentSeriesConfig)
      .where(eq(documentSeriesConfig.docType, docType))
      .for("update");
    if (!before) throw new ServiceError("Série introuvable");

    const [used] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(documentCounters)
      .where(eq(documentCounters.docType, docType));
    if ((used?.n ?? 0) > 0) {
      if (data.prefix !== before.prefix || data.resetYearly !== before.resetYearly) {
        throw new ServiceError(
          "Des numéros ont déjà été attribués : le préfixe et la remise à zéro annuelle ne sont plus modifiables",
        );
      }
      if (data.padLength < before.padLength) {
        throw new ServiceError("La largeur du numéro ne peut plus être réduite");
      }
    }

    const [after] = await tx
      .update(documentSeriesConfig)
      .set(data)
      .where(eq(documentSeriesConfig.docType, docType))
      .returning();
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "series.update", entity: "series", entityId: docType, before, after,
    });
    return after;
  });
}
