import { describe, expect, it } from "vitest";
import raw from "@/lib/einvoice/spec.json";
import { checkReadiness } from "@/lib/einvoice/readiness";
import { buildTeifXml, type EinvoiceData } from "@/lib/einvoice/teif";
import { PENDING_CODE, SPEC, codeOf, dateFormat, parseSpec, pendingLabels, specReport } from "@/lib/einvoice/teif-codes";
import { validateEinvoiceData } from "@/lib/einvoice/validate";
import { UnavailableXsdValidator } from "@/lib/einvoice/xsd";

// Facture minimale calculée à la main : 2 × 100,000 HT à 19 % -> TVA 38,000, TTC 238,000, timbre 1,000, net 239,000.
const good = (): EinvoiceData => ({
  kind: "invoice", number: "FA-2026-000001", issueDate: "2026-03-10", dueDate: "2026-04-10", currency: "TND", reference: null, notes: null,
  originalNumber: null,
  company: { name: "ACME", matriculeFiscal: "7654321B/A/M/000", address: "1 rue A", city: "Tunis", postalCode: "1002", country: "TN" },
  customer: { name: "Alpha", matriculeFiscal: "1111111/A/M/000", address: "2 rue B", city: "Sfax", postalCode: "3000", country: "TN", type: "entreprise" },
  lines: [{
    position: 1, description: "Prestation", quantity: "2.000", unit: "h", unitPrice: "100.000", discountPercent: "0.000",
    tvaCode: "TVA19", tvaRate: "19.000", fodecRate: "0.000", netHt: "200.000", fodec: "0.000",
  }],
  taxes: [{ kind: "tva", rate: "19.000", base: "200.000", amount: "38.000" }],
  totals: {
    ht: "200.000", fodec: "0.000", tvaBase: "200.000", tva: "38.000", ttc: "238.000", stampDuty: "1.000",
    withholdingRate: null, withholdingAmount: "0.000", guaranteeHoldback: "0.000", netToPay: "239.000",
  },
});

const errorsOf = (mutate: (d: EinvoiceData) => void) => {
  const d = good();
  mutate(d);
  return validateEinvoiceData(d).errors.join(" | ");
};

describe("spécification TEIF (spec.json)", () => {
  it("se charge et respecte son schéma", () => {
    expect(SPEC.codes.docInvoice?.label).toBe("Facture");
    expect(() => parseSpec(raw)).not.toThrow();
  });

  it("refuse un code renseigné sans source (aucun code de mémoire)", () => {
    const bad = structuredClone(raw) as typeof raw;
    (bad.codes.docInvoice as { code: string | null }).code = "I-11";
    expect(() => parseSpec(bad)).toThrow(/sans source/);
    const fake = structuredClone(raw) as typeof raw;
    Object.assign(fake.codes.docInvoice, { code: "I-11", official: true, source: null });
    expect(() => parseSpec(fake)).toThrow();
  });

  it("ne contient aucun code officiel tant que TTN n'a rien fourni ; seuls deux codes viennent d'une source tierce", () => {
    const rows = Object.entries(SPEC.codes).filter(([, c]) => c.code !== null);
    expect(rows.map(([k]) => k).sort()).toEqual(["taxVat", "taxWithholding"]);
    expect(rows.every(([, c]) => !c.official && c.source!.includes("NON officielle"))).toBe(true);
    expect(SPEC.dateFormat.value).toBeNull();
  });

  it("rapporte ce qui reste à fournir par TTN", () => {
    const r = specReport();
    expect(r.official).toBe(0);
    expect(r.secondary).toBe(2);
    expect(r.pending).toBe(r.items.length - 2);
    expect(pendingLabels()).toContain("Facture");
    expect(pendingLabels()).toContain("Format de date (attribut format de DateText)");
  });

  it("un code absent devient un marqueur explicite, un code fourni est repris tel quel", () => {
    expect(codeOf("docInvoice")).toBe(PENDING_CODE);
    expect(dateFormat()).toBe(PENDING_CODE);
    const official = parseSpec({
      ...raw,
      codes: { ...raw.codes, docInvoice: { label: "Facture", code: "XX-1", source: "Annexe A, tableau 3 (exemple de test)", official: true } },
    });
    expect(codeOf("docInvoice", official)).toBe("XX-1");
    expect(specReport(official).official).toBe(1);
  });

  it("le fichier généré ne peut pas passer pour valide : marqueurs présents, aucun code inventé", () => {
    const xml = buildTeifXml(good());
    expect(xml).toContain(`code="${PENDING_CODE}"`);
    expect(xml).toContain(`format="${PENDING_CODE}"`);
    expect(xml).not.toMatch(/"I-(11|12|31|32|62|64|01)"/); // codes vus de mémoire, volontairement retirés
    expect(xml).toContain("non signé et non validé contre le XSD officiel");
  });
});

describe("validation par XSD", () => {
  it("indique que le XSD officiel est à fournir, sans jamais répondre « valide »", async () => {
    const r = await new UnavailableXsdValidator("/chemin/inexistant.xsd").validate();
    expect(r.status).toBe("unavailable");
    expect(JSON.stringify(r)).toContain("À FOURNIR PAR TTN");
  });
});

