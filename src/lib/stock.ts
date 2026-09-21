import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import { products, stockMovements, type Product, type StockMovement } from "@/db/schema";
import { audit } from "./audit";
import { todayTunis } from "./dates";
import { ServiceError, type Actor } from "./errors";
import { fromMilli, signedAmountSchema, toMilli } from "./money";
import { dateString, type Tx } from "./invoicing/invoices";
import { optText } from "./validation";

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Stock disponible d'un produit : somme des mouvements signés du registre. */
export async function stockOnHand(db: Pick<Db, "select">, productId: string): Promise<string> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)::text` })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));
  return fromMilli(toMilli(row?.total ?? "0"));
}

export type StockLevel = { product: Product; onHand: string; outOfStock: boolean; low: boolean };

export async function listStock(
  db: Db,
  opts: { q?: string; lowOnly?: boolean; page?: number; pageSize?: number } = {},
) {
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
  // Colonne qualifiée à la main : sans jointure, Drizzle n'écrit pas le préfixe de table dans un fragment SQL brut,
  // et `id` se résoudrait alors au mouvement de stock au lieu du produit.
  const onHandSql = sql<string>`coalesce((select sum(m.quantity) from stock_movements m where m.product_id = products.id), 0)::text`;
  const where = and(
    eq(products.trackStock, true),
    eq(products.isActive, true),
    like ? or(ilike(products.name, like), ilike(products.code, like)) : undefined,
  );
  const rows = await db
    .select({ product: products, onHand: onHandSql })
    .from(products)
    .where(where)
    .orderBy(asc(products.name));

  const levels: StockLevel[] = rows.map((r) => {
    const onHand = fromMilli(toMilli(r.onHand));
    const min = toMilli(r.product.minStock);
    return { product: r.product, onHand, outOfStock: toMilli(onHand) <= 0n, low: min > 0n && toMilli(onHand) <= min };
  });
  const filtered = opts.lowOnly ? levels.filter((l) => l.low || l.outOfStock) : levels;
  return { rows: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
}

export async function listMovements(db: Db, productId: string, opts: { page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.occurredOn), desc(stockMovements.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/**
 * Applique un mouvement (quantité signée) sous verrou sur le produit : le stock ne peut jamais devenir
 * négatif, même avec deux sorties simultanées. À appeler dans la transaction de l'opération qui l'exige.
 */
export async function applyMovement(
  tx: Tx,
  actor: Actor | null,
  m: {
    productId: string;
    type: StockMovement["type"];
    quantity: string;
    occurredOn: string;
    reference?: string | null;
    notes?: string | null;
    deliveryNoteId?: string | null;
  },
): Promise<StockMovement> {
  const [product] = await tx.select().from(products).where(eq(products.id, m.productId)).for("update");
  if (!product) throw new ServiceError("Produit introuvable");
  if (!product.trackStock) throw new ServiceError(`« ${product.name} » n'est pas suivi en stock`);

  const delta = toMilli(m.quantity);
  const onHand = toMilli(await stockOnHand(tx, m.productId));
  if (onHand + delta < 0n) {
    throw new ServiceError(
      `Stock insuffisant pour « ${product.name} » : ${fromMilli(onHand)} disponible(s), ${fromMilli(-delta)} demandé(s)`,
    );
  }
  const [created] = await tx
    .insert(stockMovements)
    .values({
      productId: m.productId, type: m.type, quantity: fromMilli(delta), occurredOn: m.occurredOn,
      reference: m.reference ?? null, notes: m.notes ?? null, deliveryNoteId: m.deliveryNoteId ?? null,
      createdBy: actor?.id ?? null,
    })
    .returning();
  if (!created) throw new Error("Mouvement de stock non enregistré");
  await audit(tx, {
    userId: actor?.id ?? null, userEmail: actor?.email ?? "système", ip: actor?.ip,
    action: `stock.${m.type}`, entity: "product", entityId: m.productId,
    after: { quantity: created.quantity, reference: m.reference ?? null, onHandAfter: fromMilli(onHand + delta) },
  });
  return created;
}

export const movementSchema = z.object({
  productId: z.string().uuid("Choisissez un produit"),
  type: z.enum(["entry", "exit", "adjustment"]),
  quantity: signedAmountSchema,
  occurredOn: dateString.optional(),
  reference: optText(100),
  notes: optText(500),
});
export type MovementInput = z.input<typeof movementSchema>;

/**
 * Saisie manuelle : entrée (réception), sortie (casse, consommation interne) ou ajustement d'inventaire.
 * Entrée et sortie prennent une quantité positive ; un ajustement est signé et exige un motif.
 */
export async function addStockMovement(db: Db, actor: Actor, input: MovementInput): Promise<StockMovement> {
  const data = movementSchema.parse(input);
  const q = toMilli(data.quantity);
  if (q === 0n) throw new ServiceError("La quantité ne peut pas être nulle");
  if (data.type !== "adjustment" && q < 0n) throw new ServiceError("Saisissez une quantité positive (le sens est donné par le type)");
  if (data.type === "adjustment" && (data.notes ?? "").length < 3) {
    throw new ServiceError("Indiquez le motif de l'ajustement (inventaire, correction…)");
  }
  const signed = data.type === "exit" ? -q : q;

  return db.transaction((tx) =>
    applyMovement(tx, actor, {
      productId: data.productId, type: data.type, quantity: fromMilli(signed),
      occurredOn: data.occurredOn ?? todayTunis(), reference: data.reference, notes: data.notes,
    }),
  );
}
