import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { Num, csvCell, num, toCsv } from "@/lib/csv";
import { createCustomer } from "@/lib/customers";
import {
  createCreditNoteDraft, createDraftInvoice, validateDocument, type InvoiceLineInput,
} from "@/lib/invoicing/invoices";
import { addWithholdingCertificate, recordPayment, voidPayment } from "@/lib/invoicing/payments";
import {
  agedReceivables, bucketOf, dashboardStats, lastMonths, parsePeriod, paymentsReport, revenueReport, vatReport,
  withholdingReport,
} from "@/lib/reports";
import { createTaxRate, listTaxRates } from "@/lib/taxes";
import { createUser } from "@/lib/users";
import { buildReportCsv, EXPORT_TYPES, isExportType } from "@/lib/report-exports";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let actor: { id: string; email: string };
let rates: Record<string, string>;
let alpha: string;
let beta: string;
let invA: string;
let invB: string;
let invC: string;

const line = (over: Partial<InvoiceLineInput> & { tva?: string } = {}): InvoiceLineInput => ({
  description: "Prestation", quantity: "1", unit: "u", unitPrice: "100", discountPercent: "0",
  tvaRateId: rates[over.tva ?? "TVA19"]!, fodecApplicable: false, ...over,
});
const invoice = async (customerId: string, issueDate: string, dueDate: string, lines: InvoiceLineInput[]) =>
  validateDocument(db, actor, (await createDraftInvoice(db, actor, { customerId, issueDate, dueDate, lines })).id);

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
    type: "entreprise", name: "Alpha SARL", matriculeFiscal: "1111111/A/M/000", taxStatus: "assujetti",
    withholdingApplies: true, withholdingRateId: ras.id,
  })).id;
  beta = (await createCustomer(db, actor, { type: "entreprise", name: "Beta SA", matriculeFiscal: "2222222/A/M/000", taxStatus: "assujetti" })).id;

  // Hors période 2026 : décembre 2025.
  await invoice(beta, "2025-12-15", "2026-01-15", [line({ unitPrice: "300" })]);
  invA = (await invoice(alpha, "2026-01-10", "2026-02-10", [line({ unitPrice: "1000" })])).id; // TTC 1190, retenue 17,850, net 1173,150
  invB = (await invoice(beta, "2026-01-20", "2026-02-20", [line({ unitPrice: "500", tva: "TVA7" })])).id; // TTC 535, net 536
  invC = (await invoice(beta, "2026-02-05", "2026-03-10", [line({ unitPrice: "1000", fodecApplicable: true }), line({ unitPrice: "1000" })])).id; // HT 2000, FODEC 10, TVA 381,900
  await createDraftInvoice(db, actor, { customerId: beta, issueDate: "2026-03-05", lines: [line({ unitPrice: "9999" })] }); // brouillon : exclu de tout
  await validateDocument(db, actor, (await createCreditNoteDraft(db, actor, invB, { reason: "Annulation", issueDate: "2026-03-01" })).id); // avoir total sur B

  await recordPayment(db, actor, { customerId: alpha, paymentDate: "2026-02-15", amount: "200", method: "virement", allocations: [{ invoiceId: invA, amount: "200" }] });
  await recordPayment(db, actor, { customerId: beta, paymentDate: "2026-02-20", amount: "300", method: "especes", allocations: [{ invoiceId: invC, amount: "300" }] });
  await recordPayment(db, actor, { customerId: beta, paymentDate: "2026-03-10", amount: "100", method: "virement" });
  const voided = await recordPayment(db, actor, { customerId: beta, paymentDate: "2026-02-25", amount: "999", method: "cheque" });
  await voidPayment(db, actor, voided.id, "Chèque impayé");
  await addWithholdingCertificate(db, actor, invA, { number: "RAS-1", certificateDate: "2026-02-01", amount: "10" });
});
afterAll(() => close());

