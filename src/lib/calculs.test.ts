import { describe, it, expect } from "vitest";
import { calculerLigne, calculerTotaux, calculerResteAPayer, verifierMontantPaiement } from "./calculs";

describe("calculerLigne", () => {
  it("applies the discount before computing VAT", () => {
    const ligne = calculerLigne({ quantite: 2, prixUnitaireHT: 100, remisePct: 10, tauxTva: 19 });
    expect(ligne.totalHT).toBe(180);
    expect(ligne.totalTva).toBeCloseTo(34.2, 3);
    expect(ligne.totalTTC).toBeCloseTo(214.2, 3);
  });
});

describe("calculerTotaux", () => {
  it("sums line totals and adds the stamp duty on top", () => {
    const totaux = calculerTotaux(
      [{ quantite: 1, prixUnitaireHT: 100, tauxTva: 19 }],
      1,
    );
    expect(totaux.sousTotalHT).toBe(100);
    expect(totaux.totalTva).toBe(19);
    expect(totaux.totalTTC).toBe(120);
  });
});

describe("calculerResteAPayer", () => {
  it("returns the difference between total and amount already paid", () => {
    expect(calculerResteAPayer(1000, 400)).toBe(600);
  });

  it("returns 0 when fully paid", () => {
    expect(calculerResteAPayer(1000, 1000)).toBe(0);
  });

  it("can return a negative balance if overpaid", () => {
    expect(calculerResteAPayer(1000, 1200)).toBe(-200);
  });
});

describe("verifierMontantPaiement", () => {
  it("allows a payment equal to the remaining balance", () => {
    expect(() => verifierMontantPaiement(600, 600)).not.toThrow();
  });

  it("allows a payment smaller than the remaining balance", () => {
    expect(() => verifierMontantPaiement(600, 100)).not.toThrow();
  });

  it("rejects a payment larger than the remaining balance", () => {
    expect(() => verifierMontantPaiement(600, 600.001)).toThrow(/depasse le solde/);
  });
});
