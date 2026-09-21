import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { paymentAllocations, payments, quotes } from "@/db/schema";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { createCustomer } from "@/lib/customers";
import { ServiceError } from "@/lib/errors";
import {
  createCreditNoteDraft, createDraftInvoice, getInvoice, listInvoices, validateDocument, type InvoiceLineInput,
} from "@/lib/invoicing/invoices";
import {
  addWithholdingCertificate, allocatePayment, getInvoiceBalance, getPayment, listPayments,
  listWithholdingCertificates, openInvoicesForCustomer, paymentStateOf, recordPayment, voidPayment,
} from "@/lib/invoicing/payments";
import {
  createDepositInvoiceDraft, createDraftQuote, createInvoiceFromQuote, decideQuote, deleteDraftQuote,
  getQuote, listQuotes, sendQuote, updateDraftQuote,
} from "@/lib/invoicing/quotes";
import { toMilli } from "@/lib/money";
import { createTaxRate, listTaxRates } from "@/lib/taxes";
import { createUser } from "@/lib/users";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let actor: { id: string; email: string };
let rates: Record<string, string>;
let alpha: string; // retenue 1,5 %
let beta: string; // sans retenue
const DATE = "2026-03-10";

const line = (over: Partial<InvoiceLineInput> & { tva?: string } = {}): InvoiceLineInput => ({
  description: "Prestation", quantity: "1", unit: "unité", unitPrice: "100", discountPercent: "0",
  tvaRateId: rates[over.tva ?? "TVA19"]!, fodecApplicable: false, ...over,
});

/** Crée et valide une facture (les dates anciennes d'abord : les numéros suivent la chronologie). */
async function validatedInvoice(customerId: string, lines: InvoiceLineInput[], issueDate = DATE, dueDate = "") {
  const d = await createDraftInvoice(db, actor, { customerId, issueDate, dueDate, lines });
  return validateDocument(db, actor, d.id);
}

async function errorOf(p: Promise<unknown>) {
  return p.then(() => null, (e: Error & { cause?: Error }) => e);
}
const dbMessage = (e: (Error & { cause?: Error }) | null) => `${e?.message} ${e?.cause?.message}`;
const balanceOf = async (id: string) => {
  const inv = (await getInvoice(db, id))!.invoice;
  return paymentStateOf((await getInvoiceBalance(db, id))!, inv.dueDate);
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const user = await createUser(db, null, { email: "compta@example.tn", name: "Compta", role: "comptable", password: "Password-12345" });
  actor = { id: user.id, email: user.email };
  rates = Object.fromEntries((await listTaxRates(db)).map((r) => [r.code, r.id]));
  await updateCompany(db, actor, {
    legalName: "ACME SARL", matriculeFiscal: "7654321B/A/M/000", taxRegime: "reel", vatRegistered: true,
    stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
  });
  const ras = await createTaxRate(db, actor, { code: "RAS15", label: "Retenue 1,5 %", kind: "retenue", rate: "1.5" });
  alpha = (await createCustomer(db, actor, {
    type: "entreprise", name: "Société Alpha", matriculeFiscal: "1234567/A/M/000", taxStatus: "assujetti",
    withholdingApplies: true, withholdingRateId: ras.id,
  })).id;
  beta = (await createCustomer(db, actor, {
    type: "entreprise", name: "Beta SARL", matriculeFiscal: "2222222/A/M/000", taxStatus: "assujetti",
  })).id;
});
afterAll(() => close());

describe("statut de paiement (fonction pure)", () => {
  const b = (netToPay: string, credited: string, paid: string) => ({ netToPay, credited, paid });
  it("dérive le statut du reste dû", () => {
    expect(paymentStateOf(b("100.000", "0", "0"), null)).toMatchObject({ status: "unpaid", due: "100.000", overdue: false });
    expect(paymentStateOf(b("100.000", "0", "40.000"), null)).toMatchObject({ status: "partial", due: "60.000" });
    expect(paymentStateOf(b("100.000", "20.000", "0"), null)).toMatchObject({ status: "partial", due: "80.000" });
    expect(paymentStateOf(b("100.000", "0", "100.000"), null)).toMatchObject({ status: "paid", due: "0.000" });
    expect(paymentStateOf(b("100.000", "100.000", "100.000"), null)).toMatchObject({ status: "overpaid", due: "-100.000" });
  });
  it("marque le retard seulement s'il reste un solde et que l'échéance est dépassée", () => {
    expect(paymentStateOf(b("100", "0", "0"), "2026-01-01", "2026-01-02").overdue).toBe(true);
    expect(paymentStateOf(b("100", "0", "0"), "2026-01-02", "2026-01-02").overdue).toBe(false); // le jour même : pas en retard
    expect(paymentStateOf(b("100", "0", "100"), "2026-01-01", "2026-06-01").overdue).toBe(false); // soldée
  });
});

