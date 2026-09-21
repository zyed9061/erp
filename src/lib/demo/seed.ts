import { eq } from "drizzle-orm";
import type { Db } from "@/db/types";
import { customers, users } from "@/db/schema";
import { updateCompany, getCompany } from "../company";
import { createCustomer } from "../customers";
import { createProduct } from "../products";
import { createTaxRate, listTaxRates } from "../taxes";
import { createUser } from "../users";
import { todayTunis } from "../dates";
import { createCreditNoteDraft, createDraftInvoice, validateDocument, type InvoiceLineInput } from "../invoicing/invoices";
import { recordPayment } from "../invoicing/payments";
import { createDraftQuote, sendQuote } from "../invoicing/quotes";
import { submitToTtn } from "../einvoice/submission";
import { DEMO_ACCOUNTS } from "./accounts";

/**
 * Données de DÉMONSTRATION entièrement fictives (société, clients, produits, documents, paiements). Rien de réel : les
 * matricules fiscaux, adresses, téléphones et RIB sont inventés. Idempotent : ne fait rien si la démonstration existe déjà.
 */
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const DEMO_COMPANY_NAME = "ACME DEMO SARL (données fictives)";

export async function seedDemoData(db: Db): Promise<{ seeded: boolean }> {
  const company = await getCompany(db);
  if (company.legalName === DEMO_COMPANY_NAME) return { seeded: false };
  // Ne jamais écraser de vraies données : la démonstration ne s'installe que sur une base sans client.
  const [anyCustomer] = await db.select({ id: customers.id }).from(customers).limit(1);
  if (anyCustomer) throw new Error("Cette base contient déjà des clients : la démonstration n'y est pas installée.");

  // --- Comptes -----------------------------------------------------------------------------------------------------
  for (const a of DEMO_ACCOUNTS) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, a.email));
    if (!existing) await createUser(db, null, { email: a.email, name: a.name, role: a.role, password: a.password });
  }
  const [admin] = await db.select().from(users).where(eq(users.email, DEMO_ACCOUNTS[0]!.email));
  const actor = { id: admin!.id, email: admin!.email };

  // --- Société fictive -------------------------------------------------------------------------------------------------
  await updateCompany(db, actor, {
    legalName: DEMO_COMPANY_NAME, tradeName: "ACME DEMO", matriculeFiscal: "0000000A/A/M/000", legalForm: "SARL", capital: "10000",
    address: "1 rue de la Démonstration", city: "Tunis", postalCode: "1000", phone: "00 000 000", email: "contact@acme-demo.test",
    bankName: "Banque de démonstration", rib: "00 000 0000000000000 00 (FICTIF)",
    taxRegime: "reel", vatRegistered: true, stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
  });

  const rates = Object.fromEntries((await listTaxRates(db)).map((r) => [r.code, r.id]));
  const tva19 = rates.TVA19!;
  const ras = await createTaxRate(db, actor, { code: "RAS-DEMO", label: "Retenue à la source (DÉMO 1,5 %)", kind: "retenue", rate: "1.5" });

  // --- Clients fictifs -----------------------------------------------------------------------------------------------------
  const mk = (over: Record<string, unknown>) => createCustomer(db, actor, {
    type: "entreprise", taxStatus: "assujetti", country: "TN", ...over,
  } as Parameters<typeof createCustomer>[2]).then((c) => c.id);
  const alpha = await mk({ name: "Client Démo Alpha SARL", matriculeFiscal: "1111111A/A/M/000", address: "10 avenue de la Liberté", city: "Sfax", postalCode: "3000", email: "compta@alpha-demo.test" });
  const beta = await mk({ name: "Client Démo Beta SA", matriculeFiscal: "2222222B/A/M/000", address: "25 rue du Lac", city: "Sousse", postalCode: "4000", email: "achats@beta-demo.test", withholdingApplies: true, withholdingRateId: ras.id });
  const reject = await mk({ name: "Client Démo REJET-DEMO SARL", matriculeFiscal: "3333333C/A/M/000", address: "3 impasse du Refus", city: "Bizerte", postalCode: "7000", email: "refus@rejet-demo.test" });
  await mk({ type: "particulier", taxStatus: "non_assujetti", name: "Client Démo Particulier", address: "7 rue des Jasmins", city: "Nabeul", postalCode: "8000" });

  // --- Produits fictifs ---------------------------------------------------------------------------------------------------
  const conseil = await createProduct(db, actor, { type: "service", name: "Prestation de conseil (démo)", unit: "h", unitPrice: "120", tvaRateId: tva19 });
  const licence = await createProduct(db, actor, { type: "service", name: "Licence logicielle annuelle (démo)", unit: "an", unitPrice: "1500", tvaRateId: tva19 });
  const materiel = await createProduct(db, actor, { type: "bien", name: "Matériel de démonstration", unit: "u", unitPrice: "350", tvaRateId: tva19, trackStock: true, minStock: "2" });

  const line = (p: { id: string; name: string; unit: string; unitPrice: string }, quantity: string): InvoiceLineInput => ({
    productId: p.id, description: p.name, quantity, unit: p.unit, unitPrice: p.unitPrice, discountPercent: "0", tvaRateId: tva19, fodecApplicable: false,
  });

  // --- Documents (dates échelonnées, du plus ancien au plus récent : la numérotation est chronologique) ----------------------
  const today = todayTunis();
  const validated = async (customerId: string, daysAgo: number, lines: InvoiceLineInput[], reference: string) =>
    validateDocument(db, actor, (await createDraftInvoice(db, actor, {
      customerId, issueDate: addDays(today, -daysAgo), reference, notes: "Document de démonstration (données fictives).", lines,
    })).id);

  const inv1 = await validated(alpha, 40, [line(conseil, "10")], "DEMO-BC-001");
  const inv2 = await validated(beta, 20, [line(licence, "1"), line(materiel, "2")], "DEMO-BC-002");
  const inv3 = await validated(reject, 8, [line(conseil, "4")], "DEMO-BC-003");
  await createDraftInvoice(db, actor, { customerId: alpha, issueDate: today, reference: "DEMO-BROUILLON", lines: [line(conseil, "2")] });

  await recordPayment(db, actor, { customerId: alpha, paymentDate: addDays(today, -30), amount: "500", method: "virement", reference: "VIR-DEMO-1", allocations: [{ invoiceId: inv1.id, amount: "500" }] });
  await validateDocument(db, actor, (await createCreditNoteDraft(db, actor, inv3.id, { reason: "Avoir de démonstration", issueDate: addDays(today, -2) })).id);

  const quote = await createDraftQuote(db, actor, { customerId: beta, issueDate: today, validUntil: addDays(today, 30), reference: "DEMO-DEVIS", lines: [line(conseil, "20")] });
  await sendQuote(db, actor, quote.id);

  // Une facture déjà « envoyée » à la TTN simulée (QR code de démonstration sur son PDF) et une refusée.
  await submitToTtn(db, actor, inv1.id);
  await submitToTtn(db, actor, inv3.id);
  void inv2;
  return { seeded: true };
}
