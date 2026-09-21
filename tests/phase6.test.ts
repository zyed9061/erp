import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { eq, sql } from "drizzle-orm";
import { deliveryNotes, invoices, projectSituations, stockMovements } from "@/db/schema";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { createCustomer } from "@/lib/customers";
import {
  cancelDeliveryNote, createDraftDeliveryNote, createInvoiceFromDeliveryNotes, deleteDraftDeliveryNote,
  getDeliveryNote, listDeliveryNotes, updateDraftDeliveryNote, validateDeliveryNote,
} from "@/lib/delivery";
import { ServiceError } from "@/lib/errors";
import {
  createCreditNoteDraft, deleteDraft, getInvoice, updateDraftInvoice, validateDocument,
} from "@/lib/invoicing/invoices";
import { getInvoiceBalance, paymentStateOf, recordPayment } from "@/lib/invoicing/payments";
import { loadDeliveryNotePdf, renderDeliveryNotePdf } from "@/lib/pdf/delivery";
import { loadInvoicePdf } from "@/lib/pdf/loaders";
import { renderDocumentPdf } from "@/lib/pdf/render";
import { createProduct, updateProduct } from "@/lib/products";
import {
  createProject, createSituation, getProject, listProjects, releaseHoldback, setProjectStatus, updateProject,
} from "@/lib/projects";
import { addStockMovement, listMovements, listStock, stockOnHand } from "@/lib/stock";
import { listTaxRates } from "@/lib/taxes";
import { toMilli } from "@/lib/money";
import { createUser } from "@/lib/users";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let actor: { id: string; email: string };
let rates: Record<string, string>;
let beta: string;
let gamma: string;
const DATE = "2026-03-10";

async function errorOf(p: Promise<unknown>) {
  return p.then(() => null, (e: Error & { cause?: Error }) => e);
}
const dbMessage = (e: (Error & { cause?: Error }) | null) => `${e?.message} ${e?.cause?.message}`;

const goods = (name: string, extra: Partial<Parameters<typeof createProduct>[2]> = {}) =>
  createProduct(db, actor, {
    type: "bien", name, unit: "sac", unitPrice: "12.5", tvaRateId: rates.TVA19!, trackStock: true, minStock: "5", ...extra,
  });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const user = await createUser(db, null, { email: "compta@example.tn", name: "Compta", role: "comptable", password: "Password-12345" });
  actor = { id: user.id, email: user.email };
  rates = Object.fromEntries((await listTaxRates(db)).map((r) => [r.code, r.id]));
  await updateCompany(db, actor, {
    legalName: "ACME SARL", matriculeFiscal: "7654321B/A/M/000", taxRegime: "reel", vatRegistered: true,
    stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
  });
  const mk = (name: string, mf: string) =>
    createCustomer(db, actor, { type: "entreprise", name, matriculeFiscal: mf, taxStatus: "assujetti" }).then((c) => c.id);
  beta = await mk("Beta SARL", "2222222/A/M/000");
  gamma = await mk("Gamma SA", "3333333/A/M/000");
});
afterAll(() => close());

