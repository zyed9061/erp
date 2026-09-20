import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, taxRates } from "@/db/schema";
import type { Db } from "@/db/types";
import { getCompany, updateCompany } from "@/lib/company";
import {
  addContact, createCustomer, getCustomer, listCustomers, removeContact, setCustomerActive, updateCustomer,
} from "@/lib/customers";
import { ServiceError } from "@/lib/errors";
import { AmountError, formatAmount, formatPercent, parseAmount } from "@/lib/money";
import { fiscalYearOf, formatDocumentNumber, nextDocumentNumber, updateSeriesConfig } from "@/lib/numbering";
import { computeDueDate, createPaymentTerm, listPaymentTerms, updatePaymentTerm } from "@/lib/payment-terms";
import { createProduct, listProducts, setProductActive, updateProduct } from "@/lib/products";
import { createTaxRate, listTaxRates, updateTaxRate } from "@/lib/taxes";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
const actor = { id: "00000000-0000-0000-0000-000000000001", email: "admin@example.tn" };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const customerBase = {
  type: "entreprise" as const,
  name: "Société Alpha",
  matriculeFiscal: "1234567/A/M/000",
  taxStatus: "assujetti" as const,
};

describe("montants", () => {
  it("normalise à 3 décimales et accepte la virgule française", () => {
    expect(parseAmount("12")).toBe("12.000");
    expect(parseAmount("1 234,5")).toBe("1234.500");
    expect(parseAmount("0.001")).toBe("0.001");
    expect(parseAmount("007.250")).toBe("7.250");
  });
  it("refuse négatif, 4 décimales et texte", () => {
    for (const bad of ["-1", "1.2345", "abc", "", "1,2,3", "9999999999999"]) {
      expect(() => parseAmount(bad), bad).toThrow(AmountError);
    }
  });
  it("formate pour l'affichage", () => {
    expect(formatAmount("1234567.5")).toBe("1 234 567,500");
    expect(formatPercent("19.000")).toBe("19 %");
    expect(formatPercent("1.500")).toBe("1,5 %");
    expect(formatPercent("0.000")).toBe("0 %");
  });
});

describe("données de référence initiales", () => {
  it("contient les taux de TVA tunisiens et le FODEC, sans retenue pré-remplie", async () => {
    const rates = await listTaxRates(db);
    const byCode = Object.fromEntries(rates.map((r) => [r.code, r]));
    expect(byCode.TVA19?.rate).toBe("19.000");
    expect(byCode.TVA13?.rate).toBe("13.000");
    expect(byCode.TVA7?.rate).toBe("7.000");
    expect(byCode.TVA0?.rate).toBe("0.000");
    expect(byCode.FODEC1?.kind).toBe("fodec");
    expect(rates.some((r) => r.kind === "retenue")).toBe(false);
  });
  it("a une société, un timbre de 1 DT et une seule condition par défaut", async () => {
    const company = await getCompany(db);
    expect(company.stampDutyAmount).toBe("1.000");
    const defaults = (await listPaymentTerms(db)).filter((t) => t.isDefault);
    expect(defaults.map((t) => t.label)).toEqual(["À réception"]);
  });
});