describe("validations internes (sans XSD)", () => {
  it("accepte une facture cohérente", () => {
    expect(validateEinvoiceData(good())).toEqual({ errors: [], warnings: [] });
    expect(checkReadiness(good()).errors).toEqual([]);
  });

  it("détecte un total, une taxe ou un net à payer incohérents", () => {
    expect(errorsOf((d) => { d.totals.tva = "37.000"; })).toContain("Total « TVA » enregistré 37.000, recalculé 38.000");
    expect(errorsOf((d) => { d.totals.ttc = "240.000"; })).toContain("Total « TTC »");
    expect(errorsOf((d) => { d.totals.netToPay = "238.000"; })).toContain("Net à payer 238.000");
    expect(errorsOf((d) => { d.taxes[0]!.amount = "39.000"; })).toContain("Récapitulatif tva 19.000 %");
    expect(errorsOf((d) => { d.taxes = []; })).toContain("manquant");
    expect(errorsOf((d) => { d.lines[0]!.netHt = "199.000"; })).toContain("Ligne 1 : HT enregistré 199.000, recalculé 200.000");
  });

  it("vérifie l'identité du net avec retenues et retenue de garantie", () => {
    const withHoldings = (d: EinvoiceData) => {
      d.totals.withholdingRate = "1.500"; d.totals.withholdingAmount = "3.570"; d.totals.guaranteeHoldback = "11.900";
      d.totals.netToPay = "223.530"; // 238 + 1 - 3,570 - 11,900
    };
    expect(errorsOf(withHoldings)).toBe("");
    expect(errorsOf((d) => { withHoldings(d); d.totals.netToPay = "239.000"; })).toContain("Net à payer");
    expect(errorsOf((d) => { d.totals.withholdingAmount = "3.570"; d.totals.netToPay = "235.430"; })).toContain("Retenue à la source sans taux");
  });

  it("contrôle les dates", () => {
    expect(errorsOf((d) => { d.issueDate = "2026-02-30"; })).toContain("Date d'émission invalide");
    expect(errorsOf((d) => { d.dueDate = "demain"; })).toContain("Date d'échéance invalide");
    expect(errorsOf((d) => { d.dueDate = "2026-03-01"; })).toContain("précède la date d'émission");
    expect(errorsOf((d) => { d.dueDate = null; })).toBe("");
  });

  it("contrôle les lignes", () => {
    expect(errorsOf((d) => { d.lines.push({ ...d.lines[0]! }); })).toContain("Numéros de ligne en double");
    expect(errorsOf((d) => { d.lines[0]!.description = "  "; })).toContain("description vide");
    expect(errorsOf((d) => { d.lines[0]!.quantity = "0.000"; })).toContain("quantité non positive");
    expect(errorsOf((d) => { d.lines[0]!.discountPercent = "101.000"; })).toContain("remise hors de 0 à 100");
    expect(errorsOf((d) => { d.lines[0]!.unit = ""; })).toContain("unité vide");
  });

  it("accepte les lignes de déduction d'acompte (prix négatif) avec un avertissement", () => {
    const d = good();
    d.lines.push({ position: 2, description: "Acompte déduit", quantity: "1.000", unit: "u", unitPrice: "-100.000", discountPercent: "0.000", tvaCode: "TVA19", tvaRate: "19.000", fodecRate: "0.000", netHt: "-100.000", fodec: "0.000" });
    d.taxes = [{ kind: "tva", rate: "19.000", base: "100.000", amount: "19.000" }];
    d.totals = { ...d.totals, ht: "100.000", tvaBase: "100.000", tva: "19.000", ttc: "119.000", netToPay: "120.000" };
    const r = validateEinvoiceData(d);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toContain("déduction d'acompte");
  });

  it("contrôle le format des montants (3 décimales) sans recalculer sur des données illisibles", () => {
    const e = errorsOf((d) => { d.totals.ht = "200.00"; d.totals.tva = "abc"; });
    expect(e).toContain("Montant « total HT » mal formé");
    expect(e).toContain("Montant « TVA » mal formé");
    expect(e).not.toContain("recalculé");
  });

  it("contrôle le pays et signale un code postal inhabituel", () => {
    expect(errorsOf((d) => { d.customer.country = "tn"; })).toContain("Code pays du client invalide");
    expect(errorsOf((d) => { d.company.country = "TUN"; })).toContain("Code pays du société invalide");
    const d = good();
    d.customer.postalCode = "30";
    expect(validateEinvoiceData(d).warnings.join(" ")).toContain("Code postal du client inhabituel");
  });

  it("intègre ces contrôles dans le diagnostic de préparation", () => {
    const d = good();
    d.totals.ttc = "999.000";
    expect(checkReadiness(d).errors.join(" ")).toContain("Total « TTC »");
  });

  it("gère le FODEC et l'exonération (taux 0) comme le moteur de facturation", () => {
    const d = good();
    // 1000 HT avec FODEC 1 % : FODEC 10,000 ; TVA 19 % sur 1010 = 191,900 ; TTC 1201,900 ; timbre 1 -> net 1202,900
    d.lines = [{
      position: 1, description: "Fourniture", quantity: "1.000", unit: "u", unitPrice: "1000.000", discountPercent: "0.000",
      tvaCode: "TVA19", tvaRate: "19.000", fodecRate: "1.000", netHt: "1000.000", fodec: "10.000",
    }];
    d.taxes = [{ kind: "tva", rate: "19.000", base: "1010.000", amount: "191.900" }, { kind: "fodec", rate: "1.000", base: "1000.000", amount: "10.000" }];
    d.totals = { ...d.totals, ht: "1000.000", fodec: "10.000", tvaBase: "1010.000", tva: "191.900", ttc: "1201.900", netToPay: "1202.900" };
    expect(validateEinvoiceData(d).errors).toEqual([]);

    const exo = good();
    exo.lines[0]!.tvaCode = "EXO"; exo.lines[0]!.tvaRate = "0.000";
    exo.taxes = [{ kind: "tva", rate: "0.000", base: "200.000", amount: "0.000" }];
    exo.totals = { ...exo.totals, tvaBase: "200.000", tva: "0.000", ttc: "200.000", netToPay: "201.000" };
    expect(validateEinvoiceData(exo).errors).toEqual([]);
  });
});
