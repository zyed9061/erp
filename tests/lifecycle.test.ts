import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, einvoiceExports, invoices } from "@/db/schema";
import type { Db } from "@/db/types";
import { actionLabel, entityHistory } from "@/lib/audit";
import { updateCompany } from "@/lib/company";
import { createCustomer } from "@/lib/customers";
import { getEinvoiceExport, prepareEinvoice } from "@/lib/einvoice/service";
import { ServiceError } from "@/lib/errors";
import {
  createCreditNoteDraft, createDraftInvoice, deleteDraft, getInvoice, updateDraftInvoice, validateDocument, verifyInvoiceIntegrity,
  type InvoiceLineInput,
} from "@/lib/invoicing/invoices";
import { listTaxRates } from "@/lib/taxes";
import { createUser } from "@/lib/users";
import { createTestDb } from "./helpers";

/**
 * Parcours complet d'un document, de la création à l'export, avec tous les refus attendus.
 * Les tests unitaires détaillés sont dans invoices.test.ts ; celui-ci vérifie l'enchaînement et la traçabilité.
 */

let db: Db;
let close: () => Promise<void>;
let actor: { id: string; email: string; ip: string };
let customerId: string;
let line: InvoiceLineInput;

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: Error & { cause?: Error }) => e);
const dbMessage = (e: (Error & { cause?: Error }) | null) => `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const user = await createUser(db, null, { email: "compta@example.tn", name: "Compta", role: "comptable", password: "Password-12345" });
  actor = { id: user.id, email: user.email, ip: "10.0.0.7" };
  await updateCompany(db, actor, {
    legalName: "ACME SARL", matriculeFiscal: "7654321B/A/M/000", address: "1 rue A", city: "Tunis", postalCode: "1002",
    taxRegime: "reel", vatRegistered: true, stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
  });
  customerId = (await createCustomer(db, actor, {
    type: "entreprise", name: "Alpha SARL", matriculeFiscal: "1111111/A/M/000", taxStatus: "assujetti", address: "2 rue B", city: "Sfax", postalCode: "3000",
  })).id;
  const tva = (await listTaxRates(db)).find((r) => r.code === "TVA19")!.id;
  line = { description: "Prestation", quantity: "2", unit: "h", unitPrice: "100", discountPercent: "0", tvaRateId: tva, fodecApplicable: false };
});
afterAll(() => close());

describe("parcours d'une facture", () => {
  let draftId: string;
  let invoiceId: string;
  let number: string;
  let creditId: string;

  it("crée un brouillon sans numéro, modifiable et supprimable", async () => {
    const d = await createDraftInvoice(db, actor, { customerId, issueDate: "2026-05-01", lines: [line] });
    draftId = d.id;
    expect(d).toMatchObject({ status: "draft", number: null, kind: "invoice" });
    const upd = await updateDraftInvoice(db, actor, d.id, { customerId, issueDate: "2026-05-01", lines: [{ ...line, quantity: "3" }] }, d.version);
    expect(upd.totalHt).toBe("300.000");
    const other = await createDraftInvoice(db, actor, { customerId, issueDate: "2026-05-01", lines: [line] });
    await deleteDraft(db, actor, other.id);
    expect(await getInvoice(db, other.id)).toBeNull();
  });

  it("valide : numéro, empreinte intègre, statut figé", async () => {
    const v = await validateDocument(db, actor, draftId);
    invoiceId = v.id;
    number = v.number!;
    expect(v.status).toBe("validated");
    expect(number).toMatch(/\d/);
    expect(await verifyInvoiceIntegrity(db, invoiceId)).toBe(true);
  });

  it("refuse de revalider, de modifier ou de supprimer un document validé (service)", async () => {
    await expect(validateDocument(db, actor, invoiceId)).rejects.toBeInstanceOf(ServiceError);
    await expect(updateDraftInvoice(db, actor, invoiceId, { customerId, issueDate: "2026-05-01", lines: [line] }, 2)).rejects.toBeInstanceOf(ServiceError);
    await expect(deleteDraft(db, actor, invoiceId)).rejects.toBeInstanceOf(ServiceError);
  });

  it("refuse aussi en base, même en contournant l'application (UPDATE, DELETE, lignes)", async () => {
    const up = await errorOf(db.update(invoices).set({ notes: "piraté" }).where(eq(invoices.id, invoiceId)));
    expect(dbMessage(up)).toMatch(/validée|immuable|interdit/i);
    const del = await errorOf(db.delete(invoices).where(eq(invoices.id, invoiceId)));
    expect(dbMessage(del)).toMatch(/validée|immuable|interdit/i);
    const lines = await errorOf(db.execute(sql`update invoice_lines set quantity = 99 where invoice_id = ${invoiceId}`));
    expect(dbMessage(lines)).toMatch(/validée|immuable|interdit/i);
    expect((await getInvoice(db, invoiceId))!.invoice.notes).toBeNull();
  });

  it("crée et valide un avoir rattaché à la facture, qui ne modifie pas la facture", async () => {
    const before = (await getInvoice(db, invoiceId))!.invoice;
    const c = await createCreditNoteDraft(db, actor, invoiceId, { reason: "Erreur de prix", issueDate: "2026-05-02" });
    creditId = c.id;
    expect(c).toMatchObject({ kind: "credit_note", originalInvoiceId: invoiceId, customerId });
    const v = await validateDocument(db, actor, creditId);
    expect(v.number).not.toBe(number);
    const details = (await getInvoice(db, invoiceId))!;
    expect(details.credits.map((x) => x.id)).toEqual([creditId]);
    expect(details.remainingCreditable).toBe("0.000");
    expect(details.invoice.contentHash).toBe(before.contentHash); // la facture d'origine n'a pas bougé
    expect(await verifyInvoiceIntegrity(db, invoiceId)).toBe(true);
    expect((await getInvoice(db, creditId))!.original!.id).toBe(invoiceId);
  });

  it("prépare l'export TEIF, le conserve, et le rend impossible à modifier ou à orpheliner", async () => {
    const { export: exp, created } = await prepareEinvoice(db, actor, invoiceId);
    expect(created).toBe(true);
    expect(exp.invoiceContentHash).toBe((await getInvoice(db, invoiceId))!.invoice.contentHash);
    expect((await getEinvoiceExport(db, invoiceId))!.xmlSha256).toBe(exp.xmlSha256);
    const del = await errorOf(db.delete(einvoiceExports).where(eq(einvoiceExports.id, exp.id)));
    expect(dbMessage(del)).toContain("ajout seul");
    // La facture exportée ne peut toujours pas disparaître.
    expect(dbMessage(await errorOf(db.delete(invoices).where(eq(invoices.id, invoiceId))))).toBeTruthy();
    expect(await getInvoice(db, invoiceId)).not.toBeNull();
  });

  it("consigne toutes les opérations, dans l'ordre, avec l'auteur et l'adresse IP", async () => {
    const history = await entityHistory(db, "invoice", invoiceId);
    expect(history.map((h) => h.action)).toEqual(["invoice.create", "invoice.update", "invoice.validate", "einvoice.prepare"]);
    expect(history.every((h) => h.userEmail === "compta@example.tn")).toBe(true);
    expect(history.map((h) => actionLabel(h.action))).toEqual([
      "Facture créée (brouillon)", "Brouillon modifié", "Facture validée et numérotée", "Fichier TEIF préparé (non signé, non transmis)",
    ]);
    const credit = await entityHistory(db, "invoice", creditId);
    expect(credit.map((h) => h.action)).toEqual(["credit_note.create", "credit_note.validate"]);
    const ips = await db.select({ ip: auditLog.ip }).from(auditLog).where(eq(auditLog.entityId, invoiceId));
    expect(ips.every((r) => r.ip === "10.0.0.7")).toBe(true);
  });

  it("ne consigne rien quand une opération échoue (transaction annulée)", async () => {
    const before = (await entityHistory(db, "invoice", invoiceId)).length;
    await errorOf(validateDocument(db, actor, invoiceId));
    await errorOf(deleteDraft(db, actor, invoiceId));
    await errorOf(prepareEinvoice(db, actor, invoiceId).then(() => { throw new Error("idempotent"); }));
    expect((await entityHistory(db, "invoice", invoiceId)).length).toBe(before);
  });

  it("garde le libellé brut d'une action inconnue", () => {
    expect(actionLabel("truc.inconnu")).toBe("truc.inconnu");
  });
});

describe("erreurs de gestion", () => {
  const ghost = "00000000-0000-4000-8000-000000000000";

  it("répond par des erreurs métier lisibles sur des identifiants inconnus", async () => {
    expect(await getInvoice(db, ghost)).toBeNull();
    await expect(validateDocument(db, actor, ghost)).rejects.toBeInstanceOf(ServiceError);
    await expect(createCreditNoteDraft(db, actor, ghost, { reason: "Motif valable" })).rejects.toThrow("Facture introuvable");
    await expect(prepareEinvoice(db, actor, ghost)).rejects.toThrow("Seule une facture validée");
    expect(await getEinvoiceExport(db, ghost)).toBeNull();
    expect(await entityHistory(db, "invoice", ghost)).toEqual([]);
  });

  it("refuse une préparation TEIF sur un brouillon ou sur un document sans historique", async () => {
    const d = await createDraftInvoice(db, actor, { customerId, issueDate: "2026-06-01", lines: [line] });
    await expect(prepareEinvoice(db, actor, d.id)).rejects.toThrow("Seule une facture validée");
    expect((await db.select().from(einvoiceExports).where(eq(einvoiceExports.invoiceId, d.id))).length).toBe(0);
  });

  it("valide les saisies côté serveur (client inconnu, quantité, date)", async () => {
    await expect(createDraftInvoice(db, actor, { customerId: ghost, issueDate: "2026-06-01", lines: [line] })).rejects.toBeInstanceOf(ServiceError);
    await expect(createDraftInvoice(db, actor, { customerId, issueDate: "2026-06-01", lines: [{ ...line, quantity: "-1" }] })).rejects.toThrow();
    await expect(createDraftInvoice(db, actor, { customerId, issueDate: "31/12/2026", lines: [line] })).rejects.toThrow();
    await expect(createDraftInvoice(db, actor, { customerId, issueDate: "2026-06-01", lines: [{ ...line, discountPercent: "150" }] })).rejects.toThrow();
  });
});
