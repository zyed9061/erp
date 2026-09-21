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
import { getInvoiceBalance, recordPayment } from "../invoicing/payments";
import { toMilli, fromMilli } from "../money";
import { addStockMovement } from "../stock";
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

  // --- Documents : 8 mois d'activité, du plus ancien au plus récent (la numérotation est chronologique) ----------------------
  const today = todayTunis();
  const validated = async (customerId: string, daysAgo: number, lines: InvoiceLineInput[], reference: string) =>
    validateDocument(db, actor, (await createDraftInvoice(db, actor, {
      customerId, issueDate: addDays(today, -daysAgo), dueDate: addDays(today, 30 - daysAgo), reference,
      notes: "Document de démonstration (données fictives).", lines,
    })).id);
  /** Encaisse la totalité (ou une fraction) du reste dû d'une facture. */
  const pay = async (invoiceId: string, customerId: string, daysAgo: number, method: "virement" | "cheque" | "especes", ref: string, share = 1) => {
    const b = (await getInvoiceBalance(db, invoiceId))!;
    const due = toMilli(b.netToPay) - toMilli(b.credited) - toMilli(b.paid);
    const amount = fromMilli(share === 1 ? due : due / 2n);
    await recordPayment(db, actor, { customerId, paymentDate: addDays(today, -daysAgo), amount, method, reference: ref, allocations: [{ invoiceId, amount }] });
  };

  await addStockMovement(db, actor, { productId: materiel.id, type: "entry", quantity: "12", occurredOn: addDays(today, -210), reference: "RECEPTION-DEMO", notes: "Stock initial de démonstration" });

  // Historique payé (graphique du chiffre d'affaires sur plusieurs mois)
  const h1 = await validated(alpha, 200, [line(conseil, "30")], "DEMO-H1");
  await pay(h1.id, alpha, 170, "virement", "VIR-DEMO-H1");
  const h2 = await validated(beta, 170, [line(licence, "1"), line(materiel, "2")], "DEMO-H2");
  await pay(h2.id, beta, 140, "cheque", "CHQ-DEMO-H2");
  const h3 = await validated(alpha, 140, [line(licence, "2")], "DEMO-H3");
  await pay(h3.id, alpha, 118, "virement", "VIR-DEMO-H3");
  const h4 = await validated(beta, 110, [line(conseil, "25")], "DEMO-H4");
  await pay(h4.id, beta, 80, "virement", "VIR-DEMO-H4");
  const h5 = await validated(alpha, 80, [line(materiel, "4"), line(conseil, "6")], "DEMO-H5");
  await pay(h5.id, alpha, 52, "especes", "ESP-DEMO-H5");

  // Documents récents : un en retard partiellement payé, un ouvert, un client au rejet de démonstration
  const inv1 = await validated(alpha, 40, [line(conseil, "10")], "DEMO-BC-001");
  await pay(inv1.id, alpha, 30, "virement", "VIR-DEMO-1", 0.5);
  const inv2 = await validated(beta, 20, [line(licence, "1"), line(materiel, "2")], "DEMO-BC-002");
  await pay(inv2.id, beta, 3, "virement", "VIR-DEMO-2", 0.5);
  const inv3 = await validated(reject, 8, [line(conseil, "4")], "DEMO-BC-003");
  await createDraftInvoice(db, actor, { customerId: alpha, issueDate: today, reference: "DEMO-BROUILLON", lines: [line(conseil, "2")] });
  await validateDocument(db, actor, (await createCreditNoteDraft(db, actor, inv3.id, { reason: "Avoir de démonstration", issueDate: addDays(today, -2) })).id);

  const quote = await createDraftQuote(db, actor, { customerId: beta, issueDate: today, validUntil: addDays(today, 30), reference: "DEMO-DEVIS", lines: [line(conseil, "20")] });
  await sendQuote(db, actor, quote.id);

  // Deux factures « envoyées » à la TTN simulée (QR code de démonstration sur leur PDF) et une refusée.
  await submitToTtn(db, actor, h5.id);
  await submitToTtn(db, actor, inv1.id);
  await submitToTtn(db, actor, inv3.id);
  return { seeded: true };
}
