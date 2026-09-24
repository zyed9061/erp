import { describe, expect, it } from "vitest";
import { calculerTotaux } from "../../src/lib/calculs";
import { DEFAULT_OPTIONS, DEFAULT_TERM_DAYS, LATE_THRESHOLD_DAYS, generateDemoDataset, type Persona } from "./generate";

const referenceDate = new Date(Date.UTC(2026, 8, 24, 10));
const dataset = generateDemoDataset({ ...DEFAULT_OPTIONS, referenceDate });
const DAY = 86_400_000;

describe("generateDemoDataset", () => {
  it("is reproducible for a given seed and changes with the seed", () => {
    const again = generateDemoDataset({ ...DEFAULT_OPTIONS, referenceDate });
    expect(JSON.stringify(again)).toBe(JSON.stringify(dataset));

    const other = generateDemoDataset({ ...DEFAULT_OPTIONS, referenceDate, seed: 7 });
    expect(JSON.stringify(other.invoices)).not.toBe(JSON.stringify(dataset.invoices));
  });

  it("produces enough history for ML", () => {
    expect(dataset.clients).toHaveLength(DEFAULT_OPTIONS.clientCount);
    expect(dataset.invoices.length).toBeGreaterThanOrEqual(1100);
    const settled = dataset.invoices.filter((f) => f.statut === "PAYEE");
    expect(settled.length).toBeGreaterThanOrEqual(200);
  });

  it("keeps document totals consistent with the app's calculation rules", () => {
    for (const f of dataset.invoices) {
      expect(calculerTotaux(f.lignes, f.timbreFiscal)).toEqual({
        sousTotalHT: f.sousTotalHT,
        totalTva: f.totalTva,
        totalTTC: f.totalTTC,
      });
    }
    for (const d of dataset.quotes) {
      expect(calculerTotaux(d.lignes)).toEqual({ sousTotalHT: d.sousTotalHT, totalTva: d.totalTva, totalTTC: d.totalTTC });
    }
  });

  it("keeps payments consistent with invoice amounts and statuses", () => {
    const byInvoice = new Map<string, number>();
    for (const p of dataset.payments) {
      expect(p.montant).toBeGreaterThan(0);
      expect(p.datePaiement.getTime()).toBeLessThanOrEqual(referenceDate.getTime());
      byInvoice.set(p.factureId, (byInvoice.get(p.factureId) ?? 0) + p.montant);
    }
    for (const f of dataset.invoices) {
      const paid = Math.round((byInvoice.get(f.id) ?? 0) * 1000) / 1000;
      expect(paid).toBe(f.montantPaye);
      expect(f.montantPaye).toBeLessThanOrEqual(f.totalTTC);
      if (f.statut === "PAYEE") expect(f.montantPaye).toBe(f.totalTTC);
      if (f.statut === "PARTIELLEMENT_PAYEE") expect(f.montantPaye).toBeGreaterThan(0);
      if (f.statut === "ENVOYEE" || f.statut === "BROUILLON" || f.statut === "ANNULEE") expect(f.montantPaye).toBe(0);
    }
    for (const p of dataset.payments) {
      const f = dataset.invoices.find((i) => i.id === p.factureId)!;
      expect(p.datePaiement.getTime()).toBeGreaterThan(f.dateEmission.getTime());
    }
  });

  it("numbers documents chronologically without gaps and records the sequences", () => {
    for (const [prefix, docs] of [
      ["FAC", dataset.invoices],
      ["DEV", dataset.quotes],
      ["AV", dataset.creditNotes],
    ] as const) {
      const byYear = new Map<number, { numero: string; dateEmission: Date }[]>();
      for (const d of docs) byYear.set(d.annee, [...(byYear.get(d.annee) ?? []), d]);
      for (const [year, list] of byYear) {
        const sorted = [...list].sort((a, b) => a.numero.localeCompare(b.numero));
        sorted.forEach((d, i) => {
          expect(d.numero).toBe(`${prefix}-${year}-${String(i + 1).padStart(4, "0")}`);
          if (i > 0) expect(d.dateEmission.getTime()).toBeGreaterThanOrEqual(sorted[i - 1].dateEmission.getTime());
        });
        const type = prefix === "FAC" ? "FACTURE" : prefix === "DEV" ? "DEVIS" : "AVOIR";
        expect(dataset.numbering).toContainEqual({ type, annee: year, dernierNumero: list.length });
      }
    }
  });

  it("links converted quotes to exactly one invoice", () => {
    const quoteIds = new Set(dataset.quotes.map((d) => d.id));
    const linked = dataset.invoices.map((f) => f.devisOrigineId).filter((v): v is string => v !== null);
    expect(new Set(linked).size).toBe(linked.length);
    for (const idDevis of linked) {
      expect(quoteIds.has(idDevis)).toBe(true);
      expect(dataset.quotes.find((d) => d.id === idDevis)!.statut).toBe("CONVERTI");
    }
    expect(dataset.quotes.filter((d) => d.statut === "CONVERTI")).toHaveLength(linked.length);
  });

  it("never invoices a client before it exists", () => {
    const createdAt = new Map(dataset.clients.map((c) => [c.id, c.createdAt.getTime()]));
    for (const f of dataset.invoices) expect(f.dateEmission.getTime()).toBeGreaterThanOrEqual(createdAt.get(f.clientId)!);
  });

  it("injects ~2% anomalies, each on a distinct invoice", () => {
    const { anomalies } = dataset.truth;
    const rate = anomalies.length / dataset.invoices.length;
    expect(rate).toBeGreaterThan(0.015);
    expect(rate).toBeLessThan(0.025);
    expect(new Set(anomalies.map((a) => a.factureId)).size).toBe(anomalies.length);
    expect(new Set(anomalies.map((a) => a.type))).toEqual(new Set(["DUPLICATE", "WRONG_VAT", "AMOUNT_SPIKE", "ODD_DISCOUNT"]));
  });

  it("gives personas clearly different observed late-payment rates", () => {
    const persona = new Map(dataset.truth.clientPersonas.map((c) => [c.clientId, c.persona]));
    const lastPayment = new Map<string, number>();
    for (const p of dataset.payments) {
      lastPayment.set(p.factureId, Math.max(lastPayment.get(p.factureId) ?? 0, p.datePaiement.getTime()));
    }
    const stats = new Map<Persona, { late: number; total: number }>();
    for (const f of dataset.invoices.filter((i) => i.statut === "PAYEE")) {
      const due = (f.dateEcheance ?? new Date(f.dateEmission.getTime() + DEFAULT_TERM_DAYS * DAY)).getTime();
      const late = lastPayment.get(f.id)! > due + LATE_THRESHOLD_DAYS * DAY;
      const key = persona.get(f.clientId)!;
      const s = stats.get(key) ?? { late: 0, total: 0 };
      stats.set(key, { late: s.late + (late ? 1 : 0), total: s.total + 1 });
    }
    const rate = (p: Persona) => stats.get(p)!.late / stats.get(p)!.total;
    expect(rate("RELIABLE")).toBeLessThan(0.2);
    expect(rate("CHRONIC")).toBeGreaterThan(0.6);
    expect(rate("RELIABLE")).toBeLessThan(rate("OCCASIONAL"));
    expect(rate("OCCASIONAL")).toBeLessThan(rate("CHRONIC"));
  });
});