describe("paiements et imputations", () => {
  let inv: Awaited<ReturnType<typeof validatedInvoice>>; // 1000 HT -> net à payer 1191
  let p1: string;

  beforeAll(async () => {
    inv = await validatedInvoice(beta, [line({ unitPrice: "1000" })]);
  });

  it("calcule le solde initial : non payée et en retard (échéance = date d'émission passée)", async () => {
    expect(inv.netToPay).toBe("1191.000");
    expect(await balanceOf(inv.id)).toMatchObject({ status: "unpaid", overdue: true, due: "1191.000", paid: "0.000" });
  });

  it("enregistre un paiement partiel imputé : la facture devient partiellement payée", async () => {
    const pay = await recordPayment(db, actor, {
      customerId: beta, paymentDate: DATE, amount: "500", method: "virement", reference: "VIR-1",
      allocations: [{ invoiceId: inv.id, amount: "500" }],
    });
    p1 = pay.id;
    expect(await balanceOf(inv.id)).toMatchObject({ status: "partial", due: "691.000", paid: "500.000" });
    const details = await getPayment(db, pay.id);
    expect(details).toMatchObject({ allocated: "500.000", unallocated: "0.000" });
  });

  it("refuse d'imputer plus que le reste dû ou plus que le paiement", async () => {
    const tooMuchForInvoice = await errorOf(recordPayment(db, actor, {
      customerId: beta, paymentDate: DATE, amount: "1000", method: "especes",
      allocations: [{ invoiceId: inv.id, amount: "700" }], // reste dû 691
    }));
    expect(tooMuchForInvoice).toBeInstanceOf(ServiceError);
    expect(tooMuchForInvoice?.message).toMatch(/dépasse le reste dû/);

    const tooMuchForPayment = await errorOf(recordPayment(db, actor, {
      customerId: beta, paymentDate: DATE, amount: "100", method: "especes",
      allocations: [{ invoiceId: inv.id, amount: "150" }],
    }));
    expect(tooMuchForPayment?.message).toMatch(/dépassent le montant du paiement/);
    // Rien n'a été enregistré : la transaction est annulée en entier.
    expect((await listPayments(db, { customerId: beta })).total).toBe(1);
  });

  it("refuse l'imputation sur un brouillon, un avoir ou la facture d'un autre client", async () => {
    const draft = await createDraftInvoice(db, actor, { customerId: beta, issueDate: DATE, lines: [line()] });
    const otherCustomer = await validatedInvoice(alpha, [line({ unitPrice: "10" })]);
    const pay = await recordPayment(db, actor, { customerId: beta, paymentDate: DATE, amount: "50", method: "especes" });
    for (const invoiceId of [draft.id, otherCustomer.id]) {
      const err = await errorOf(allocatePayment(db, actor, pay.id, [{ invoiceId, amount: "10" }]));
      expect(err).toBeInstanceOf(ServiceError);
    }
    const credit = await createCreditNoteDraft(db, actor, inv.id, { reason: "Test", issueDate: DATE });
    expect(await errorOf(allocatePayment(db, actor, pay.id, [{ invoiceId: credit.id, amount: "10" }]))).toBeInstanceOf(ServiceError);
  });

  it("gère une avance : paiement sans imputation, imputé plus tard, jamais deux fois sur la même facture", async () => {
    const advance = await recordPayment(db, actor, { customerId: beta, paymentDate: DATE, amount: "691", method: "cheque" });
    expect(await getPayment(db, advance.id)).toMatchObject({ allocated: "0.000", unallocated: "691.000" });
    expect((await openInvoicesForCustomer(db, beta)).map((i) => i.id)).toContain(inv.id);

    await allocatePayment(db, actor, advance.id, [{ invoiceId: inv.id, amount: "691" }]);
    expect(await balanceOf(inv.id)).toMatchObject({ status: "paid", due: "0.000", overdue: false });
    expect((await openInvoicesForCustomer(db, beta)).map((i) => i.id)).not.toContain(inv.id);
    expect(await errorOf(allocatePayment(db, actor, advance.id, [{ invoiceId: inv.id, amount: "1" }]))).toBeInstanceOf(ServiceError);
  });

  it("annule un paiement : le solde est rétabli, l'annulation est définitive", async () => {
    await voidPayment(db, actor, p1, "Chèque impayé");
    expect(await balanceOf(inv.id)).toMatchObject({ status: "partial", due: "500.000", paid: "691.000" });
    expect(await errorOf(voidPayment(db, actor, p1, "Encore"))).toBeInstanceOf(ServiceError);
    expect(await errorOf(voidPayment(db, actor, p1, "x"))).toBeInstanceOf(Error);
    expect((await listPayments(db, { customerId: beta })).rows.map((r) => r.payment.id)).not.toContain(p1);
    expect((await listPayments(db, { customerId: beta, includeVoided: true })).rows.map((r) => r.payment.id)).toContain(p1);
    // Un paiement annulé ne peut plus recevoir d'imputation.
    expect(await errorOf(allocatePayment(db, actor, p1, [{ invoiceId: inv.id, amount: "1" }]))).toBeInstanceOf(ServiceError);
  });

  it("protège paiements et imputations en base (aucun UPDATE/DELETE, pas de réactivation)", async () => {
    const [pay] = await db.select().from(payments).where(eq(payments.id, p1));
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE payments SET amount = 1 WHERE id = ${p1}`)))).toMatch(/annulé : modification interdite/);
    const live = (await listPayments(db, { customerId: beta })).rows[0]!.payment;
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE payments SET amount = 1 WHERE id = ${live.id}`)))).toMatch(/ne sont pas modifiables/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM payments WHERE id = ${live.id}`)))).toMatch(/suppression interdite/);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE payment_allocations SET amount = 1`)))).toMatch(/interdites/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM payment_allocations`)))).toMatch(/interdites/);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE payments SET voided_at = NULL, void_reason = NULL WHERE id = ${p1}`)))).toMatch(/annulé/);
    expect(pay?.voidReason).toBe("Chèque impayé");
    expect((await db.select().from(paymentAllocations)).length).toBeGreaterThan(0);
  });

  it("refuse un montant nul, négatif ou à 4 décimales, et une annulation sans motif", async () => {
    for (const amount of ["0", "-5", "1.2345"]) {
      await expect(recordPayment(db, actor, { customerId: beta, paymentDate: DATE, amount, method: "especes" })).rejects.toThrow();
    }
    const live = (await listPayments(db, { customerId: beta })).rows[0]!.payment;
    await expect(voidPayment(db, actor, live.id, "")).rejects.toThrow();
  });
});

