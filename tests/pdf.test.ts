import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { createCustomer, updateCustomer } from "@/lib/customers";
import {
  createCreditNoteDraft, createDraftInvoice, validateDocument, type InvoiceLineInput,
} from "@/lib/invoicing/invoices";
import { createDraftQuote, sendQuote } from "@/lib/invoicing/quotes";
import { loadInvoicePdf, loadQuotePdf } from "@/lib/pdf/loaders";
import { renderDocumentPdf, type PdfData } from "@/lib/pdf/render";
import { createTaxRate, listTaxRates } from "@/lib/taxes";
import { createUser } from "@/lib/users";
import { createTestDb } from "./helpers";

/** Relit un PDF produit et en extrait le texte page par page (contrôle du contenu réel). */
async function readPdf(bytes: Uint8Array) {
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  const pageCount = doc.numPages;
  await task.destroy();
  return { pageCount, pages, text: pages.join("\n") };
}

const base = (over: Partial<PdfData> = {}): PdfData => ({
  title: "FACTURE", number: "FA-2026-000001", isDraft: false, issueDate: "2026-03-10", dueDate: "2026-04-09",
  validUntil: null, reference: "BC-42", creditOf: null,
  company: {
    legalName: "ACME SARL", tradeName: null, matriculeFiscal: "7654321B/A/M/000", legalForm: "SARL", capital: "10000.000",
    address: "12 rue de la Liberté", postalCode: "1002", city: "Tunis", phone: "71 000 000", email: "contact@acme.tn",
    bankName: "Banque X", rib: "08 006 0123456789 12",
  },
  customer: { name: "Société Alpha", matriculeFiscal: "1234567/A/M/000", address: "5 avenue Habib Bourguiba", postalCode: "1000", city: "Tunis" },
  lines: [
    { description: "Prestation", quantity: "2.000", unit: "unité", unitPrice: "100.000", discountPercent: "0.000", tva: "19 %", netHt: "200.000" },
    { description: "Marchandise", quantity: "10.000", unit: "sac", unitPrice: "12.500", discountPercent: "0.000", tva: "19 %", netHt: "125.000" },
  ],
  taxes: [
    { kind: "fodec", rate: "1.000", base: "125.000", amount: "1.250" },
    { kind: "tva", rate: "19.000", base: "326.250", amount: "61.988" },
  ],
  totals: {
    ht: "325.000", fodec: "1.250", tva: "61.988", ttc: "388.238", stampDuty: "1.000",
    withholdingRate: "1.500", withholdingAmount: "5.824", netToPay: "383.414",
  },
  wordsAmount: "383.414", wordsIntro: "Arrêtée la présente facture à la somme de :", notes: "Merci de votre confiance.", fingerprint: "abcdef123456",
  ...over,
});

describe("rendu PDF", () => {
  it("produit un PDF A4 lisible avec les montants, les taxes et le montant en lettres", async () => {
    const bytes = await renderDocumentPdf(base());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { text } = await readPdf(bytes);
    for (const expected of [
      "ACME SARL", "MF : 7654321B/A/M/000", "FACTURE", "FA-2026-000001", "Société Alpha", "1234567/A/M/000",
      "Prestation", "Marchandise", "388,238", "383,414", "5,824", "1,000",
      "trois cent quatre-vingt-trois dinars et quatre cent quatorze millimes", "Merci de votre confiance", "empreinte abcdef123456", "Page 1 / 1",
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text).not.toContain("BROUILLON");
  });

  it("marque un brouillon d'un filigrane", async () => {
    const { text } = await readPdf(await renderDocumentPdf(base({ isDraft: true, number: null, fingerprint: null })));
    expect(text).toContain("BROUILLON");
    expect(text).toContain("N° (brouillon)");
  });

  it("pagine un long document en répétant l'en-tête du tableau et numérote les pages", async () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({
      description: `Article numéro ${i + 1} avec une désignation assez longue pour occuper plusieurs lignes sur la page imprimée`,
      quantity: "1.000", unit: "u", unitPrice: "10.000", discountPercent: "0.000", tva: "19 %", netHt: "10.000",
    }));
    const bytes = await renderDocumentPdf(base({ lines }));
    const { pageCount, pages } = await readPdf(bytes);
    expect(pageCount).toBeGreaterThan(2);
    // L'en-tête du tableau est répété sur chaque page qui contient des lignes.
    expect(pages.slice(0, -1).every((p) => p.includes("Désignation"))).toBe(true);
    expect(pages.at(-1)).toContain(`Page ${pageCount} / ${pageCount}`);
    expect(pages.join(" ")).toContain("Article numéro 70");
  });

  it("ne plante pas sur des caractères hors latin (nom arabe, symboles) et les remplace par « ? »", async () => {
    const bytes = await renderDocumentPdf(base({
      customer: { name: "شركة ألفا", matriculeFiscal: null, address: "€ 5 rue ✓", postalCode: null, city: "Tunis" },
      lines: [{ description: "Élément — “test” œuvre", quantity: "1.000", unit: "u", unitPrice: "1.000", discountPercent: "0.000", tva: "19 %", netHt: "1.000" }],
    }));
    const { text } = await readPdf(bytes);
    expect(text).toContain("Tunis");
    expect(text).toContain("Élément");
    expect(text).toContain("?");
  });

  it("affiche un avoir avec sa facture d'origine, sans timbre", async () => {
    const { text } = await readPdf(await renderDocumentPdf(base({
      title: "AVOIR", number: "AV-2026-00001", creditOf: { number: "FA-2026-000001", reason: "Retour" },
      totals: { ht: "10.000", fodec: "0.000", tva: "1.900", ttc: "11.900", stampDuty: "0.000", withholdingRate: null, withholdingAmount: "0.000", netToPay: "11.900" },
      taxes: [{ kind: "tva", rate: "19.000", base: "10.000", amount: "1.900" }], wordsAmount: "11.900",
    })));
    expect(text).toContain("AVOIR");
    expect(text).toContain("Avoir sur la facture N° FA-2026-000001");
    expect(text).toContain("Retour");
    expect(text).not.toContain("Timbre fiscal");
    expect(text).not.toContain("Retenue à la source");
  });
});