describe("période et calendrier", () => {
  it("valide la période demandée, sinon l'année en cours", () => {
    expect(parsePeriod("2026-02-01", "2026-03-31", "2026-09-21")).toEqual({ from: "2026-02-01", to: "2026-03-31" });
    for (const [from, to] of [["2026-03-31", "2026-02-01"], ["abc", "2026-01-01"], [undefined, undefined], ["2026-02-30", "2026-03-01"]] as const) {
      expect(parsePeriod(from, to, "2026-09-21")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    }
  });
  it("liste les douze derniers mois, du plus ancien au plus récent", () => {
    const m = lastMonths("2026-03-20");
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-04");
    expect(m.at(-1)).toBe("2026-03");
  });
  it("range les retards en tranches, bornes comprises", () => {
    const asOf = "2026-06-30";
    const at = (daysLate: number) => bucketOf(new Date(Date.parse(`${asOf}T00:00:00Z`) - daysLate * 86_400_000).toISOString().slice(0, 10), asOf);
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(at)).toEqual(["notDue", "d1_30", "d1_30", "d31_60", "d31_60", "d61_90", "d61_90", "over90"]);
    expect(bucketOf(null, asOf)).toBe("notDue");
    expect(at(-5)).toBe("notDue"); // échéance future
  });
});

describe("chiffre d'affaires", () => {
  it("regroupe par mois, avoirs déduits, brouillons et autres périodes exclus", async () => {
    const r = await revenueReport(db, { from: "2026-01-01", to: "2026-12-31" });
    expect(r.byMonth).toEqual([
      { key: "2026-01", label: "2026-01", count: 2, ht: "1500.000", fodec: "0.000", tva: "225.000", ttc: "1725.000" },
      { key: "2026-02", label: "2026-02", count: 1, ht: "2000.000", fodec: "10.000", tva: "381.900", ttc: "2391.900" },
      { key: "2026-03", label: "2026-03", count: 1, ht: "-500.000", fodec: "0.000", tva: "-35.000", ttc: "-535.000" },
    ]);
    expect(r.totals).toEqual({ count: 4, ht: "3000.000", fodec: "10.000", tva: "571.900", ttc: "3581.900" });
  });

  it("classe les clients par chiffre d'affaires net", async () => {
    const r = await revenueReport(db, { from: "2026-01-01", to: "2026-12-31" });
    expect(r.byCustomer.map((c) => [c.label, c.ht, c.count])).toEqual([["Beta SA", "2000.000", 3], ["Alpha SARL", "1000.000", 1]]);
  });

  it("respecte les bornes de la période (inclusives)", async () => {
    expect((await revenueReport(db, { from: "2026-01-10", to: "2026-01-10" })).totals.ht).toBe("1000.000");
    expect((await revenueReport(db, { from: "2025-01-01", to: "2025-12-31" })).totals.ht).toBe("300.000");
    expect((await revenueReport(db, { from: "2027-01-01", to: "2027-12-31" })).totals).toEqual({ count: 0, ht: "0.000", fodec: "0.000", tva: "0.000", ttc: "0.000" });
  });
});

describe("TVA, FODEC et timbre", () => {
  it("détaille par taux (avoirs déduits) et par mois", async () => {
    const v = await vatReport(db, { from: "2026-01-01", to: "2026-12-31" });
    expect(v.byRate).toEqual([
      { kind: "tva", rate: "7.000", base: "0.000", amount: "0.000" }, // 500 facturés puis annulés par l'avoir
      { kind: "tva", rate: "19.000", base: "3010.000", amount: "571.900" }, // 1000 + (2000 + 10 FODEC)
      { kind: "fodec", rate: "1.000", base: "1000.000", amount: "10.000" },
    ]);
    expect(v.byMonth).toEqual([
      { month: "2026-01", tva: "225.000", fodec: "0.000" },
      { month: "2026-02", tva: "381.900", fodec: "10.000" },
      { month: "2026-03", tva: "-35.000", fodec: "0.000" },
    ]);
    expect(v.totals).toEqual({ tva: "571.900", fodec: "10.000", stampDuty: "3.000" }); // 3 factures × 1 DT, l'avoir n'en a pas
  });
});