// ---------------------------------------------------------------------------------------------------------------
describe("stock", () => {
  let ciment: string;

  it("ne suit en stock que les biens", async () => {
    ciment = (await goods("Ciment 50 kg")).id;
    await expect(createProduct(db, actor, {
      type: "service", name: "Conseil", unit: "h", unitPrice: "100", tvaRateId: rates.TVA19!, trackStock: true,
    })).rejects.toBeInstanceOf(ServiceError);
    expect(await stockOnHand(db, ciment)).toBe("0.000");
  });

  it("enregistre entrées, sorties et ajustements ; le stock est la somme du registre", async () => {
    await addStockMovement(db, actor, { productId: ciment, type: "entry", quantity: "100", reference: "BR-1" });
    await addStockMovement(db, actor, { productId: ciment, type: "exit", quantity: "30", notes: "Casse" });
    expect(await stockOnHand(db, ciment)).toBe("70.000");
    await addStockMovement(db, actor, { productId: ciment, type: "adjustment", quantity: "-10", notes: "Inventaire du 31/12" });
    await addStockMovement(db, actor, { productId: ciment, type: "adjustment", quantity: "2.5", notes: "Inventaire : reliquat" });
    expect(await stockOnHand(db, ciment)).toBe("62.500");
    const movements = await listMovements(db, ciment);
    expect(movements.map((m) => [m.type, m.quantity]).sort()).toEqual(
      [["adjustment", "-10.000"], ["adjustment", "2.500"], ["entry", "100.000"], ["exit", "-30.000"]],
    );
  });

  it("refuse une sortie qui rendrait le stock négatif, sans rien enregistrer", async () => {
    const err = await errorOf(addStockMovement(db, actor, { productId: ciment, type: "exit", quantity: "100" }));
    expect(err).toBeInstanceOf(ServiceError);
    expect(err?.message).toMatch(/Stock insuffisant.*62,500|Stock insuffisant.*62\.500/);
    expect(await stockOnHand(db, ciment)).toBe("62.500");
  });

  it("valide les saisies : quantité nulle, signe, motif d'ajustement, produit non suivi", async () => {
    for (const input of [
      { type: "entry" as const, quantity: "0" },
      { type: "entry" as const, quantity: "-5" },
      { type: "exit" as const, quantity: "-5" },
      { type: "adjustment" as const, quantity: "5" }, // sans motif
      { type: "adjustment" as const, quantity: "0", notes: "motif" },
    ]) {
      await expect(addStockMovement(db, actor, { productId: ciment, ...input })).rejects.toThrow();
    }
    const untracked = await goods("Non suivi", { trackStock: false });
    await expect(addStockMovement(db, actor, { productId: untracked.id, type: "entry", quantity: "1" })).rejects.toBeInstanceOf(ServiceError);
  });

  it("empêche deux sorties simultanées de vider deux fois le même stock", async () => {
    const p = (await goods("Sable")).id;
    await addStockMovement(db, actor, { productId: p, type: "entry", quantity: "70" });
    const results = await Promise.allSettled([
      addStockMovement(db, actor, { productId: p, type: "exit", quantity: "40" }),
      addStockMovement(db, actor, { productId: p, type: "exit", quantity: "40" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await stockOnHand(db, p)).toBe("30.000");
  });

  it("garde le registre en ajout seul (corrections par ajustement)", async () => {
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE stock_movements SET quantity = 1`)))).toMatch(/ajout seul/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM stock_movements`)))).toMatch(/ajout seul/);
    expect(dbMessage(await errorOf(db.execute(sql`INSERT INTO stock_movements (product_id, type, quantity, occurred_on) SELECT id, 'entry', -1, '2026-01-01' FROM products LIMIT 1`)))).toMatch(/entry_sign/);
  });

  it("signale les stocks bas et les ruptures", async () => {
    const low = (await goods("Brique")).id; // seuil 5
    await addStockMovement(db, actor, { productId: low, type: "entry", quantity: "4" });
    const rupture = (await goods("Fer")).id;
    const rows = (await listStock(db, { lowOnly: true })).rows;
    const byName = Object.fromEntries(rows.map((r) => [r.product.name, r]));
    expect(byName["Brique"]).toMatchObject({ low: true, outOfStock: false, onHand: "4.000" });
    expect(byName["Fer"]).toMatchObject({ outOfStock: true, onHand: "0.000" });
    expect(byName["Ciment 50 kg"]).toBeUndefined(); // 62,5 > seuil
    void rupture;
  });

  it("refuse de désactiver le suivi tant qu'il reste du stock", async () => {
    const base = { type: "bien" as const, name: "Ciment 50 kg", unit: "sac", unitPrice: "12.5", tvaRateId: rates.TVA19! };
    await expect(updateProduct(db, actor, ciment, { ...base, trackStock: false })).rejects.toBeInstanceOf(ServiceError);
    await expect(updateProduct(db, actor, ciment, { ...base, type: "service", trackStock: true })).rejects.toBeInstanceOf(ServiceError);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("bons de livraison", () => {
  let widget: string; // suivi, 20 en stock
  let free: string; // non suivi

  beforeAll(async () => {
    widget = (await goods("Widget", { unitPrice: "100" })).id;
    free = (await goods("Sur mesure", { trackStock: false, unitPrice: "40" })).id;
    await addStockMovement(db, actor, { productId: widget, type: "entry", quantity: "20" });
  });

  const note = (customerId: string, lines: { productId: string; quantity: string; unitPrice?: string }[], issueDate = DATE) =>
    createDraftDeliveryNote(db, actor, { customerId, issueDate, lines });

  it("copie le prix et la TVA du produit, refuse services, quantités nulles et bons vides", async () => {
    const n = await note(beta, [{ productId: widget, quantity: "3" }]);
    expect(n).toMatchObject({ status: "draft", number: null });
    const lines = (await getDeliveryNote(db, n.id))!.lines;
    expect(lines[0]).toMatchObject({ description: "Widget", unit: "sac", unitPrice: "100.000", tvaCode: "TVA19", tvaRate: "19.000" });

    const service = await createProduct(db, actor, { type: "service", name: "Pose", unit: "h", unitPrice: "50", tvaRateId: rates.TVA19! });
    await expect(note(beta, [{ productId: service.id, quantity: "1" }])).rejects.toBeInstanceOf(ServiceError);
    await expect(note(beta, [{ productId: widget, quantity: "0" }])).rejects.toThrow();
    await expect(note(beta, [])).rejects.toThrow();
  });

  it("valide : numéro sans trou, sortie de stock, verrouillage (service et base)", async () => {
    const n = await note(beta, [{ productId: widget, quantity: "5" }, { productId: widget, quantity: "2" }, { productId: free, quantity: "9" }]);
    const v = await validateDeliveryNote(db, actor, n.id);
    expect(v).toMatchObject({ status: "validated", number: "BL-2026-00001" });
    expect(await stockOnHand(db, widget)).toBe("13.000"); // 20 − (5 + 2) ; « Sur mesure » non suivi : aucun mouvement
    const moves = (await listMovements(db, widget)).filter((m) => m.deliveryNoteId === n.id);
    expect(moves).toHaveLength(1); // une seule sortie pour le produit, lignes cumulées
    expect(moves[0]).toMatchObject({ type: "delivery", quantity: "-7.000", reference: "BL-2026-00001" });
    expect((await db.select().from(stockMovements).where(eq(stockMovements.productId, free)))).toHaveLength(0);

    expect(await errorOf(updateDraftDeliveryNote(db, actor, n.id, { customerId: beta, issueDate: DATE, lines: [{ productId: widget, quantity: "1" }] }))).toBeInstanceOf(ServiceError);
    expect(await errorOf(deleteDraftDeliveryNote(db, actor, n.id))).toBeInstanceOf(ServiceError);
    expect(await errorOf(validateDeliveryNote(db, actor, n.id))).toBeInstanceOf(ServiceError);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE delivery_notes SET reference = 'x' WHERE id = ${n.id}`)))).toMatch(/contenu verrouillé/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM delivery_notes WHERE id = ${n.id}`)))).toMatch(/suppression interdite/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM delivery_note_lines WHERE delivery_note_id = ${n.id}`)))).toMatch(/lecture seule/);
  });

  it("refuse un stock insuffisant sans rien modifier, et sans consommer de numéro", async () => {
    const tooBig = await note(beta, [{ productId: widget, quantity: "50" }]);
    const err = await errorOf(validateDeliveryNote(db, actor, tooBig.id));
    expect(err).toBeInstanceOf(ServiceError);
    expect(err?.message).toMatch(/Stock insuffisant/);
    expect((await getDeliveryNote(db, tooBig.id))!.note.status).toBe("draft");
    expect(await stockOnHand(db, widget)).toBe("13.000");

    const ok = await validateDeliveryNote(db, actor, (await note(beta, [{ productId: widget, quantity: "1" }])).id);
    expect(ok.number).toBe("BL-2026-00002"); // pas de trou
    await deleteDraftDeliveryNote(db, actor, tooBig.id);
  });

  it("annule un bon non facturé : remise en stock, numéro conservé, bon définitivement figé", async () => {
    const n = await validateDeliveryNote(db, actor, (await note(beta, [{ productId: widget, quantity: "4" }])).id);
    const before = await stockOnHand(db, widget);
    await expect(cancelDeliveryNote(db, actor, n.id, "")).rejects.toThrow();
    const c = await cancelDeliveryNote(db, actor, n.id, "Client absent");
    expect(c).toMatchObject({ status: "cancelled", number: n.number, cancelReason: "Client absent" });
    expect(toMilli(await stockOnHand(db, widget))).toBe(toMilli(before) + 4000n);
    expect(await errorOf(cancelDeliveryNote(db, actor, n.id, "Encore"))).toBeInstanceOf(ServiceError);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE delivery_notes SET cancel_reason = 'x' WHERE id = ${n.id}`)))).toMatch(/annulé/);
  });

  it("imprime un bon de livraison sans prix, avec zone de signature", async () => {
    const n = await validateDeliveryNote(db, actor, (await note(beta, [{ productId: widget, quantity: "2" }])).id);
    const loaded = await loadDeliveryNotePdf(db, n.id);
    expect(loaded?.filename).toBe(`${n.number}.pdf`);
    expect(loaded?.data).toMatchObject({ status: "validated", number: n.number, lines: [{ description: "Widget", quantity: "2.000", unit: "sac" }] });
    const bytes = await renderDeliveryNotePdf(loaded!.data);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    const draft = await note(beta, [{ productId: widget, quantity: "1" }]);
    expect((await loadDeliveryNotePdf(db, draft.id))?.data.status).toBe("draft");
    expect(await loadDeliveryNotePdf(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
    await deleteDraftDeliveryNote(db, actor, draft.id);
    await cancelDeliveryNote(db, actor, n.id, "Test d'impression");
  });

  it("facture plusieurs bons du même client aux prix figés, et empêche de les facturer deux fois", async () => {
    const a = await validateDeliveryNote(db, actor, (await note(beta, [{ productId: widget, quantity: "2" }])).id);
    const b = await validateDeliveryNote(db, actor, (await note(beta, [{ productId: widget, quantity: "1", unitPrice: "90" }, { productId: free, quantity: "3" }])).id);
    // Le prix du produit change après coup : la facture garde celui des bons.
    await updateProduct(db, actor, widget, { type: "bien", name: "Widget", unit: "sac", unitPrice: "999", tvaRateId: rates.TVA19!, trackStock: true, minStock: "5" });

    expect((await listDeliveryNotes(db, { toInvoice: true, customerId: beta })).rows.map((r) => r.note.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    const inv = await createInvoiceFromDeliveryNotes(db, actor, { noteIds: [a.id, b.id] });
    const details = (await getInvoice(db, inv.id))!;
    expect(details.lines.map((l) => [l.description, l.quantity, l.unitPrice])).toEqual([
      [`Widget (BL ${a.number})`, "2.000", "100.000"],
      [`Widget (BL ${b.number})`, "1.000", "90.000"],
      [`Sur mesure (BL ${b.number})`, "3.000", "40.000"],
    ]);
    expect(inv).toMatchObject({ kind: "invoice", status: "draft", totalHt: "410.000", reference: `${a.number}, ${b.number}` }); // 200 + 90 + 120
    expect((await getDeliveryNote(db, a.id))!.note.invoiceId).toBe(inv.id);

    expect((await errorOf(createInvoiceFromDeliveryNotes(db, actor, { noteIds: [a.id] })))?.message).toMatch(/déjà repris/);
    expect((await errorOf(cancelDeliveryNote(db, actor, a.id, "Erreur")))?.message).toMatch(/repris dans une facture/);
    expect((await listDeliveryNotes(db, { toInvoice: true, customerId: beta })).rows.map((r) => r.note.id)).not.toContain(a.id);

    // Supprimer le brouillon de facture libère les bons.
    await deleteDraft(db, actor, inv.id);
    expect((await getDeliveryNote(db, a.id))!.note.invoiceId).toBeNull();
    const again = await createInvoiceFromDeliveryNotes(db, actor, { noteIds: [a.id, b.id] });
    expect(again.id).not.toBe(inv.id);
    const validated = await validateDocument(db, actor, again.id);
    expect(validated.status).toBe("validated");
  });

  it("refuse de facturer ensemble des bons de clients différents, des brouillons ou des bons annulés", async () => {
    const forBeta = await validateDeliveryNote(db, actor, (await note(beta, [{ productId: widget, quantity: "1" }])).id);
    const forGamma = await validateDeliveryNote(db, actor, (await note(gamma, [{ productId: widget, quantity: "1" }])).id);
    expect((await errorOf(createInvoiceFromDeliveryNotes(db, actor, { noteIds: [forBeta.id, forGamma.id] })))?.message).toMatch(/même client/);
    const draft = await note(beta, [{ productId: widget, quantity: "1" }]);
    expect(await errorOf(createInvoiceFromDeliveryNotes(db, actor, { noteIds: [draft.id] }))).toBeInstanceOf(ServiceError);
    const cancelled = await cancelDeliveryNote(db, actor, forGamma.id, "Annulé");
    expect(await errorOf(createInvoiceFromDeliveryNotes(db, actor, { noteIds: [cancelled.id] }))).toBeInstanceOf(ServiceError);
    await expect(createInvoiceFromDeliveryNotes(db, actor, { noteIds: [] })).rejects.toThrow();
  });

  it("liste avec filtres", async () => {
    expect((await listDeliveryNotes(db, { status: "cancelled" })).rows.every((r) => r.note.status === "cancelled")).toBe(true);
    expect((await listDeliveryNotes(db, { q: "BL-2026-00001" })).total).toBe(1);
    expect((await db.select().from(deliveryNotes)).length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("chantiers : situations de travaux et retenue de garantie", () => {
  let projectId: string;
  let lineIds: string[];
  const bordereau = [
    { description: "Maçonnerie", unit: "m²", quantity: "100", unitPrice: "50", tvaRateId: "" },
    { description: "Toiture (forfait)", unit: "u", quantity: "1", unitPrice: "10000", tvaRateId: "" },
  ];
  let inv1: Awaited<ReturnType<typeof validateDocument>>;

  beforeAll(async () => {
    bordereau[0]!.tvaRateId = rates.TVA19!;
    bordereau[1]!.tvaRateId = rates.TVA7!;
    const p = await createProject(db, actor, { name: "Villa Salma", customerId: beta, holdbackPercent: "10", lines: bordereau });
    projectId = p.id;
    lineIds = (await getProject(db, projectId))!.lines.map((l) => l.id);
  });

  it("calcule le montant du marché", async () => {
    const p = (await getProject(db, projectId))!;
    expect(p.contract).toEqual({ ht: "15000.000", tva: "1650.000", ttc: "16650.000" }); // 5000×19 % + 10000×7 % = 950 + 700
    expect(p.overallPercent).toBe("0.000");
    expect((await listProjects(db, { q: "Salma" })).rows[0]).toMatchObject({ contractHt: "15000.000", situations: 0 });
  });

  it("facture la situation n° 1 sur l'avancement cumulé, avec retenue de garantie sur le TTC", async () => {
    const { invoice, number } = await createSituation(db, actor, projectId, {
      issueDate: "2026-10-01", progress: [{ projectLineId: lineIds[0]!, cumulativePercent: "30" }, { projectLineId: lineIds[1]!, cumulativePercent: "20" }],
    });
    expect(number).toBe(1);
    const lines = (await getInvoice(db, invoice.id))!.lines;
    expect(lines.map((l) => [l.description, l.quantity, l.unitPrice])).toEqual([
      ["Situation n° 1 — Maçonnerie", "30.000", "50.000"],
      ["Situation n° 1 — Toiture (forfait)", "0.200", "10000.000"],
    ]);
    // HT 1500 + 2000 ; TVA 285 + 140 ; TTC 3925 ; retenue de garantie 10 % = 392,500 ; timbre 1
    expect(invoice).toMatchObject({
      totalHt: "3500.000", totalTva: "425.000", totalTtc: "3925.000", guaranteeHoldbackRate: "10.000",
      guaranteeHoldback: "392.500", stampDuty: "1.000", netToPay: "3533.500", projectId,
    });
    inv1 = await validateDocument(db, actor, invoice.id);
    expect(inv1.status).toBe("validated");
    expect((await getProject(db, projectId))!.holdback).toEqual({ held: "392.500", released: "0.000", remaining: "392.500" });
  });

  it("le solde à payer exclut la retenue de garantie (pas de retard artificiel)", async () => {
    const b = (await getInvoiceBalance(db, inv1.id))!;
    expect(paymentStateOf(b, inv1.dueDate).due).toBe("3533.500");
    await recordPayment(db, actor, { customerId: beta, paymentDate: "2026-10-05", amount: "3533.5", method: "virement", allocations: [{ invoiceId: inv1.id, amount: "3533.5" }] });
    expect(paymentStateOf((await getInvoiceBalance(db, inv1.id))!, inv1.dueDate)).toMatchObject({ status: "paid", due: "0.000" });
  });

  it("n'autorise pas de nouvelle situation tant que la précédente est en brouillon, ni un recul d'avancement", async () => {
    const draft = await createSituation(db, actor, projectId, { issueDate: "2026-11-01", progress: [{ projectLineId: lineIds[0]!, cumulativePercent: "50" }] });
    expect(draft.number).toBe(2);
    expect((await errorOf(createSituation(db, actor, projectId, { progress: [{ projectLineId: lineIds[0]!, cumulativePercent: "60" }] })))?.message).toMatch(/situation n° 2/);
    // Supprimer le brouillon de facture supprime la situation ; le numéro est réutilisé.
    await deleteDraft(db, actor, draft.invoice.id);
    expect((await db.select().from(projectSituations).where(eq(projectSituations.projectId, projectId))).map((s) => s.number)).toEqual([1]);

    const back = await errorOf(createSituation(db, actor, projectId, { progress: [{ projectLineId: lineIds[0]!, cumulativePercent: "25" }] }));
    expect(back).toBeInstanceOf(ServiceError);
    expect(back?.message).toMatch(/inférieur au précédent/);
    expect((await errorOf(createSituation(db, actor, projectId, { progress: [{ projectLineId: lineIds[0]!, cumulativePercent: "30" }] })))?.message).toMatch(/Aucun avancement/);
    await expect(createSituation(db, actor, projectId, { progress: [{ projectLineId: lineIds[0]!, cumulativePercent: "101" }] })).rejects.toThrow();
    expect(await errorOf(createSituation(db, actor, projectId, { progress: [{ projectLineId: "00000000-0000-0000-0000-000000000000", cumulativePercent: "50" }] }))).toBeInstanceOf(ServiceError);
  });

  it("facture uniquement l'avancement ajouté, puis retombe exactement sur le marché à 100 %", async () => {
    const s2 = await createSituation(db, actor, projectId, {
      issueDate: "2026-11-01", progress: [{ projectLineId: lineIds[0]!, cumulativePercent: "70" }],
    });
    const l2 = (await getInvoice(db, s2.invoice.id))!.lines;
    expect(l2.map((l) => [l.quantity])).toEqual([["40.000"]]); // 70 − 30 m² ; le forfait reste à 20 %
    const inv2 = await validateDocument(db, actor, s2.invoice.id);

    const s3 = await createSituation(db, actor, projectId, {
      issueDate: "2026-12-01", progress: [{ projectLineId: lineIds[0]!, cumulativePercent: "100" }, { projectLineId: lineIds[1]!, cumulativePercent: "100" }],
    });
    const inv3 = await validateDocument(db, actor, s3.invoice.id);

    const project = (await getProject(db, projectId))!;
    expect(project.overallPercent).toBe("100.000");
    expect(project.doneHt).toBe("15000.000");
    const billedHt = [inv1, inv2, inv3].reduce((s, i) => s + toMilli(i.totalHt), 0n);
    expect(billedHt).toBe(toMilli("15000.000")); // rien perdu, rien facturé deux fois
    const billedTva = [inv1, inv2, inv3].reduce((s, i) => s + toMilli(i.totalTva), 0n);
    expect(billedTva).toBe(toMilli("1650.000"));
    expect(project.holdback.held).toBe("1665.000"); // 10 % de 16 650 TTC
  });

  it("répartit les quantités sans dérive d'arrondi (arrondi sur le cumul, pas sur le delta)", async () => {
    const p = await createProject(db, actor, {
      name: "Terrassement", customerId: gamma, holdbackPercent: "0",
      lines: [{ description: "Remblai", unit: "m³", quantity: "7", unitPrice: "10", tvaRateId: rates.TVA19! }],
    });
    const line = (await getProject(db, p.id))!.lines[0]!.id;
    const qty: string[] = [];
    for (const pct of ["33.333", "66.667", "100"]) {
      const s = await createSituation(db, actor, p.id, { issueDate: "2027-01-10", progress: [{ projectLineId: line, cumulativePercent: pct }] });
      qty.push((await getInvoice(db, s.invoice.id))!.lines[0]!.quantity);
      const v = await validateDocument(db, actor, s.invoice.id);
      expect(v.guaranteeHoldbackRate).toBeNull(); // pas de retenue de garantie sur ce chantier
      expect(v.guaranteeHoldback).toBe("0.000");
    }
    expect(qty).toEqual(["2.333", "2.334", "2.333"]);
    expect(qty.reduce((s, q) => s + toMilli(q), 0n)).toBe(7000n);
  });

  it("libère la retenue de garantie sans dépasser ce qui est retenu, en ajout seul", async () => {
    await expect(releaseHoldback(db, actor, projectId, { amount: "0" })).rejects.toThrow();
    expect((await errorOf(releaseHoldback(db, actor, projectId, { amount: "2000" })))?.message).toMatch(/dépasse la retenue restante \(1665\.000/);
    await releaseHoldback(db, actor, projectId, { amount: "645", reference: "PV réception provisoire" });
    expect((await getProject(db, projectId))!.holdback).toEqual({ held: "1665.000", released: "645.000", remaining: "1020.000" });
    expect(await errorOf(releaseHoldback(db, actor, projectId, { amount: "1020.001" }))).toBeInstanceOf(ServiceError);
    await releaseHoldback(db, actor, projectId, { amount: "1020" });
    expect((await getProject(db, projectId))!.holdback.remaining).toBe("0.000");
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM project_holdback_releases`)))).toMatch(/ajout seul/);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE project_holdback_releases SET amount = 1`)))).toMatch(/ajout seul/);
  });

  it("verrouille le bordereau dès la première situation et les avancements une fois validés", async () => {
    const before = (await getProject(db, projectId))!;
    expect(before.canEditLines).toBe(false);
    const meta = await updateProject(db, actor, projectId, { name: "Villa Salma (tranche 1)", customerId: beta, holdbackPercent: "5", lines: bordereau });
    expect(meta.name).toBe("Villa Salma (tranche 1)"); // nom et retenue ajustables, pas le bordereau
    expect(await errorOf(updateProject(db, actor, projectId, { name: "x", customerId: gamma, lines: bordereau }))).toBeInstanceOf(ServiceError);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE project_lines SET quantity = 999 WHERE project_id = ${projectId}`)))).toMatch(/bordereau verrouillé/);
    expect(dbMessage(await errorOf(db.execute(sql`DELETE FROM project_lines WHERE project_id = ${projectId}`)))).toMatch(/bordereau verrouillé/);
    expect(dbMessage(await errorOf(db.execute(sql`UPDATE project_situation_lines SET cumulative_percent = 1`)))).toMatch(/lecture seule/);
  });

  it("un avoir sur une situation reprend la retenue de garantie (pas d'écart avec le net facturé)", async () => {
    const credit = await createCreditNoteDraft(db, actor, inv1.id, { reason: "Erreur de métré", issueDate: "2026-08-01" });
    expect(credit).toMatchObject({ guaranteeHoldbackRate: "10.000", guaranteeHoldback: "392.500", stampDuty: "0.000", netToPay: "3532.500" }); // 3925 − 392,5 (timbre non remboursé)
    await deleteDraft(db, actor, credit.id);
  });

  it("conserve la retenue de garantie quand on modifie le brouillon de situation", async () => {
    const p = await createProject(db, actor, {
      name: "Clôture", customerId: beta, holdbackPercent: "10",
      lines: [{ description: "Mur", unit: "ml", quantity: "10", unitPrice: "100", tvaRateId: rates.TVA19! }],
    });
    const l = (await getProject(db, p.id))!.lines[0]!.id;
    const s = await createSituation(db, actor, p.id, { progress: [{ projectLineId: l, cumulativePercent: "50" }] });
    const details = (await getInvoice(db, s.invoice.id))!;
    const edited = await updateDraftInvoice(db, actor, s.invoice.id, {
      customerId: beta, issueDate: details.invoice.issueDate,
      lines: [{ description: "Mur (métré révisé)", quantity: "8", unit: "ml", unitPrice: "100", discountPercent: "0", tvaRateId: rates.TVA19!, fodecApplicable: false }],
    });
    expect(edited).toMatchObject({ totalTtc: "952.000", guaranteeHoldbackRate: "10.000", guaranteeHoldback: "95.200" }); // 800 + 152 = 952
  });

  it("imprime la retenue de garantie sur le PDF", async () => {
    const loaded = await loadInvoicePdf(db, inv1.id);
    expect(loaded?.data.totals).toMatchObject({ guaranteeHoldbackRate: "10.000", guaranteeHoldback: "392.500" });
    const bytes = await renderDocumentPdf(loaded!.data);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("clôture un chantier : plus de situation possible", async () => {
    const p = await createProject(db, actor, {
      name: "À clôturer", customerId: beta,
      lines: [{ description: "Poste", unit: "u", quantity: "1", unitPrice: "100", tvaRateId: rates.TVA19! }],
    });
    await setProjectStatus(db, actor, p.id, "completed");
    const line = (await getProject(db, p.id))!.lines[0]!.id;
    expect(await errorOf(createSituation(db, actor, p.id, { progress: [{ projectLineId: line, cumulativePercent: "10" }] }))).toBeInstanceOf(ServiceError);
  });

  it("valide les saisies du chantier", async () => {
    const base = { name: "X", customerId: beta, lines: bordereau };
    await expect(createProject(db, actor, { ...base, name: "" })).rejects.toThrow();
    await expect(createProject(db, actor, { ...base, lines: [] })).rejects.toThrow();
    await expect(createProject(db, actor, { ...base, holdbackPercent: "150" })).rejects.toThrow();
    await expect(createProject(db, actor, { ...base, lines: [{ ...bordereau[0]!, quantity: "0" }] })).rejects.toThrow();
    await expect(createProject(db, actor, { ...base, lines: [{ ...bordereau[0]!, tvaRateId: rates.FODEC1! }] })).rejects.toBeInstanceOf(ServiceError);
    void invoices;
  });
});
