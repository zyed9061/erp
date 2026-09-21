import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { count, eq, sql } from "drizzle-orm";
import { auditLog, einvoiceExports } from "@/db/schema";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { createCustomer, updateCustomer } from "@/lib/customers";
import { checkReadiness } from "@/lib/einvoice/readiness";
import { getEinvoiceExport, getEinvoiceStatus, loadEinvoiceData, prepareEinvoice } from "@/lib/einvoice/service";
import { buildTeifXml, type EinvoiceData } from "@/lib/einvoice/teif";
import { PENDING_CODE, unitCode } from "@/lib/einvoice/teif-codes";
import { escapeXml } from "@/lib/einvoice/xml";
import { createCreditNoteDraft, createDraftInvoice, validateDocument, type InvoiceLineInput } from "@/lib/invoicing/invoices";
import { createTaxRate, listTaxRates } from "@/lib/taxes";
import { createUser } from "@/lib/users";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let actor: { id: string; email: string };
let rates: Record<string, string>;
let alpha: string; // client complet, avec retenue à la source
let noMf: string; // entreprise sans matricule fiscal
let noAddress: string;
let invoiceId: string;
let draftId: string;

const line = (over: Partial<InvoiceLineInput> & { tva?: string } = {}): InvoiceLineInput => ({
  description: "Prestation", quantity: "1", unit: "u", unitPrice: "100", discountPercent: "0",
  tvaRateId: rates[over.tva ?? "TVA19"]!, fodecApplicable: false, ...over,
});
const make = async (customerId: string, lines: InvoiceLineInput[], date = "2026-03-10") =>
  validateDocument(db, actor, (await createDraftInvoice(db, actor, { customerId, issueDate: date, dueDate: "2026-04-10", reference: "BC-77", lines })).id);