describe("balance âgée", () => {
  it("répartit le reste dû par tranche et par client", async () => {
    const a = await agedReceivables(db, "2026-04-15");
    // A : 1173,150 − 200 payés = 973,150 (64 j) ; B : 1,000 de timbre non remboursé (54 j) ; C : 2392,900 − 300 = 2092,900 (36 j)
    // + facture de décembre 2025 (300 HT, net 358,000), échue le 15/01 : 90 jours de retard, dernière borne de « 61 à 90 j »
    expect(a.totals.d61_90).toBe("1331.150"); // 973,150 + 358,000
    expect(a.totals.d31_60).toBe("2093.900"); // B 1,000 + C 2092,900
    expect(a.totals.over90).toBe("0.000");
    const byName = Object.fromEntries(a.rows.map((r) => [r.customerName, r]));
    expect(byName["Alpha SARL"]).toMatchObject({ d61_90: "973.150", total: "973.150" });
    expect(byName["Beta SA"]!.total).toBeDefined();
    expect(a.rows[0]!.customerName).toBe("Beta SA"); // plus gros créancier d'abord
  });

  it("classe tout en « non échu » avant les échéances, et le total est la somme des tranches", async () => {
    const a = await agedReceivables(db, "2026-01-01");
    expect([a.totals.d1_30, a.totals.d31_60, a.totals.d61_90, a.totals.over90]).toEqual(["0.000", "0.000", "0.000", "0.000"]);
    const grand = Object.values({ n: a.totals.notDue, x: a.totals.d1_30, y: a.totals.d31_60, z: a.totals.d61_90, o: a.totals.over90 })
      .reduce((s, v) => s + Number(v), 0);
    expect(Number(a.totals.total)).toBeCloseTo(grand, 3);
  });
});

describe("retenues à la source", () => {
  it("compare la retenue subie aux certificats reçus", async () => {
    const w = await withholdingReport(db, { from: "2026-01-01", to: "2026-12-31" });
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ customerName: "Alpha SARL", rate: "1.500", amount: "17.850", certified: "10.000", missing: "7.850" });
    expect(w.totals).toEqual({ amount: "17.850", certified: "10.000", missing: "7.850" });
  });
});

describe("encaissements", () => {
  it("totalise par mois et par mode, sans les paiements annulés", async () => {
    const p = await paymentsReport(db, { from: "2026-01-01", to: "2026-12-31" });
    expect(p.byMonth).toEqual([{ key: "2026-02", count: 2, amount: "500.000" }, { key: "2026-03", count: 1, amount: "100.000" }]);
    expect(p.byMethod.find((m) => m.method === "virement")).toMatchObject({ count: 2, amount: "300.000" });
    expect(p.byMethod.find((m) => m.method === "especes")).toMatchObject({ count: 1, amount: "300.000" });
    expect(p.byMethod.find((m) => m.method === "cheque")).toMatchObject({ count: 0, amount: "0.000" }); // le chèque de 999 est annulé
    expect(p.totals).toEqual({ count: 3, amount: "600.000" });
  });
});

