import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import { PRODUCT_TYPES, products, taxRates, type Product } from "@/db/schema";
import { audit } from "./audit";
import { ServiceError, type Actor } from "./errors";
import { amountSchema } from "./money";
import { nextDocumentNumber } from "./numbering";
import { optText } from "./validation";

export const productSchema = z.object({
  type: z.enum(PRODUCT_TYPES),
  name: z.string().trim().min(1, "Désignation requise").max(200),
  description: optText(2000),
  unit: z.string().trim().min(1, "Unité requise").max(30),
  unitPrice: amountSchema,
  tvaRateId: z.string().uuid("Choisissez un taux de TVA"),
  fodecApplicable: z.boolean().default(false),
});
export type ProductInput = z.input<typeof productSchema>;

type Executor = Pick<Db, "select">;

async function checkTvaRate(tx: Executor, tvaRateId: string, currentRateId?: string) {
  const [rate] = await tx.select().from(taxRates).where(eq(taxRates.id, tvaRateId));
  if (!rate || rate.kind !== "tva") throw new ServiceError("Le taux choisi n'est pas un taux de TVA");
  // Un taux désactivé reste toléré sur un produit qui l'utilise déjà.
  if (!rate.isActive && tvaRateId !== currentRateId) throw new ServiceError("Ce taux de TVA est inactif");
}

const escapeLike = (q: string) => q.replace(/[\\%_]/g, "\\$&");

export async function listProducts(
  db: Db,
  opts: { q?: string; includeInactive?: boolean; page?: number; pageSize?: number } = {},
) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const where = and(
    opts.includeInactive ? undefined : eq(products.isActive, true),
    q
      ? or(ilike(products.name, `%${escapeLike(q)}%`), ilike(products.code, `%${escapeLike(q)}%`))
      : undefined,
  );
  const [rows, [count]] = await Promise.all([
    db
      .select({ product: products, tvaRate: taxRates.rate, tvaLabel: taxRates.label })
      .from(products)
      .innerJoin(taxRates, eq(taxRates.id, products.tvaRateId))
      .where(where)
      .orderBy(asc(products.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(where),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize };
}

export async function getProduct(db: Db, id: string) {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row ?? null;
}

export async function createProduct(
  db: Db,
  actor: Actor,
  input: ProductInput & { code?: string },
): Promise<Product> {
  const data = productSchema.parse(input);
  const requestedCode = input.code?.trim().toUpperCase() || null;

  return db.transaction(async (tx) => {
    await checkTvaRate(tx, data.tvaRateId);
    let code = requestedCode;
    if (code) {
      const [dup] = await tx.select({ id: products.id }).from(products).where(eq(products.code, code));
      if (dup) throw new ServiceError("Ce code article existe déjà");
    } else {
      code = (await nextDocumentNumber(tx, "product")).number;
    }
    const [created] = await tx.insert(products).values({ ...data, code }).returning();
    if (!created) throw new Error("Insertion de l'article échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "product.create", entity: "product", entityId: created.id, after: created,
    });
    return created;
  });
}

export async function updateProduct(db: Db, actor: Actor, id: string, input: ProductInput) {
  const data = productSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
    if (!before) throw new ServiceError("Article introuvable");
    await checkTvaRate(tx, data.tvaRateId, before.tvaRateId);
    const [after] = await tx
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour de l'article échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "product.update", entity: "product", entityId: id, before, after,
    });
    return after;
  });
}

export async function setProductActive(db: Db, actor: Actor, id: string, isActive: boolean) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
    if (!before) throw new ServiceError("Article introuvable");
    const [after] = await tx
      .update(products)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: isActive ? "product.activate" : "product.deactivate",
      entity: "product", entityId: id, before, after,
    });
    return after;
  });
}
