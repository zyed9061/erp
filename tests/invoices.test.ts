import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, invoiceLines, invoices, invoiceTaxLines, customers } from "@/db/schema";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { createCustomer, setCustomerActive, updateCustomer } from "@/lib/customers";
import { ServiceError } from "@/lib/errors";
import {
  createCreditNoteDraft, createDraftInvoice, deleteDraft, getInvoice, listInvoices, updateDraftInvoice,
  validateDocument, verifyInvoiceIntegrity, type InvoiceLineInput,
} from "@/lib/invoicing/invoices";
import { createTaxRate, listTaxRates } from "@/lib/taxes";
import { createUser } from "@/lib/users";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let actor: { id: string; email: string };
let rates: Record<string, string>; // code -> id
let alpha: string; // client assujetti avec retenue 1,5 %
let exporter: string; // client export
const DATE = "2026-03-10";

const line = (over: Partial<InvoiceLineInput> & { tva?: string } = {}): InvoiceLineInput => ({
  description: "Article", quantity: "1", unit: "unité", unitPrice: "100", discountPercent: "0",
  tvaRateId: rates[over.tva ?? "TVA19"]!, fodecApplicable: false, ...over,
});

const draft = (customerId: string, lines: InvoiceLineInput[], issueDate = DATE) =>
  createDraftInvoice(db, actor, { customerId, issueDate, lines });

async function errorOf(p: Promise<unknown>) {
  return p.then(() => null, (e: Error & { cause?: Error }) => e);
}
const dbMessage = (e: (Error & { cause?: Error }) | null) => `${e?.message} ${e?.cause?.message}`;

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
  rates.RAS15 = ras.id;
  alpha = (await createCustomer(db, actor, {
    type: "entreprise", name: "Société Alpha", matriculeFiscal: "1234567/A/M/000", taxStatus: "assujetti",
    withholdingApplies: true, withholdingRateId: ras.id,
  })).id;
  exporter = (await createCustomer(db, actor, {
    type: "entreprise", name: "Export SA", matriculeFiscal: "9999999/A/M/000", taxStatus: "export",
  })).id;
});
afterAll(() => close());

describe("brouillon", () => {
  it("calcule les totaux, le timbre, la retenue et l'échéance, sans numéro", async () => {
    const inv = await draft(alpha, [
      line({ quantity: "2", unitPrice: "100" }),
      line({ quantity: "10", unitPrice: "12.5", fodecApplicable: true }),
    ]);
    expect(inv).toMatchObject({
      kind: "invoice", status: "draft", number: null, sequence: null,
      totalHt: "325.000", totalFodec: "1.250", totalTvaBase: "326.250", totalTva: "61.988",
      totalTtc: "388.238", stampDuty: "1.000", withholdingRate: "1.500",
      withholdingAmount: "5.824", netToPay: "383.414", dueDate: DATE, version: 1,
    });
    const details = await getInvoice(db, inv.id);
    expect(details?.lines).toHaveLength(2);
    expect(details?.lines[1]).toMatchObject({ lineNetHt: "125.000", lineFodec: "1.250", tvaCode: "TVA19", fodecRate: "1.000" });
    expect(details?.taxes.map((t) => [t.kind, t.rate, t.amount])).toEqual(
      expect.arrayContaining([["fodec", "1.000", "1.250"], ["tva", "19.000", "61.988"]]),
    );
  });

  it("refuse une facture sans ligne, une quantité nulle, une date invalide, un client inactif", async () => {
    await expect(draft(alpha, [])).rejects.toThrow();
    await expect(draft(alpha, [line({ quantity: "0" })])).rejects.toThrow();
    await expect(draft(alpha, [line()], "2026-02-30")).rejects.toThrow();
    const inactive = await createCustomer(db, actor, { type: "particulier", name: "Inactif", taxStatus: "non_assujetti" });
    await setCustomerActive(db, actor, inactive.id, false);
    await expect(draft(inactive.id, [line()])).rejects.toBeInstanceOf(ServiceError);
  });

  it("met la TVA à 0 pour un client export, et refuse un taux qui n'est pas de la TVA", async () => {
    const inv = await draft(exporter, [line({ unitPrice: "500" })]);
    expect(inv).toMatchObject({ totalTva: "0.000", totalTtc: "500.000", withholdingRate: null });
    const lines = (await getInvoice(db, inv.id))!.lines;
    expect(lines[0]).toMatchObject({ tvaCode: "EXO", tvaRate: "0.000" });
    await expect(draft(alpha, [line({ tvaRateId: rates.FODEC1! })])).rejects.toBeInstanceOf(ServiceError);
  });

  it("modifie un brouillon : recalcul, lignes remplacées, verrou optimiste, audit", async () => {
    const inv = await draft(alpha, [line({ unitPrice: "100" })]);
    const updated = await updateDraftInvoice(db, actor, inv.id, {
      customerId: alpha, issueDate: DATE, lines: [line({ unitPrice: "200" }), line({ unitPrice: "50", tva: "TVA7" })],
    }, 1);
    expect(updated.version).toBe(2);
    expect(updated.totalHt).toBe("250.000");
    expect((await getInvoice(db, inv.id))!.lines).toHaveLength(2);
    // Version périmée : refusée.
    const stale = updateDraftInvoice(db, actor, inv.id, { customerId: alpha, issueDate: DATE, lines: [line()] }, 1);
    await expect(stale).rejects.toBeInstanceOf(ServiceError);
    const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, inv.id))).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["invoice.create", "invoice.update"]));
  });

  it("supprime un brouillon (lignes comprises)", async () => {
    const inv = await draft(alpha, [line()]);
    await deleteDraft(db, actor, inv.id);
    expect(await getInvoice(db, inv.id)).toBeNull();
    const orphans = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));
    expect(orphans).toHaveLength(0);
  });
});