describe("tableau de bord", () => {
  it("calcule les indicateurs du mois, de l'année et des créances", async () => {
    const s = await dashboardStats(db, "2026-03-20");
    expect(s).toMatchObject({
      month: "2026-03", revenueMonthHt: "-500.000", revenueYearHt: "3000.000", collectedMonth: "100.000", draftInvoices: 1,
      quotesAwaiting: 0, deliveriesToInvoice: 0, lowStock: 0, activeProjects: 0,
    });
    // À cette date, tout ce qui est dû est échu, sauf ce qui a une échéance future (aucune) : décembre 2025 aussi.
    expect(s.overdueCount).toBeGreaterThanOrEqual(3);
    expect(s.overdueTotal).toBe(s.receivablesTotal);
  });

  it("fournit douze mois de série, zéros compris", async () => {
    const s = await dashboardStats(db, "2026-03-20");
    expect(s.series).toHaveLength(12);
    expect(s.series[0]).toEqual({ month: "2025-04", ht: "0.000" });
    expect(s.series.find((x) => x.month === "2025-12")).toEqual({ month: "2025-12", ht: "300.000" });
    expect(s.series.at(-1)).toEqual({ month: "2026-03", ht: "-500.000" });
  });
});

describe("export CSV", () => {
  it("protège les cellules texte contre l'injection de formule", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    for (const evil of ["+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) expect(csvCell(evil).startsWith("'")).toBe(true);
    expect(csvCell("Société normale")).toBe("Société normale");
  });
  it("écrit les montants avec la virgule décimale, négatifs compris, sans les traiter comme du texte", () => {
    expect(csvCell(num("1234.500"))).toBe("1234,500");
    expect(csvCell(num("-12.500"))).toBe("-12,500");
    expect(num("1.000")).toBeInstanceOf(Num);
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });
  it("cite les cellules contenant « ; », des guillemets ou des retours à la ligne", () => {
    expect(csvCell("a;b")).toBe("\"a;b\"");
    expect(csvCell("dit \"oui\"")).toBe("\"dit \"\"oui\"\"\"");
    expect(csvCell("ligne1\nligne2")).toBe("\"ligne1\nligne2\"");
  });
  it("produit un fichier avec BOM UTF-8, séparateur « ; » et fins de ligne CRLF", () => {
    const csv = toCsv(["Client", "HT"], [["Alpha; SARL", num("1000.000")], ["=Piège", num("-5.000")]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toEqual(["﻿Client;HT", "\"Alpha; SARL\";1000,000", "'=Piège;-5,000", ""]);
  });
});

describe("exports de rapports", () => {
  const year = { from: "2026-01-01", to: "2026-12-31" };

  it("ne reconnaît que les types d'export connus", () => {
    expect(EXPORT_TYPES.every(isExportType)).toBe(true);
    expect(isExportType("../../etc/passwd")).toBe(false);
  });

  it("exporte le CA mensuel avec son total, en CSV français", async () => {
    const { filename, csv } = await buildReportCsv(db, "ca-mensuel", year);
    expect(filename).toBe("chiffre-affaires-mensuel_2026-01-01_2026-12-31.csv");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("﻿Mois;Documents;Total HT;FODEC;TVA;Total TTC");
    expect(lines[3]).toBe("2026-03;1;-500,000;0,000;-35,000;-535,000");
    expect(lines[4]).toBe("Total;4;3000,000;10,000;571,900;3581,900");
  });

  it("exporte TVA, retenues, encaissements et balance âgée", async () => {
    expect((await buildReportCsv(db, "tva", year)).csv).toContain("Timbre fiscal;;;3,000");
    expect((await buildReportCsv(db, "retenues", year)).csv).toContain("Total;;;;17,850;10,000;7,850");
    expect((await buildReportCsv(db, "encaissements", year)).csv).toContain("Total;3;600,000");
    const aged = await buildReportCsv(db, "balance-agee", { asOf: "2026-04-15" });
    expect(aged.filename).toBe("balance-agee_2026-04-15.csv");
    expect(aged.csv).toContain("Total;");
  });

  it("retombe sur l'année en cours quand la période est invalide", async () => {
    const { filename } = await buildReportCsv(db, "encaissements", { from: "n'importe quoi", to: "2026-01-01" });
    expect(filename).toMatch(/^encaissements_\d{4}-01-01_\d{4}-12-31\.csv$/);
  });
});
