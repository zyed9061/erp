import { asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import { paymentTerms, type PaymentTerm } from "@/db/schema";
import { audit } from "./audit";
import { ServiceError, type Actor } from "./errors";

export const paymentTermSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis").max(100),
  days: z.coerce.number().int("Nombre de jours entier").min(0).max(365),
  endOfMonth: z.boolean(),
});

export async function listPaymentTerms(db: Db, opts: { activeOnly?: boolean } = {}) {
  return db
    .select()
    .from(paymentTerms)
    .where(opts.activeOnly ? eq(paymentTerms.isActive, true) : undefined)
    .orderBy(asc(paymentTerms.days), asc(paymentTerms.label));
}

export async function createPaymentTerm(db: Db, actor: Actor, input: z.input<typeof paymentTermSchema>) {
  const data = paymentTermSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: paymentTerms.id }).from(paymentTerms).where(eq(paymentTerms.label, data.label));
    if (existing) throw new ServiceError("Cette condition existe déjà");
    const [created] = await tx.insert(paymentTerms).values(data).returning();
    if (!created) throw new Error("Insertion échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "payment_term.create", entity: "payment_term", entityId: created.id, after: created,
    });
    return created;
  });
}

export async function updatePaymentTerm(
  db: Db,
  actor: Actor,
  id: string,
  patch: { isActive?: boolean; isDefault?: boolean },
): Promise<PaymentTerm> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(paymentTerms).where(eq(paymentTerms.id, id)).for("update");
    if (!before) throw new ServiceError("Condition introuvable");

    const isActive = patch.isActive ?? before.isActive;
    const isDefault = (patch.isDefault ?? before.isDefault) && isActive;
    if (before.isDefault && !isDefault && patch.isDefault === undefined) {
      throw new ServiceError("Choisissez d'abord une autre condition par défaut");
    }
    if (before.isDefault && !isActive) {
      throw new ServiceError("La condition par défaut ne peut pas être désactivée");
    }
    // Une seule condition par défaut : on retire l'ancienne avant de poser la nouvelle.
    if (isDefault && !before.isDefault) {
      await tx.update(paymentTerms).set({ isDefault: false }).where(ne(paymentTerms.id, id));
    }
    const [after] = await tx
      .update(paymentTerms)
      .set({ isActive, isDefault })
      .where(eq(paymentTerms.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "payment_term.update", entity: "payment_term", entityId: id, before, after,
    });
    return after;
  });
}

/** Date d'échéance : émission + N jours, éventuellement reportée à la fin du mois. */
export function computeDueDate(issueDate: Date, term: { days: number; endOfMonth: boolean }): Date {
  const due = new Date(Date.UTC(issueDate.getUTCFullYear(), issueDate.getUTCMonth(), issueDate.getUTCDate() + term.days));
  if (!term.endOfMonth) return due;
  return new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0));
}