describe("numérotation sans trou", () => {
  it("formate avec l'année ou en continu", () => {
    expect(formatDocumentNumber({ prefix: "FAC", padLength: 5, resetYearly: true }, 2026, 42)).toBe("FAC-2026-00042");
    expect(formatDocumentNumber({ prefix: "CLI", padLength: 5, resetYearly: false }, 2026, 7)).toBe("CLI-00007");
  });

  it("incrémente sans saut", async () => {
    const date = new Date("2026-03-10T12:00:00Z");
    const numbers = [];
    for (let i = 0; i < 3; i++) numbers.push((await db.transaction((tx) => nextDocumentNumber(tx, "quote", date))).number);
    expect(numbers).toEqual(["DEV-2026-00001", "DEV-2026-00002", "DEV-2026-00003"]);
  });

  it("restitue le numéro après un ROLLBACK (contrairement à une SEQUENCE)", async () => {
    const date = new Date("2026-03-10T12:00:00Z");
    const before = await db.transaction((tx) => nextDocumentNumber(tx, "invoice", date));
    await expect(
      db.transaction(async (tx) => {
        await nextDocumentNumber(tx, "invoice", date);
        await nextDocumentNumber(tx, "invoice", date);
        throw new Error("validation annulée");
      }),
    ).rejects.toThrow("validation annulée");
    const after = await db.transaction((tx) => nextDocumentNumber(tx, "invoice", date));
    expect(after.sequence).toBe(before.sequence + 1); // aucun numéro perdu
  });

  it("repart à 1 chaque exercice, selon l'heure de Tunis", async () => {
    const dec31 = new Date("2026-12-31T22:30:00Z"); // 23h30 à Tunis : encore 2026
    const jan1 = new Date("2026-12-31T23:30:00Z"); // 00h30 à Tunis : déjà 2027
    expect(fiscalYearOf(dec31)).toBe(2026);
    expect(fiscalYearOf(jan1)).toBe(2027);
    const a = await db.transaction((tx) => nextDocumentNumber(tx, "credit_note", dec31));
    const b = await db.transaction((tx) => nextDocumentNumber(tx, "credit_note", jan1));
    expect(a.number).toBe("AV-2026-00001");
    expect(b.number).toBe("AV-2027-00001");
  });
});

describe("format de numérotation", () => {
  it("est libre tant qu'aucun numéro n'a été attribué", async () => {
    const updated = await updateSeriesConfig(db, actor, "delivery_note", { prefix: "bl", padLength: 6, resetYearly: false });
    expect(updated).toMatchObject({ prefix: "BL", padLength: 6, resetYearly: false });
  });

  it("verrouille préfixe et remise à zéro une fois utilisé, et n'autorise qu'à élargir", async () => {
    await db.transaction((tx) => nextDocumentNumber(tx, "delivery_note"));
    const cfg = { prefix: "BL", padLength: 6, resetYearly: false };
    await expect(updateSeriesConfig(db, actor, "delivery_note", { ...cfg, prefix: "LIV" })).rejects.toBeInstanceOf(ServiceError);
    await expect(updateSeriesConfig(db, actor, "delivery_note", { ...cfg, resetYearly: true })).rejects.toBeInstanceOf(ServiceError);
    await expect(updateSeriesConfig(db, actor, "delivery_note", { ...cfg, padLength: 4 })).rejects.toBeInstanceOf(ServiceError);
    await expect(updateSeriesConfig(db, actor, "delivery_note", { ...cfg, padLength: 8 })).resolves.toMatchObject({ padLength: 8 });
  });

  it("refuse un préfixe invalide", async () => {
    await expect(updateSeriesConfig(db, actor, "deposit_invoice", { prefix: "a b!", padLength: 5, resetYearly: true })).rejects.toThrow();
  });
});

describe("taxes", () => {
  it("crée un taux et refuse un code en double", async () => {
    const t = await createTaxRate(db, actor, { code: "ras15", label: "Retenue 1,5 %", kind: "retenue", rate: "1,5" });
    expect(t.code).toBe("RAS15");
    expect(t.rate).toBe("1.500");
    await expect(createTaxRate(db, actor, { code: "RAS15", label: "x", kind: "retenue", rate: "2" })).rejects.toBeInstanceOf(ServiceError);
  });
  it("refuse un taux hors 0-100", async () => {
    await expect(createTaxRate(db, actor, { code: "BAD", label: "x", kind: "tva", rate: "101" })).rejects.toThrow();
  });
  it("rend le taux immuable en base, mais permet libellé et désactivation", async () => {
    const [tva19] = await listTaxRates(db, { kind: "tva" }).then((r) => r.filter((x) => x.code === "TVA19"));
    if (!tva19) throw new Error("TVA19 absent");
    const err = await db.update(taxRates).set({ rate: "20" }).where(eq(taxRates.id, tva19.id)).then(() => null, (e: Error & { cause?: Error }) => e);
    expect(`${err?.message} ${err?.cause?.message}`).toMatch(/immuables/);
    const updated = await updateTaxRate(db, actor, tva19.id, { label: "TVA normale 19 %" });
    expect(updated.rate).toBe("19.000");
    expect(updated.label).toBe("TVA normale 19 %");
  });
});

