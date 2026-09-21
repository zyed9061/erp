import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { listTaxRates } from "@/lib/taxes";

export async function loadProjectEditorData(opts: { includeCustomerId?: string } = {}) {
  const [customerRows, rates] = await Promise.all([
    db.select().from(customers).where(eq(customers.isActive, true)).orderBy(asc(customers.name)),
    listTaxRates(db, { kind: "tva" }),
  ]);
  let all = customerRows;
  if (opts.includeCustomerId && !all.some((c) => c.id === opts.includeCustomerId)) {
    const [extra] = await db.select().from(customers).where(eq(customers.id, opts.includeCustomerId));
    if (extra) all = [...all, extra];
  }
  return {
    customers: all.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    tvaRates: rates.filter((r) => r.isActive).map((r) => ({ id: r.id, code: r.code, label: r.label, rate: r.rate })),
    allTvaRates: rates,
  };
}