describe("avoirs et solde", () => {
  it("un avoir réduit le reste dû ; le timbre n'est pas remboursé", async () => {
    const inv = await validatedInvoice(beta, [line({ unitPrice: "1000" })]); // net 1191 (dont timbre 1)
    const credit = await validateDocument(db, actor, (await createCreditNoteDraft(db, actor, inv.id, { reason: "Annulation totale", issueDate: DATE })).id);
    expect(credit.netToPay).toBe("1190.000");
    expect(await balanceOf(inv.id)).toMatchObject({ credited: "1190.000", due: "1.000", status: "partial" }); // reste le timbre
  });

  it("une facture payée puis créditée passe à « à rembourser »", async () => {
    const inv = await validatedInvoice(beta, [line({ unitPrice: "100" })]); // net 120
    await recordPayment(db, actor, { customerId: beta, paymentDate: DATE, amount: "120", method: "especes", allocations: [{ invoiceId: inv.id, amount: "120" }] });
    await validateDocument(db, actor, (await createCreditNoteDraft(db, actor, inv.id, { reason: "Retour", issueDate: DATE })).id);
    expect(await balanceOf(inv.id)).toMatchObject({ status: "overpaid", due: "-119.000" });
  });

  it("filtre la liste par état de paiement", async () => {
    const open = await listInvoices(db, { payment: "open" });
    const overdue = await listInvoices(db, { payment: "overdue" });
    const paid = await listInvoices(db, { payment: "paid" });
    expect(open.total).toBeGreaterThan(0);
    expect(overdue.total).toBeGreaterThan(0);
    expect(paid.total).toBeGreaterThan(0);
    const ids = (r: typeof open) => new Set(r.rows.map((x) => x.invoice.id));
    for (const id of ids(paid)) expect(ids(open).has(id)).toBe(false);
    for (const id of ids(overdue)) expect(ids(open).has(id)).toBe(true);
  });

  it("ne met pas en retard une facture dont l'échéance est future", async () => {
    const inv = await validatedInvoice(beta, [line()], DATE, "2099-01-01");
    expect(await balanceOf(inv.id)).toMatchObject({ status: "unpaid", overdue: false });
  });
});

