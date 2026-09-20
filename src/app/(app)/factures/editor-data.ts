import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, products, taxRates } from "@/db/schema";
import { getCompany } from "@/lib/company";
import { listPaymentTerms } from "@/lib/payment-terms";
import { listTaxRates } from "@/lib/taxes";
import type { EditorCustomer, EditorProduct } from "./invoice-editor";

/** Données de référence nécessaires à l'éditeur (clients, articles, taux, société). */
export async function loadEditorData(opts: { includeCustomerId?: string } = {}) {
  const [customerRows, productRows, tvaRates, fodecRates, retenueRates, terms, company] = await Promise.all([
    db.select().from(customers).where(eq(customers.isActive, true)).orderBy(asc(customers.name)),
    db.select().from(products).where(eq(products.isActive, true)).orderBy(asc(products.name)),
    listTaxRates(db, { kind: "tva" }),
    listTaxRates(db, { kind: "fodec", activeOnly: true }),
    db.select().from(taxRates).where(eq(taxRates.kind, "retenue")),
    listPaymentTerms(db, { activeOnly: true }),
    getCompany(db),
  ]);

  // Un client désactivé depuis la création du brouillon reste visible dans ce brouillon.
  let allCustomers = customerRows;
  if (opts.includeCustomerId && !customerRows.some((c) => c.id === opts.includeCustomerId)) {
    const [extra] = await db.select().from(customers).where(eq(customers.id, opts.includeCustomerId));
    if (extra) allCustomers = [...customerRows, extra];
  }

  const retenueById = new Map(retenueRates.map((r) => [r.id, r.rate]));
  const editorCustomers: EditorCustomer[] = allCustomers.map((c) => ({
    id: c.id, code: c.code, name: c.name, taxStatus: c.taxStatus, stampExempt: c.stampExempt,
    withholdingRate: c.withholdingApplies && c.withholdingRateId ? (retenueById.get(c.withholdingRateId) ?? null) : null,
    paymentTermId: c.paymentTermId,
  }));
  const editorProducts: EditorProduct[] = productRows.map((p) => ({
    id: p.id, code: p.code, name: p.name, unit: p.unit, unitPrice: p.unitPrice,
    tvaRateId: p.tvaRateId, fodecApplicable: p.fodecApplicable,
  }));

  return {
    customers: editorCustomers,
    products: editorProducts,
    tvaRates: tvaRates.map((r) => ({ id: r.id, code: r.code, label: r.label, rate: r.rate })),
    allTvaRates: tvaRates,
    paymentTerms: terms.map((t) => ({ id: t.id, label: t.label })),
    fodecRate: fodecRates[0]?.rate ?? null,
    company: {
      vatRegistered: company.vatRegistered,
      stampDutyEnabled: company.stampDutyEnabled,
      stampDutyAmount: company.stampDutyAmount,
      withholdingBase: company.withholdingBase,
      withholdingThreshold: company.withholdingThreshold,
    },
  };
}