describe("validation et immutabilité", () => {
  let validated: Awaited<ReturnType<typeof validateDocument>>;

  it("attribue un numéro, fige les données et pose une empreinte", async () => {
    const inv = await draft(alpha, [line({ unitPrice: "1000" })]);
    validated = await validateDocument(db, actor, inv.id);
    expect(validated).toMatchObject({ status: "validated", seriesYear: 2026, validatedBy: actor.id });
    expect(validated.number).toMatch(/^FAC-2026-\d{5}$/);
    expect(validated.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(validated.customerSnapshot).toMatchObject({ name: "Société Alpha", matriculeFiscal: "1234567/A/M/000" });
    expect(validated.companySnapshot).toMatchObject({ legalName: "ACME SARL" });
    expect(await verifyInvoiceIntegrity(db, validated.id)).toBe(true);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "invoice.validate"));
    expect(JSON.stringify(entry?.after)).toContain(validated.number!);
  });

  it("conserve le nom du client tel qu'à la validation, même si la fiche change ensuite", async () => {
    await updateCustomer(db, actor, alpha, {
      type: "entreprise", name: "Alpha Renommée", matriculeFiscal: "1234567/A/M/000", taxStatus: "assujetti",
      withholdingApplies: true, withholdingRateId: rates.RAS15,
    });
    const [row] = await db.select().from(invoices).where(eq(invoices.id, validated.id));
    expect(row?.customerSnapshot).toMatchObject({ name: "Société Alpha" });
    expect(await verifyInvoiceIntegrity(db, validated.id)).toBe(true);
  });

  it("interdit toute modification ou suppression d'une facture validée, au niveau service ET base", async () => {
    await expect(deleteDraft(db, actor, validated.id)).rejects.toBeInstanceOf(ServiceError);
    await expect(updateDraftInvoice(db, actor, validated.id, { customerId: alpha, issueDate: DATE, lines: [line()] }))
      .rejects.toBeInstanceOf(ServiceError);
    await expect(validateDocument(db, actor, validated.id)).rejects.toBeInstanceOf(ServiceError);

    const id = validated.id;
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE invoices SET total_ttc = 1 WHERE id = ${id}`)))).toMatch(/modification interdite/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM invoices WHERE id = ${id}`)))).toMatch(/suppression interdite/);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE invoice_lines SET quantity = 99 WHERE invoice_id = ${id}`)))).toMatch(/lecture seule/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM invoice_lines WHERE invoice_id = ${id}`)))).toMatch(/lecture seule/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM invoice_tax_lines WHERE invoice_id = ${id}`)))).toMatch(/lecture seule/);
    expect(dbMessage(await errorOf(db.execute(sql`INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit_price, tva_code, tva_rate) VALUES (${id}, 9, 'x', 1, 1, 'TVA19', 19)`)))).toMatch(/lecture seule/);
  });

  it("détecte une altération faite en contournant les triggers", async () => {
    const inv = await validateDocument(db, actor, (await draft(alpha, [line({ unitPrice: "10" })])).id);
    expect(await verifyInvoiceIntegrity(db, inv.id)).toBe(true);
    await db.execute(sql`ALTER TABLE invoices DISABLE TRIGGER invoices_immutable`);
    await db.execute(sql`UPDATE invoices SET total_ttc = 1.000 WHERE id = ${inv.id}`);
    await db.execute(sql`ALTER TABLE invoices ENABLE TRIGGER invoices_immutable`);
    expect(await verifyInvoiceIntegrity(db, inv.id)).toBe(false);
  });

  it("refuse la validation tant que la société n'est pas renseignée, sans consommer de numéro", async () => {
    const other = await createTestDb();
    try {
      const u = await createUser(other.db, null, { email: "x@example.tn", name: "X", role: "admin", password: "Password-12345" });
      const a = { id: u.id, email: u.email };
      const c = await createCustomer(other.db, a, { type: "particulier", name: "Client", taxStatus: "non_assujetti" });
      const tva = (await listTaxRates(other.db, { kind: "tva" })).find((r) => r.code === "TVA19")!;
      const mk = () => createDraftInvoice(other.db, a, {
        customerId: c.id, issueDate: DATE,
        lines: [{ description: "x", quantity: "1", unit: "u", unitPrice: "10", tvaRateId: tva.id }],
      });
      await expect(validateDocument(other.db, a, (await mk()).id)).rejects.toBeInstanceOf(ServiceError);
      await updateCompany(other.db, a, {
        legalName: "Ma Société", matriculeFiscal: "1111111A/A/M/000", taxRegime: "reel", vatRegistered: true,
        stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
      });
      const ok = await validateDocument(other.db, a, (await mk()).id);
      expect(ok.number).toBe("FAC-2026-00001"); // le premier numéro n'a pas été gâché
    } finally {
      await other.close();
    }
  });

  it("ne laisse aucun trou de numérotation quand une validation échoue (chronologie)", async () => {
    const first = await validateDocument(db, actor, (await draft(alpha, [line()], "2026-03-15")).id);
    const tooOld = await draft(alpha, [line()], "2026-03-01");
    const err = await errorOf(validateDocument(db, actor, tooOld.id));
    expect(err).toBeInstanceOf(ServiceError);
    expect(err?.message).toMatch(/chronologique/);
    expect((await getInvoice(db, tooOld.id))!.invoice.status).toBe("draft");

    const next = await validateDocument(db, actor, (await draft(alpha, [line()], "2026-03-20")).id);
    expect(next.sequence).toBe(first.sequence! + 1); // pas de numéro perdu
    // Le brouillon trop ancien peut être redaté puis validé.
    await updateDraftInvoice(db, actor, tooOld.id, { customerId: alpha, issueDate: "2026-03-21", lines: [line()] });
    const late = await validateDocument(db, actor, tooOld.id);
    expect(late.sequence).toBe(next.sequence! + 1);
  });
});

describe("avoirs", () => {
  let original: Awaited<ReturnType<typeof validateDocument>>;

  beforeAll(async () => {
    original = await validateDocument(db, actor, (await draft(alpha, [
      line({ description: "Prestation A", quantity: "4", unitPrice: "250" }),
      line({ description: "Prestation B", quantity: "1", unitPrice: "100", tva: "TVA7" }),
    ], "2026-04-01")).id);
  });

  it("refuse un avoir sur un brouillon ou sur un avoir, et sans motif", async () => {
    const d = await draft(alpha, [line()], "2026-04-02");
    await expect(createCreditNoteDraft(db, actor, d.id, { reason: "Erreur" })).rejects.toBeInstanceOf(ServiceError);
    await expect(createCreditNoteDraft(db, actor, original.id, { reason: "" })).rejects.toThrow();
  });

  it("crée un avoir brouillon qui reprend lignes, retenue, sans timbre", async () => {
    const cn = await createCreditNoteDraft(db, actor, original.id, { reason: "Retour de marchandise", issueDate: "2026-04-05" });
    expect(cn).toMatchObject({
      kind: "credit_note", status: "draft", originalInvoiceId: original.id, stampDuty: "0.000",
      withholdingRate: "1.500", totalHt: original.totalHt, totalTtc: original.totalTtc, reference: original.number,
    });
    expect(cn.netToPay).toBe((Number(original.netToPay) - 1).toFixed(3)); // sans le timbre de 1 DT
    await deleteDraft(db, actor, cn.id);
  });

  it("valide un avoir partiel, suit le reste à créditer et refuse de dépasser la facture", async () => {
    const cn = await createCreditNoteDraft(db, actor, original.id, { reason: "Remise commerciale", issueDate: "2026-04-05" });
    // Ajustement : seulement 1 unité de la prestation A.
    const half = await updateDraftInvoice(db, actor, cn.id, {
      customerId: alpha, issueDate: "2026-04-05",
      lines: [line({ description: "Prestation A", quantity: "1", unitPrice: "250" })],
    });
    expect(half.totalHt).toBe("250.000");
    const v = await validateDocument(db, actor, cn.id);
    expect(v.number).toMatch(/^AV-2026-\d{5}$/);

    const details = await getInvoice(db, original.id);
    expect(details?.creditedTtc).toBe(v.totalTtc);
    expect(Number(details?.remainingCreditable)).toBeCloseTo(Number(original.totalTtc) - Number(v.totalTtc), 3);

    // Un avoir complet dépasserait maintenant le reste à créditer.
    const full = await createCreditNoteDraft(db, actor, original.id, { reason: "Annulation totale", issueDate: "2026-04-06" });
    const err = await errorOf(validateDocument(db, actor, full.id));
    expect(err).toBeInstanceOf(ServiceError);
    expect(err?.message).toMatch(/dépasserait/);

    // Ramené au reste exact, il passe : la facture est alors entièrement créditée.
    const rest = await updateDraftInvoice(db, actor, full.id, {
      customerId: alpha, issueDate: "2026-04-06",
      lines: [
        line({ description: "Prestation A", quantity: "3", unitPrice: "250" }),
        line({ description: "Prestation B", quantity: "1", unitPrice: "100", tva: "TVA7" }),
      ],
    });
    await validateDocument(db, actor, rest.id);
    const after = await getInvoice(db, original.id);
    expect(after?.remainingCreditable).toBe("0.000");
  });

  it("garde l'avoir rattaché à sa facture, sans changement de client", async () => {
    const cn = await createCreditNoteDraft(db, actor, original.id, { reason: "Test client", issueDate: "2026-04-07" });
    const upd = await updateDraftInvoice(db, actor, cn.id, { customerId: exporter, issueDate: "2026-04-07", lines: [line()] });
    expect(upd.customerId).toBe(alpha);
    await deleteDraft(db, actor, cn.id);
  });

  it("impose la cohérence avoir <-> facture d'origine en base", async () => {
    const cn = await createCreditNoteDraft(db, actor, original.id, { reason: "Contrainte", issueDate: "2026-04-08" });
    const e1 = await errorOf(db.execute(sql`UPDATE invoices SET original_invoice_id = NULL WHERE id = ${cn.id}`));
    expect(dbMessage(e1)).toMatch(/credit_note_link/);
    await deleteDraft(db, actor, cn.id);
    const e2 = await errorOf(db.insert(invoices).values({
      kind: "invoice", customerId: alpha, issueDate: DATE, originalInvoiceId: original.id,
    }));
    expect(dbMessage(e2)).toMatch(/credit_note_link/);
  });
});

describe("liste", () => {
  it("filtre par statut, type et recherche", async () => {
    const drafts = await listInvoices(db, { status: "draft" });
    expect(drafts.rows.every((r) => r.invoice.status === "draft")).toBe(true);
    const credits = await listInvoices(db, { kind: "credit_note" });
    expect(credits.total).toBeGreaterThan(0);
    expect(credits.rows.every((r) => r.invoice.kind === "credit_note")).toBe(true);
    const byNumber = await listInvoices(db, { q: "AV-2026" });
    expect(byNumber.rows.every((r) => r.invoice.number?.startsWith("AV-2026"))).toBe(true);
    const byCustomer = await listInvoices(db, { q: "export sa" });
    expect(byCustomer.rows.every((r) => r.customerName === "Export SA")).toBe(true);
    expect((await listInvoices(db, { q: "%" })).total).toBe(0);
  });

  it("garde des numéros uniques et contigus par série", async () => {
    const all = await db.select({ kind: invoices.kind, seq: invoices.sequence, year: invoices.seriesYear })
      .from(invoices).where(eq(invoices.status, "validated"));
    for (const kind of ["invoice", "credit_note"] as const) {
      const seqs = all.filter((r) => r.kind === kind && r.year === 2026).map((r) => r.seq!).sort((a, b) => a - b);
      expect(seqs.length).toBeGreaterThan(0);
      expect(seqs).toEqual(seqs.map((_, i) => i + 1)); // 1, 2, 3… sans trou
    }
    void customers; void invoiceTaxLines;
  });
});