describe("chargement depuis la base", () => {
  let db: Db;
  let close: () => Promise<void>;
  let actor: { id: string; email: string };
  let customerId: string;
  let tvaId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    const user = await createUser(db, null, { email: "compta@example.tn", name: "Compta", role: "comptable", password: "Password-12345" });
    actor = { id: user.id, email: user.email };
    tvaId = (await listTaxRates(db)).find((r) => r.code === "TVA19")!.id;
    await updateCompany(db, actor, {
      legalName: "ACME SARL", matriculeFiscal: "7654321B/A/M/000", taxRegime: "reel", vatRegistered: true,
      stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
    });
    const ras = await createTaxRate(db, actor, { code: "RAS15", label: "Retenue 1,5 %", kind: "retenue", rate: "1.5" });
    customerId = (await createCustomer(db, actor, {
      type: "entreprise", name: "Société Alpha", matriculeFiscal: "1234567/A/M/000", taxStatus: "assujetti",
      address: "5 avenue Habib Bourguiba", city: "Tunis", withholdingApplies: true, withholdingRateId: ras.id,
    })).id;
  });
  afterAll(() => close());

  const line = (over: Partial<InvoiceLineInput> = {}): InvoiceLineInput => ({
    description: "Prestation", quantity: "1", unit: "unité", unitPrice: "1000", discountPercent: "0", tvaRateId: tvaId, fodecApplicable: false, ...over,
  });

  it("imprime une facture validée avec ses instantanés : le PDF ne change pas si la fiche client change", async () => {
    const inv = await validateDocument(db, actor, (await createDraftInvoice(db, actor, { customerId, issueDate: "2026-03-10", lines: [line()] })).id);
    const first = await loadInvoicePdf(db, inv.id);
    expect(first?.filename).toBe(`${inv.number}.pdf`);
    expect(first?.data).toMatchObject({ title: "FACTURE", isDraft: false, number: inv.number });
    const { text } = await readPdf(await renderDocumentPdf(first!.data));
    expect(text).toContain("Société Alpha");
    expect(text).toContain(inv.number!);
    expect(text).toContain("1 190,000"); // TTC 1190 (espace des milliers)
    // Le montant en lettres porte sur le net à payer : 1190 + 1 (timbre) − 17,850 (retenue) = 1173,150.
    expect(text).toContain("1 173,150");
    expect(text).toContain("mille cent soixante-treize dinars et cent cinquante millimes");
    expect(text).toContain("empreinte " + inv.contentHash!.slice(0, 12));

    // Le client est renommé : le document validé garde le nom figé à la validation.
    await updateCustomer(db, actor, customerId, {
      type: "entreprise", name: "Nom modifié", matriculeFiscal: "1234567/A/M/000", taxStatus: "assujetti",
      withholdingApplies: true, withholdingRateId: (await listTaxRates(db)).find((r) => r.code === "RAS15")!.id,
    });
    const again = await readPdf(await renderDocumentPdf((await loadInvoicePdf(db, inv.id))!.data));
    expect(again.text).toContain("Société Alpha");
    expect(again.text).not.toContain("Nom modifié");
  });

  it("imprime un brouillon avec filigrane et données courantes", async () => {
    const draft = await createDraftInvoice(db, actor, { customerId, issueDate: "2026-03-11", lines: [line({ description: "Brouillon test" })] });
    const loaded = await loadInvoicePdf(db, draft.id);
    expect(loaded?.data.isDraft).toBe(true);
    expect(loaded?.filename).toMatch(/^brouillon-[0-9a-f]{8}\.pdf$/);
    const { text } = await readPdf(await renderDocumentPdf(loaded!.data));
    expect(text).toContain("BROUILLON");
  });

  it("imprime un avoir avec sa facture d'origine", async () => {
    const orig = await validateDocument(db, actor, (await createDraftInvoice(db, actor, { customerId, issueDate: "2026-03-12", lines: [line()] })).id);
    const credit = await validateDocument(db, actor, (await createCreditNoteDraft(db, actor, orig.id, { reason: "Erreur de prix", issueDate: "2026-03-13" })).id);
    const loaded = await loadInvoicePdf(db, credit.id);
    expect(loaded?.data.creditOf).toEqual({ number: orig.number, reason: "Erreur de prix" });
    const { text } = await readPdf(await renderDocumentPdf(loaded!.data));
    expect(text).toContain("AVOIR");
    expect(text).toContain(`Avoir sur la facture N° ${orig.number}`);
  });

  it("imprime un devis sans timbre ni retenue", async () => {
    const q = await sendQuote(db, actor, (await createDraftQuote(db, actor, {
      customerId, issueDate: "2026-03-10", validUntil: "2099-01-01", lines: [line({ unitPrice: "500" })],
    })).id);
    const loaded = await loadQuotePdf(db, q.id);
    expect(loaded?.filename).toBe(`${q.number}.pdf`);
    const { text } = await readPdf(await renderDocumentPdf(loaded!.data));
    expect(text).toContain("DEVIS");
    expect(text).toContain("Valable jusqu'au");
    expect(text).toContain("Arrêté le présent devis");
    expect(text).not.toContain("Timbre fiscal");
    expect(text).not.toContain("Retenue à la source");
  });

  it("renvoie null pour un document inconnu", async () => {
    expect(await loadInvoicePdf(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await loadQuotePdf(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
