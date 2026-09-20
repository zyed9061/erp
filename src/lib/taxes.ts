import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import { TAX_KINDS, taxRates, type TaxKind, type TaxRate } from "@/db/schema";
import { audit } from "./audit";
import { ServiceError, type Actor } from "./errors";

export const percentSchema = z.string().transform((value, ctx) => {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  const m = /^(\d{1,3})(?:\.(\d{1,3}))?$/.exec(cleaned);
  const n = m ? Number(cleaned) : NaN;
  if (!m || n < 0 || n > 100) {
    ctx.addIssue({ code: "custom", message: "Taux invalide (0 à 100, 3 décimales maximum)" });
    return z.NEVER;
  }
  return `${m[1]}.${(m[2] ?? "").padEnd(3, "0")}`;
});

export const createTaxRateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "Code : 2 à 20 caractères (lettres, chiffres, - _)"),
  label: z.string().trim().min(1, "Libellé requis").max(100),
  kind: z.enum(TAX_KINDS),
  rate: percentSchema,
});

export async function listTaxRates(db: Db, opts: { kind?: TaxKind; activeOnly?: boolean } = {}) {
  const conditions = [
    opts.kind ? eq(taxRates.kind, opts.kind) : undefined,
    opts.activeOnly ? eq(taxRates.isActive, true) : undefined,
  ].filter((c) => c !== undefined);
  return db
    .select()
    .from(taxRates)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(taxRates.kind), asc(taxRates.code));
}

export async function createTaxRate(db: Db, actor: Actor, input: z.input<typeof createTaxRateSchema>) {
  const data = createTaxRateSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: taxRates.id }).from(taxRates).where(eq(taxRates.code, data.code));
    if (existing) throw new ServiceError("Ce code de taux existe déjà");
    const [created] = await tx.insert(taxRates).values(data).returning();
    if (!created) throw new Error("Insertion du taux échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "tax_rate.create", entity: "tax_rate", entityId: created.id, after: created,
    });
    return created;
  });
}

/** Seuls le libellé et l'état actif sont modifiables : le taux est immuable (trigger en base). */
export async function updateTaxRate(
  db: Db,
  actor: Actor,
  id: string,
  patch: { label?: string; isActive?: boolean },
): Promise<TaxRate> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(taxRates).where(eq(taxRates.id, id)).for("update");
    if (!before) throw new ServiceError("Taux introuvable");
    const label = patch.label?.trim() || before.label;
    const [after] = await tx
      .update(taxRates)
      .set({ label, isActive: patch.isActive ?? before.isActive })
      .where(eq(taxRates.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour du taux échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "tax_rate.update", entity: "tax_rate", entityId: id, before, after,
    });
    return after;
  });
}