describe("certificats de retenue à la source", () => {
  it("enregistre les certificats jusqu'au montant retenu, sans doublon", async () => {
    const inv = await validatedInvoice(alpha, [line({ unitPrice: "1000" })]); // TTC 1190 -> retenue 17,850
    expect(inv.withholdingAmount).toBe("17.850");
    await addWithholdingCertificate(db, actor, inv.id, { number: "RAS-001", certificateDate: DATE, amount: "10" });
    expect(await errorOf(addWithholdingCertificate(db, actor, inv.id, { number: "RAS-001", certificateDate: DATE, amount: "1" }))).toBeInstanceOf(ServiceError);
    expect(await errorOf(addWithholdingCertificate(db, actor, inv.id, { number: "RAS-002", certificateDate: DATE, amount: "8" }))).toBeInstanceOf(ServiceError); // 18 > 17,850
    await addWithholdingCertificate(db, actor, inv.id, { number: "RAS-002", certificateDate: DATE, amount: "7.85" });
    expect(await listWithholdingCertificates(db, inv.id)).toHaveLength(2);
  });

  it("refuse un certificat sur une facture sans retenue", async () => {
    const inv = await validatedInvoice(beta, [line()]);
    expect(await errorOf(addWithholdingCertificate(db, actor, inv.id, { number: "X", certificateDate: DATE, amount: "1" }))).toBeInstanceOf(ServiceError);
  });
});