describe("conditions de paiement", () => {
  it("garde une seule condition par défaut", async () => {
    const t = await createPaymentTerm(db, actor, { label: "45 jours", days: 45, endOfMonth: false });
    await updatePaymentTerm(db, actor, t.id, { isDefault: true });
    const defaults = (await listPaymentTerms(db)).filter((x) => x.isDefault);
    expect(defaults.map((x) => x.label)).toEqual(["45 jours"]);
    await expect(updatePaymentTerm(db, actor, t.id, { isActive: false })).rejects.toBeInstanceOf(ServiceError);
  });
  it("calcule l'échéance, y compris fin de mois", () => {
    const issue = new Date(Date.UTC(2026, 0, 15));
    expect(computeDueDate(issue, { days: 30, endOfMonth: false }).toISOString().slice(0, 10)).toBe("2026-02-14");
    expect(computeDueDate(issue, { days: 30, endOfMonth: true }).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(computeDueDate(issue, { days: 0, endOfMonth: false }).toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});

describe("société", () => {
  it("met à jour la société et journalise l'avant/après", async () => {
    const updated = await updateCompany(db, actor, {
      legalName: "ACME SARL", matriculeFiscal: "7654321 b/a/m/000", legalForm: "SARL", capital: "10 000",
      taxRegime: "reel", vatRegistered: true, stampDutyEnabled: true, stampDutyAmount: "1",
      withholdingBase: "ttc", withholdingThreshold: "0",
    });
    expect(updated.matriculeFiscal).toBe("7654321B/A/M/000");
    expect(updated.capital).toBe("10000.000");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "company.update"));
    expect((entry?.before as { legalName: string }).legalName).toBe("À renseigner");
    expect((entry?.after as { legalName: string }).legalName).toBe("ACME SARL");
  });
  it("interdit une seconde ligne société", async () => {
    await expect(db.execute(sql`INSERT INTO company_settings (id, legal_name) VALUES (2, 'X')`)).rejects.toThrow();
  });
});

describe("clients", () => {
  it("génère un code client continu et applique la condition de paiement par défaut", async () => {
    const a = await createCustomer(db, actor, customerBase);
    const b = await createCustomer(db, actor, { ...customerBase, name: "Société Beta", matriculeFiscal: "7654321/B/M/000" });
    expect([a.code, b.code]).toEqual(["CLI-00001", "CLI-00002"]);
    expect(a.paymentTermId).not.toBeNull();
    expect(a.matriculeFiscal).toBe("1234567/A/M/000");
  });

  it("exige le matricule fiscal d'une entreprise assujettie, pas d'un particulier", async () => {
    await expect(createCustomer(db, actor, { ...customerBase, name: "Sans MF", matriculeFiscal: "" })).rejects.toBeInstanceOf(ServiceError);
    const p = await createCustomer(db, actor, { type: "particulier", name: "Mme Salma", taxStatus: "non_assujetti" });
    expect(p.matriculeFiscal).toBeNull();
  });

  it("valide la retenue à la source : taux de type 'retenue' obligatoire", async () => {
    const tva = (await listTaxRates(db, { kind: "tva" }))[0];
    const ras = (await listTaxRates(db, { kind: "retenue" }))[0];
    if (!tva || !ras) throw new Error("taux manquants");
    const input = { ...customerBase, name: "Client RAS", matriculeFiscal: "1111111/A/M/000", withholdingApplies: true };
    await expect(createCustomer(db, actor, input)).rejects.toBeInstanceOf(ServiceError); // taux manquant
    await expect(createCustomer(db, actor, { ...input, withholdingRateId: tva.id })).rejects.toBeInstanceOf(ServiceError);
    const ok = await createCustomer(db, actor, { ...input, withholdingRateId: ras.id });
    expect(ok.withholdingRateId).toBe(ras.id);
  });

  it("refuse un e-mail invalide et un code en double", async () => {
    await expect(createCustomer(db, actor, { ...customerBase, name: "Mail KO", email: "pas-un-mail" })).rejects.toThrow();
    await expect(createCustomer(db, actor, { ...customerBase, name: "Dup", code: "cli-00001" })).rejects.toBeInstanceOf(ServiceError);
  });

  it("cherche sans interpréter % et _, filtre les inactifs, journalise les modifications", async () => {
    const all = await listCustomers(db);
    expect(all.total).toBeGreaterThanOrEqual(3);
    expect((await listCustomers(db, { q: "alpha" })).rows.map((c) => c.name)).toEqual(["Société Alpha"]);
    expect((await listCustomers(db, { q: "%" })).total).toBe(0); // % littéral, pas un joker
    expect((await listCustomers(db, { q: "1234567" })).total).toBe(1); // recherche par matricule

    const alpha = (await listCustomers(db, { q: "alpha" })).rows[0]!;
    await updateCustomer(db, actor, alpha.id, { ...customerBase, name: "Alpha Industries", city: "Sfax" });
    await setCustomerActive(db, actor, alpha.id, false);
    expect((await listCustomers(db, { q: "alpha" })).total).toBe(0);
    expect((await listCustomers(db, { q: "alpha", includeInactive: true })).total).toBe(1);
    const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, alpha.id))).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["customer.create", "customer.update", "customer.deactivate"]));
  });

  it("gère les contacts", async () => {
    const c = (await listCustomers(db, { q: "beta" })).rows[0]!;
    const contact = await addContact(db, actor, c.id, { name: "Karim", email: "karim@beta.tn", isBilling: true });
    expect((await getCustomer(db, c.id))?.contacts).toHaveLength(1);
    await removeContact(db, actor, contact.id);
    expect((await getCustomer(db, c.id))?.contacts).toHaveLength(0);
    await expect(removeContact(db, actor, contact.id)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("articles", () => {
  it("crée un article avec code automatique et prix à 3 décimales", async () => {
    const tva19 = (await listTaxRates(db, { kind: "tva" })).find((t) => t.code === "TVA19")!;
    const p = await createProduct(db, actor, {
      type: "bien", name: "Ciment 50 kg", unit: "sac", unitPrice: "12,5", tvaRateId: tva19.id, fodecApplicable: true,
    });
    expect(p.code).toBe("ART-00001");
    expect(p.unitPrice).toBe("12.500");
    expect(p.fodecApplicable).toBe(true);
  });

  it("n'accepte qu'un taux de TVA actif", async () => {
    const fodec = (await listTaxRates(db, { kind: "fodec" }))[0]!;
    await expect(
      createProduct(db, actor, { type: "service", name: "Conseil", unit: "h", unitPrice: "100", tvaRateId: fodec.id }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("refuse un prix négatif ou à 4 décimales", async () => {
    const tva7 = (await listTaxRates(db, { kind: "tva" })).find((t) => t.code === "TVA7")!;
    for (const unitPrice of ["-5", "1.2345"]) {
      await expect(
        createProduct(db, actor, { type: "service", name: "X", unit: "u", unitPrice, tvaRateId: tva7.id }),
      ).rejects.toThrow();
    }
  });

  it("tolère un taux désactivé sur un article existant mais pas sur un nouveau", async () => {
    const rates = await listTaxRates(db, { kind: "tva" });
    const tva13 = rates.find((t) => t.code === "TVA13")!;
    const tva7 = rates.find((t) => t.code === "TVA7")!;
    const p = await createProduct(db, actor, { type: "service", name: "Formation", unit: "jour", unitPrice: "500", tvaRateId: tva13.id });
    await updateTaxRate(db, actor, tva13.id, { isActive: false });
    await updateProduct(db, actor, p.id, { type: "service", name: "Formation avancée", unit: "jour", unitPrice: "550", tvaRateId: tva13.id });
    await expect(
      createProduct(db, actor, { type: "service", name: "Autre", unit: "jour", unitPrice: "1", tvaRateId: tva13.id }),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(updateProduct(db, actor, p.id, { type: "service", name: "F", unit: "j", unitPrice: "1", tvaRateId: tva7.id })).resolves.toBeTruthy();
  });

  it("liste, recherche et désactive", async () => {
    const list = await listProducts(db, { q: "ciment" });
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]?.tvaRate).toBe("19.000");
    await setProductActive(db, actor, list.rows[0]!.product.id, false);
    expect((await listProducts(db, { q: "ciment" })).total).toBe(0);
  });
});
