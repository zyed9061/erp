import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, products } from "@/db/schema";
import { fromMilli, toMilli } from "@/lib/money";
import type { DeliveryCustomer, DeliveryProduct } from "./delivery-editor";

/** Clients actifs et biens actifs (avec leur stock) pour l'éditeur de bon de livraison. */
export async function loadDeliveryEditorData(opts: { includeCustomerId?: string } = {}) {
  const [customerRows, productRows] = await Promise.all([
    db.select().from(customers).where(eq(customers.isActive, true)).orderBy(asc(customers.name)),
    db
      .select({
        product: products,
        onHand: sql<string>`coalesce((select sum(m.quantity) from stock_movements m where m.product_id = products.id), 0)::text`,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.name)),
  ]);
  let all = customerRows;
  if (opts.includeCustomerId && !all.some((c) => c.id === opts.includeCustomerId)) {
    const [extra] = await db.select().from(customers).where(eq(customers.id, opts.includeCustomerId));
    if (extra) all = [...all, extra];
  }
  const editorCustomers: DeliveryCustomer[] = all.map((c) => ({ id: c.id, code: c.code, name: c.name }));
  const editorProducts: DeliveryProduct[] = productRows
    .filter((r) => r.product.type === "bien")
    .map((r) => ({
      id: r.product.id, code: r.product.code, name: r.product.name, unit: r.product.unit, unitPrice: r.product.unitPrice,
      trackStock: r.product.trackStock, onHand: r.product.trackStock ? fromMilli(toMilli(r.onHand)) : null,
    }));
  return { customers: editorCustomers, products: editorProducts };
}