const parse = (xml: string) => {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, msg) => { if (level !== "warning") errors.push(msg); } }).parseFromString(xml, "text/xml");
  return { doc, errors };
};
const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: Error & { cause?: Error }) => e);
const dbMessage = (e: (Error & { cause?: Error }) | null) => `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const user = await createUser(db, null, { email: "compta@example.tn", name: "Compta", role: "comptable", password: "Password-12345" });
  actor = { id: user.id, email: user.email };
  rates = Object.fromEntries((await listTaxRates(db)).map((r) => [r.code, r.id]));
  await updateCompany(db, actor, {
    legalName: "ACME & Fils SARL", matriculeFiscal: "7654321B/A/M/000", address: "1 rue de l'Industrie", city: "Tunis", postalCode: "1002",
    taxRegime: "reel", vatRegistered: true, stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
  });
  const ras = await createTaxRate(db, actor, { code: "RAS15", label: "Retenue 1,5 %", kind: "retenue", rate: "1.5" });
  alpha = (await createCustomer(db, actor, {
    type: "entreprise", name: "Alpha SARL", matriculeFiscal: "1111111/A/M/000", taxStatus: "assujetti", address: "5 avenue Habib Bourguiba",
    city: "Sfax", postalCode: "3000", withholdingApplies: true, withholdingRateId: ras.id,
  })).id;
  noMf = (await createCustomer(db, actor, { type: "entreprise", name: "Sans MF SA", taxStatus: "exonere", address: "Rue X" })).id;
  noAddress = (await createCustomer(db, actor, { type: "entreprise", name: "Sans Adresse SA", matriculeFiscal: "3333333/A/M/000", taxStatus: "assujetti" })).id;

  // HT 1000 + 1000 (FODEC 1 % sur la 1re) = 2000 ; TVA 19 % sur 2010 = 381,900 ; TTC 2391,900
  invoiceId = (await make(alpha, [line({ unitPrice: "1000", fodecApplicable: true, description: "Fourniture <A&B> \"x\"" }), line({ unitPrice: "1000", unit: "h" })])).id;
  draftId = (await createDraftInvoice(db, actor, { customerId: alpha, issueDate: "2026-03-20", lines: [line()] })).id;
});
afterAll(() => close());

describe("échappement XML", () => {
  it("échappe les caractères spéciaux et supprime les caractères interdits", () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;");
    expect(escapeXml("a\u0000b\u0008c\u000Bd￾e")).toBe("abcde");
    expect(escapeXml("tab\tlf\ncr\r")).toBe("tab\tlf\ncr\r");
  });
  it("associe les unités usuelles à un code UN/ECE, C62 par défaut", () => {
    expect([unitCode("h"), unitCode("m²"), unitCode("Jour"), unitCode("inconnue")]).toEqual(["HUR", "MTK", "DAY", "C62"]);
  });
});

describe("préparation", () => {
  it("refuse un brouillon", async () => {
    expect(await loadEinvoiceData(db, draftId)).toBeNull();
    await expect(prepareEinvoice(db, actor, draftId)).rejects.toThrow("Seule une facture validée");
    expect((await getEinvoiceStatus(db, draftId)).readiness).toBeNull();
  });

  it("refuse un client entreprise sans matricule fiscal, ou sans adresse, avec un message explicite", async () => {
    const a = await make(noMf, [line()], "2026-03-11");
    await expect(prepareEinvoice(db, actor, a.id)).rejects.toThrow(/Matricule fiscal du client absent/);
    const b = await make(noAddress, [line()], "2026-03-12");
    await expect(prepareEinvoice(db, actor, b.id)).rejects.toThrow(/Adresse du client absente/);
    expect((await db.select({ n: count() }).from(einvoiceExports))[0]!.n).toBe(0);
  });

  it("le diagnostic signale les avertissements sans bloquer", async () => {
    const st = await getEinvoiceStatus(db, invoiceId);
    expect(st.readiness!.errors).toEqual([]);
    expect(st.readiness!.warnings.join(" ")).toContain("validé contre la spécification officielle");
    expect(st.readiness!.warnings.join(" ")).toContain("signature électronique");
    expect(st.latest).toBeNull();
  });

  it("valide la forme du matricule fiscal et la devise (fonction pure)", () => {
    const base = async () => (await loadEinvoiceData(db, invoiceId))!.data;
    return base().then((d) => {
      const bad: EinvoiceData = { ...d, company: { ...d.company, matriculeFiscal: "abc" }, currency: "EUR" };
      const r = checkReadiness(bad);
      expect(r.errors.join(" ")).toContain("Matricule fiscal de la société invalide");
      expect(r.errors.join(" ")).toContain("Devise EUR");
      expect(checkReadiness({ ...d, company: { ...d.company, matriculeFiscal: "1234567A" } }).warnings.join(" ")).toContain("incomplet");
      expect(checkReadiness({ ...d, kind: "credit_note", originalNumber: null }).errors.join(" ")).toContain("Avoir sans facture d'origine");
    });
  });
});

describe("fichier TEIF", () => {
  let xml: string;
  beforeAll(async () => {
    xml = (await prepareEinvoice(db, actor, invoiceId)).export.xml;
  });

  it("est un XML bien formé, avec la structure attendue", () => {
    const { doc, errors } = parse(xml);
    expect(errors).toEqual([]);
    const root = doc.documentElement!;
    expect(root.nodeName).toBe("TEIF");
    expect(root.getAttribute("version")).toBe("1.8.8");
    for (const tag of ["InvoiceHeader", "InvoiceBody", "Bgm", "Dtm", "PartnerSection", "LinSection", "InvoiceMoa", "InvoiceTax"]) {
      expect(doc.getElementsByTagName(tag).length, tag).toBeGreaterThan(0);
    }
    expect(doc.getElementsByTagName("PartnerDetails").length).toBe(2);
    expect(doc.getElementsByTagName("Lin").length).toBe(2);
  });

  it("reprend les identifiants, le numéro et les dates figés", () => {
    const { doc } = parse(xml);
    const text = (tag: string) => Array.from({ length: doc.getElementsByTagName(tag).length }, (_, i) => doc.getElementsByTagName(tag).item(i)!.textContent);
    expect(text("DocumentIdentifier")).toEqual([expect.stringMatching(/2026|FA|\d/)]);
    expect(text("MessageSenderIdentifier")).toEqual(["7654321B/A/M/000"]);
    expect(text("MessageRecieverIdentifier")).toEqual(["1111111/A/M/000"]);
    expect(text("DateText")).toEqual(["100326", "100426"]); // émission 2026-03-10, échéance 2026-04-10, format ddMMyy
    expect(text("PartnerName")).toEqual(["ACME & Fils SARL", "Alpha SARL"]);
  });

  it("garde le texte saisi tel quel malgré les caractères spéciaux", () => {
    const { doc } = parse(xml);
    const descriptions = Array.from({ length: doc.getElementsByTagName("ImdDescription").length }, (_, i) => doc.getElementsByTagName("ImdDescription").item(i)!.textContent);
    expect(descriptions).toEqual(["Fourniture <A&B> \"x\"", "Prestation"]);
  });

  it("écrit les montants à trois décimales, cohérents avec la facture", () => {
    const amounts = [...xml.matchAll(/<Amount currencyIdentifier="TND">([^<]+)<\/Amount>/g)].map((m) => m[1]);
    for (const a of amounts) expect(a).toMatch(/^-?\d+\.\d{3}$/);
    for (const expected of ["2000.000", "10.000", "2010.000", "381.900", "2391.900", "1.000", "35.879", "2357.021"]) {
      expect(amounts, expected).toContain(expected);
    }
  });

  it("place la retenue à la source et le timbre, sans les mélanger aux taxes de facturation", () => {
    const { doc } = parse(xml);
    const names = Array.from({ length: doc.getElementsByTagName("TaxTypeName").length }, (_, i) => doc.getElementsByTagName("TaxTypeName").item(i)!.textContent);
    expect(names).toContain("Droit de timbre");
    expect(names).toContain("Retenue à la source");
    expect(names.filter((n) => n === "TVA").length).toBeGreaterThanOrEqual(3); // 2 lignes + le récapitulatif
    expect(xml).toContain('code="I-1604"'); // retenue à la source
    expect(xml).toContain('code="I-1602"'); // TVA
  });

  it("marque explicitement les codes inconnus et le caractère non validé du fichier", () => {
    expect(xml).toContain(PENDING_CODE);
    expect(xml).toContain("non signé et non validé contre le XSD officiel");
  });

  it("est déterministe", async () => {
    const data = (await loadEinvoiceData(db, invoiceId))!.data;
    expect(buildTeifXml(data)).toBe(buildTeifXml(data));
    expect(buildTeifXml(data)).toBe(xml);
  });
});

describe("conservation", () => {
  it("conserve le fichier, son empreinte et l'empreinte de la facture, une seule fois", async () => {
    const again = await prepareEinvoice(db, actor, invoiceId);
    expect(again.created).toBe(false);
    const rows = await db.select().from(einvoiceExports).where(eq(einvoiceExports.invoiceId, invoiceId));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.xmlSha256).toBe(createHash("sha256").update(row.xml).digest("hex"));
    const inv = (await db.execute(sql`select content_hash from invoices where id = ${invoiceId}`)) as unknown as { rows?: { content_hash: string }[] } & { content_hash: string }[];
    const hash = (inv.rows ?? inv)[0]!.content_hash;
    expect(row.invoiceContentHash).toBe(hash);
    expect((await getEinvoiceExport(db, invoiceId))!.id).toBe(row.id);
    const audits = await db.select({ n: count() }).from(auditLog).where(eq(auditLog.action, "einvoice.prepare"));
    expect(audits[0]!.n).toBe(1); // le second appel n'écrit rien
  });

  it("reste identique quand la fiche client change ensuite (instantané figé)", async () => {
    const before = (await getEinvoiceExport(db, invoiceId))!.xml;
    await updateCustomer(db, actor, alpha, {
      type: "entreprise", name: "Alpha RENOMMÉE", matriculeFiscal: "9999999/A/M/000", taxStatus: "assujetti", address: "Ailleurs",
      withholdingApplies: false,
    });
    const data = (await loadEinvoiceData(db, invoiceId))!.data;
    expect(data.customer.name).toBe("Alpha SARL");
    expect(buildTeifXml(data)).toBe(before);
  });

  it("est en ajout seul (UPDATE et DELETE refusés en base)", async () => {
    const up = await errorOf(db.update(einvoiceExports).set({ xml: "<x/>" }).where(eq(einvoiceExports.invoiceId, invoiceId)));
    expect(dbMessage(up)).toContain("ajout seul");
    const del = await errorOf(db.delete(einvoiceExports).where(eq(einvoiceExports.invoiceId, invoiceId)));
    expect(dbMessage(del)).toContain("ajout seul");
  });

  it("refuse en base un export pour un brouillon ou avec une empreinte qui ne correspond pas", async () => {
    const forDraft = await errorOf(db.insert(einvoiceExports).values({
      invoiceId: draftId, generatorVersion: "x", xml: "<x/>", xmlSha256: "0", invoiceContentHash: "0",
    }));
    expect(dbMessage(forDraft)).toContain("facture validée");
    const wrongHash = await errorOf(db.insert(einvoiceExports).values({
      invoiceId, generatorVersion: "autre", xml: "<x/>", xmlSha256: "0", invoiceContentHash: "pas-la-bonne",
    }));
    expect(dbMessage(wrongHash)).toContain("Empreinte");
  });
});

describe("avoir", () => {
  it("porte le type avoir et la référence de la facture d'origine", async () => {
    const original = await make(alpha, [line({ unitPrice: "200" })], "2026-04-01");
    const credit = await validateDocument(db, actor, (await createCreditNoteDraft(db, actor, original.id, { reason: "Erreur", issueDate: "2026-04-02" })).id);
    const { export: exp } = await prepareEinvoice(db, actor, credit.id);
    const { doc, errors } = parse(exp.xml);
    expect(errors).toEqual([]);
    expect(doc.getElementsByTagName("DocumentType").item(0)!.textContent).toBe("Facture d'avoir");
    expect(doc.getElementsByTagName("DocumentType").item(0)!.getAttribute("code")).toBe("I-12");
    const refs = doc.getElementsByTagName("RefIdentifier");
    expect(Array.from({ length: refs.length }, (_, i) => refs.item(i)!.textContent)).toContain(original.number);
  });
});
