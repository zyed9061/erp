import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import {
  CUSTOMER_TAX_STATUSES,
  CUSTOMER_TYPES,
  customerContacts,
  customers,
  paymentTerms,
  taxRates,
  type Customer,
} from "@/db/schema";
import { audit } from "./audit";
import { ServiceError, type Actor } from "./errors";
import { nextDocumentNumber } from "./numbering";
import { optEmail, optMatricule, optText, optUuid } from "./validation";

export const customerSchema = z.object({
  type: z.enum(CUSTOMER_TYPES),
  name: z.string().trim().min(1, "Nom requis").max(200),
  matriculeFiscal: optMatricule,
  taxStatus: z.enum(CUSTOMER_TAX_STATUSES),
  address: optText(300),
  city: optText(100),
  postalCode: optText(20),
  country: z.string().trim().min(2).max(2).toUpperCase().default("TN"),
  phone: optText(40),
  email: optEmail,
  paymentTermId: optUuid,
  stampExempt: z.boolean().default(false),
  withholdingApplies: z.boolean().default(false),
  withholdingRateId: optUuid,
  notes: optText(2000),
});
export type CustomerInput = z.input<typeof customerSchema>;

type Executor = Pick<Db, "select">;

/** Règles métier qui dépendent d'autres tables ou de plusieurs champs. */
async function checkRules(tx: Executor, data: z.output<typeof customerSchema>) {
  // Le matricule fiscal du client est obligatoire pour une entreprise assujettie (art. 18 du code de la TVA).
  if (data.type === "entreprise" && data.taxStatus === "assujetti" && !data.matriculeFiscal) {
    throw new ServiceError("Le matricule fiscal est obligatoire pour une entreprise assujettie à la TVA");
  }
  if (data.withholdingApplies) {
    if (!data.withholdingRateId) throw new ServiceError("Choisissez le taux de retenue à la source");
    const [rate] = await tx.select().from(taxRates).where(eq(taxRates.id, data.withholdingRateId));
    if (!rate || rate.kind !== "retenue" || !rate.isActive) {
      throw new ServiceError("Taux de retenue à la source invalide ou inactif");
    }
  } else if (data.withholdingRateId) {
    data.withholdingRateId = null;
  }
  if (data.paymentTermId) {
    const [term] = await tx.select().from(paymentTerms).where(eq(paymentTerms.id, data.paymentTermId));
    if (!term || !term.isActive) throw new ServiceError("Condition de paiement invalide ou inactive");
  }
}

const escapeLike = (q: string) => q.replace(/[\\%_]/g, "\\$&");

export async function listCustomers(
  db: Db,
  opts: { q?: string; includeInactive?: boolean; page?: number; pageSize?: number } = {},
) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const where = and(
    opts.includeInactive ? undefined : eq(customers.isActive, true),
    q
      ? or(
          ilike(customers.name, `%${escapeLike(q)}%`),
          ilike(customers.code, `%${escapeLike(q)}%`),
          ilike(customers.matriculeFiscal, `%${escapeLike(q)}%`),
          ilike(customers.email, `%${escapeLike(q)}%`),
        )
      : undefined,
  );
  const [rows, [count]] = await Promise.all([
    db.select().from(customers).where(where).orderBy(asc(customers.name)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize };
}

export async function getCustomer(db: Db, id: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return null;
  const contacts = await db
    .select()
    .from(customerContacts)
    .where(eq(customerContacts.customerId, id))
    .orderBy(asc(customerContacts.name));
  return { customer, contacts };
}

export async function createCustomer(
  db: Db,
  actor: Actor,
  input: CustomerInput & { code?: string },
): Promise<Customer> {
  const data = customerSchema.parse(input);
  const requestedCode = input.code?.trim().toUpperCase() || null;

  return db.transaction(async (tx) => {
    await checkRules(tx, data);
    if (!data.paymentTermId) {
      const [def] = await tx.select().from(paymentTerms).where(eq(paymentTerms.isDefault, true));
      data.paymentTermId = def?.id ?? null;
    }
    let code = requestedCode;
    if (code) {
      const [dup] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.code, code));
      if (dup) throw new ServiceError("Ce code client existe déjà");
    } else {
      code = (await nextDocumentNumber(tx, "customer")).number;
    }
    const [created] = await tx.insert(customers).values({ ...data, code }).returning();
    if (!created) throw new Error("Insertion du client échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "customer.create", entity: "customer", entityId: created.id, after: created,
    });
    return created;
  });
}

export async function updateCustomer(db: Db, actor: Actor, id: string, input: CustomerInput) {
  const data = customerSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(eq(customers.id, id)).for("update");
    if (!before) throw new ServiceError("Client introuvable");
    await checkRules(tx, data);
    const [after] = await tx
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour du client échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "customer.update", entity: "customer", entityId: id, before, after,
    });
    return after;
  });
}

/** Pas de suppression : un client sera référencé par des factures. On le désactive. */
export async function setCustomerActive(db: Db, actor: Actor, id: string, isActive: boolean) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(eq(customers.id, id)).for("update");
    if (!before) throw new ServiceError("Client introuvable");
    const [after] = await tx
      .update(customers)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: isActive ? "customer.activate" : "customer.deactivate",
      entity: "customer", entityId: id, before, after,
    });
    return after;
  });
}

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  email: optEmail,
  phone: optText(40),
  role: optText(80),
  isBilling: z.boolean().default(false),
});

export async function addContact(db: Db, actor: Actor, customerId: string, input: z.input<typeof contactSchema>) {
  const data = contactSchema.parse(input);
  return db.transaction(async (tx) => {
    const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
    if (!customer) throw new ServiceError("Client introuvable");
    const [created] = await tx.insert(customerContacts).values({ ...data, customerId }).returning();
    if (!created) throw new Error("Insertion du contact échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "customer_contact.create", entity: "customer", entityId: customerId, after: created,
    });
    return created;
  });
}

export async function removeContact(db: Db, actor: Actor, contactId: string) {
  return db.transaction(async (tx) => {
    const [removed] = await tx.delete(customerContacts).where(eq(customerContacts.id, contactId)).returning();
    if (!removed) throw new ServiceError("Contact introuvable");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "customer_contact.delete", entity: "customer", entityId: removed.customerId, before: removed,
    });
    return removed;
  });
}