describe("devis", () => {
  const quoteLinesInput = () => [
    line({ description: "Développement", unitPrice: "1000" }),
    line({ description: "Formation", unitPrice: "500", tva: "TVA7" }),
  ];

  it("crée un brouillon sans numéro, puis l'envoie : numéro sans trou et verrouillage", async () => {
    const q = await createDraftQuote(db, actor, { customerId: beta, issueDate: DATE, validUntil: "2099-12-31", lines: quoteLinesInput() });
    expect(q).toMatchObject({ status: "draft", number: null, totalHt: "1500.000", totalTva: "225.000", totalTtc: "1725.000", version: 1 });
    const updated = await updateDraftQuote(db, actor, q.id, { customerId: beta, issueDate: DATE, lines: [line({ unitPrice: "200" })] }, 1);
    expect(updated).toMatchObject({ totalHt: "200.000", version: 2 });
    expect(await errorOf(updateDraftQuote(db, actor, q.id, { customerId: beta, issueDate: DATE, lines: [line()] }, 1))).toBeInstanceOf(ServiceError); // version périmée

    const sent = await sendQuote(db, actor, q.id);
    expect(sent).toMatchObject({ status: "sent", number: "DEV-2026-00001" });
    expect(await errorOf(sendQuote(db, actor, q.id))).toBeInstanceOf(ServiceError);
    expect(await errorOf(updateDraftQuote(db, actor, q.id, { customerId: beta, issueDate: DATE, lines: [line()] }))).toBeInstanceOf(ServiceError);
    expect(await errorOf(deleteDraftQuote(db, actor, q.id))).toBeInstanceOf(ServiceError);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE quotes SET total_ht = 1 WHERE id = ${q.id}`)))).toMatch(/contenu verrouillé/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM quotes WHERE id = ${q.id}`)))).toMatch(/suppression interdite/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM quote_lines WHERE quote_id = ${q.id}`)))).toMatch(/lecture seule/);
  });

  it("ne consomme pas de numéro pour un brouillon supprimé", async () => {
    const d = await createDraftQuote(db, actor, { customerId: beta, issueDate: DATE, lines: [line()] });
    await deleteDraftQuote(db, actor, d.id);
    const q = await createDraftQuote(db, actor, { customerId: beta, issueDate: DATE, lines: [line()] });
    expect((await sendQuote(db, actor, q.id)).number).toBe("DEV-2026-00002");
  });

  it("n'accepte ou ne refuse qu'un devis envoyé et non expiré", async () => {
    const draft = await createDraftQuote(db, actor, { customerId: beta, issueDate: DATE, lines: [line()] });
    expect(await errorOf(decideQuote(db, actor, draft.id, "accepted"))).toBeInstanceOf(ServiceError);

    const expired = await sendQuote(db, actor, (await createDraftQuote(db, actor, { customerId: beta, issueDate: DATE, validUntil: "2026-03-31", lines: [line()] })).id);
    const err = await errorOf(decideQuote(db, actor, expired.id, "accepted"));
    expect(err?.message).toMatch(/expiré/);
    expect((await getQuote(db, expired.id))?.expired).toBe(true);
    expect((await decideQuote(db, actor, expired.id, "declined")).status).toBe("declined"); // refuser reste possible

    const ok = await sendQuote(db, actor, (await createDraftQuote(db, actor, { customerId: beta, issueDate: DATE, validUntil: "2099-01-01", lines: [line()] })).id);
    expect((await decideQuote(db, actor, ok.id, "accepted")).status).toBe("accepted");
    expect(await errorOf(decideQuote(db, actor, ok.id, "declined"))).toBeInstanceOf(ServiceError);
    const [row] = await db.select().from(quotes).where(eq(quotes.id, ok.id));
    expect(row?.decidedAt).not.toBeNull();
  });

  it("refuse la validité avant l'émission et liste avec filtres", async () => {
    await expect(createDraftQuote(db, actor, { customerId: beta, issueDate: DATE, validUntil: "2026-03-01", lines: [line()] })).rejects.toBeInstanceOf(ServiceError);
    expect((await listQuotes(db, { status: "accepted" })).rows.every((r) => r.quote.status === "accepted")).toBe(true);
    expect((await listQuotes(db, { q: "DEV-2026-00001" })).total).toBe(1);
  });
});

describe("acomptes et facture finale", () => {
  let quoteId: string;
  let dep1: Awaited<ReturnType<typeof validateDocument>>;
  let dep2: Awaited<ReturnType<typeof validateDocument>>;

  beforeAll(async () => {
    const q = await createDraftQuote(db, actor, {
      customerId: beta, issueDate: DATE, validUntil: "2099-01-01",
      lines: [line({ unitPrice: "1000" }), line({ description: "Formation", unitPrice: "500", tva: "TVA7" })],
    });
    quoteId = q.id;
  });

  it("refuse un acompte tant que le devis n'est pas accepté", async () => {
    expect(await errorOf(createDepositInvoiceDraft(db, actor, quoteId, { percent: "30" }))).toBeInstanceOf(ServiceError);
    await sendQuote(db, actor, quoteId);
    expect(await errorOf(createDepositInvoiceDraft(db, actor, quoteId, { percent: "30" }))).toBeInstanceOf(ServiceError);
    await decideQuote(db, actor, quoteId, "accepted");
  });

  it("crée une facture d'acompte : une ligne par taux de TVA, sans timbre", async () => {
    const d = await createDepositInvoiceDraft(db, actor, quoteId, { percent: "30" });
    expect(d).toMatchObject({ kind: "deposit_invoice", quoteId, depositPercent: "30.000", stampDuty: "0.000", totalHt: "450.000", totalTva: "67.500", totalTtc: "517.500" });
    const lines = (await getInvoice(db, d.id))!.lines;
    // 30 % de la base de chaque taux : 500 × 30 % à 7 %, 1000 × 30 % à 19 %.
    expect(lines.map((l) => [l.tvaRate, l.unitPrice])).toEqual([["7.000", "150.000"], ["19.000", "300.000"]]);
    dep1 = await validateDocument(db, actor, d.id);
    expect(dep1.number).toBe("ACO-2026-00001");
  });

  it("plafonne le total des acomptes à 100 %", async () => {
    const err = await errorOf(createDepositInvoiceDraft(db, actor, quoteId, { percent: "80" }));
    expect(err?.message).toMatch(/dépasserait 100 %/);
    expect(await errorOf(createDepositInvoiceDraft(db, actor, quoteId, { percent: "0" }))).toBeInstanceOf(Error);
    dep2 = await validateDocument(db, actor, (await createDepositInvoiceDraft(db, actor, quoteId, { percent: "20" })).id);
    expect(dep2.number).toBe("ACO-2026-00002");
  });

  it("accepte un paiement sur un acompte et lui applique le même solde qu'à une facture", async () => {
    await recordPayment(db, actor, { customerId: beta, paymentDate: DATE, amount: "100", method: "virement", allocations: [{ invoiceId: dep1.id, amount: "100" }] });
    expect(await balanceOf(dep1.id)).toMatchObject({ status: "partial", due: "417.500" });
  });

  it("refuse la facture finale tant qu'un acompte est en brouillon", async () => {
    const draftDep = await createDepositInvoiceDraft(db, actor, quoteId, { percent: "10" });
    expect((await errorOf(createInvoiceFromQuote(db, actor, quoteId)))?.message).toMatch(/acomptes en brouillon/);
    await db.execute(sql`DELETE FROM invoices WHERE id = ${draftDep.id}`);
  });

  it("crée la facture finale en déduisant les acomptes, sans compter la TVA deux fois", async () => {
    const final = await createInvoiceFromQuote(db, actor, quoteId);
    const details = (await getInvoice(db, final.id))!;
    expect(details.lines).toHaveLength(2 + 4); // 2 lignes du devis + 2 acomptes × 2 taux de TVA
    expect(details.lines.filter((l) => toMilli(l.unitPrice) < 0n)).toHaveLength(4);
    // HT 1500 − 50 % = 750 ; TVA 19 % sur 500 = 95 ; TVA 7 % sur 250 = 17,5 ; TTC 862,5 ; + timbre
    expect(final).toMatchObject({ kind: "invoice", quoteId, totalHt: "750.000", totalTva: "112.500", totalTtc: "862.500", stampDuty: "1.000", netToPay: "863.500" });

    // Toute la TVA du devis (225) se retrouve répartie entre acomptes et facture finale.
    const tva = toMilli(dep1.totalTva) + toMilli(dep2.totalTva) + toMilli(final.totalTva);
    expect(tva).toBe(toMilli("225.000"));

    const validated = await validateDocument(db, actor, final.id);
    expect(validated.number).toMatch(/^FAC-2026-\d{5}$/);
    const q = await getQuote(db, quoteId);
    expect(q?.finalInvoice?.id).toBe(final.id);
    expect(q?.deposits).toHaveLength(2);
    expect(q?.depositPercent).toBe("50.000");
  });

  it("n'autorise ni seconde facture finale ni nouvel acompte une fois la facture finale créée", async () => {
    expect((await errorOf(createInvoiceFromQuote(db, actor, quoteId)))?.message).toMatch(/déjà une facture finale/);
    expect((await errorOf(createDepositInvoiceDraft(db, actor, quoteId, { percent: "10" })))?.message).toMatch(/facture finale existe déjà/);
  });

  it("refuse un total négatif", async () => {
    const err = await errorOf(createDraftInvoice(db, actor, { customerId: beta, issueDate: DATE, lines: [line({ unitPrice: "-50" })] }));
    expect(err).toBeInstanceOf(ServiceError);
    expect(err?.message).toMatch(/négatif/);
  });

  it("permet un avoir sur une facture d'acompte", async () => {
    const credit = await createCreditNoteDraft(db, actor, dep2.id, { reason: "Acompte annulé" });
    expect(credit).toMatchObject({ kind: "credit_note", originalInvoiceId: dep2.id, totalTtc: dep2.totalTtc });
  });
});

describe("cohérence TEIF des documents produits par ce module", () => {
  it("chaque document validé passe les contrôles internes de l'export (recalcul des montants compris)", async () => {
    const { invoices: invTable } = await import("@/db/schema");
    const { loadEinvoiceData } = await import("@/lib/einvoice/service");
    const { validateEinvoiceData } = await import("@/lib/einvoice/validate");
    const rows = await db.select({ id: invTable.id, number: invTable.number, kind: invTable.kind }).from(invTable).where(eq(invTable.status, "validated"));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const loaded = await loadEinvoiceData(db, r.id);
      expect(loaded, r.number ?? r.id).not.toBeNull();
      expect(validateEinvoiceData(loaded!.data).errors, `${r.kind} ${r.number}`).toEqual([]);
    }
  });
});
