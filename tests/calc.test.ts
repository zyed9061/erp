import { describe, expect, it } from "vitest";
import { calculateInvoice, type CalcLineInput, type CalcOptions } from "@/lib/invoicing/calc";
import { divRound, fromMilli, parseSignedAmount, toMilli } from "@/lib/money";

const line = (over: Partial<CalcLineInput>): CalcLineInput => ({
  quantity: "1", unitPrice: "0", discountPercent: "0", tvaRate: "19", fodecRate: "0", ...over,
});
const noExtras: CalcOptions = { stampDuty: "0", withholdingRate: null, withholdingBase: "ttc", withholdingThreshold: "0" };

describe("arithmétique en millimes", () => {
  it("convertit dans les deux sens sans perte", () => {
    expect(toMilli("12.500")).toBe(12500n);
    expect(toMilli("12")).toBe(12000n);
    expect(toMilli("0.005")).toBe(5n);
    expect(fromMilli(12500n)).toBe("12.500");
    expect(fromMilli(5n)).toBe("0.005");
    expect(fromMilli(-1250n)).toBe("-1.250");
    expect(() => toMilli("1.2345")).toThrow();
    expect(() => toMilli("abc")).toThrow();
  });
  it("arrondit la moitié vers le haut", () => {
    expect(divRound(5n, 10n)).toBe(1n);
    expect(divRound(4n, 10n)).toBe(0n);
    expect(divRound(15n, 10n)).toBe(2n);
  });
});

describe("montants négatifs (déduction d'acompte)", () => {
  it("lit et écrit les montants signés", () => {
    expect(toMilli("-1.500")).toBe(-1500n);
    expect(fromMilli(toMilli("-0.005"))).toBe("-0.005");
    expect(parseSignedAmount("-12,5")).toBe("-12.500");
    expect(parseSignedAmount("-0")).toBe("0.000");
    expect(() => parseSignedAmount("--1")).toThrow();
  });
  it("arrondit symétriquement (moitié en s'éloignant de zéro)", () => {
    expect(divRound(-5n, 10n)).toBe(-1n);
    expect(divRound(-4n, 10n)).toBe(0n);
    expect(divRound(-15n, 10n)).toBe(-2n);
  });
  it("déduit un acompte : HT, TVA et TTC diminuent d'autant", () => {
    const r = calculateInvoice(
      [line({ unitPrice: "1000" }), line({ unitPrice: "-300" })],
      { stampDuty: "1", withholdingRate: null, withholdingBase: "ttc", withholdingThreshold: "0" },
    );
    expect(r.lines[1]).toEqual({ gross: "-300.000", discount: "0.000", netHt: "-300.000", fodec: "0.000" });
    expect(r.totals).toMatchObject({ ht: "700.000", tva: "133.000", ttc: "833.000", netToPay: "834.000" });
  });
  it("garde un arrondi cohérent entre acompte et déduction (même base = même TVA, signe opposé)", () => {
    const dep = calculateInvoice([line({ unitPrice: "33.333" })], noExtras).totals.tva; // 6,33327 -> 6,333
    const ded = calculateInvoice([line({ unitPrice: "-33.333" })], noExtras).totals.tva;
    expect(ded).toBe(`-${dep}`);
  });
});

describe("calcul d'une facture", () => {
  it("applique l'ordre légal : remise, FODEC, TVA sur HT+FODEC, TTC, timbre, retenue", () => {
    const r = calculateInvoice(
      [
        line({ quantity: "2", unitPrice: "100" }),
        line({ quantity: "10", unitPrice: "12.5", fodecRate: "1" }),
      ],
      { stampDuty: "1", withholdingRate: "1.5", withholdingBase: "ttc", withholdingThreshold: "0" },
    );
    expect(r.lines).toEqual([
      { gross: "200.000", discount: "0.000", netHt: "200.000", fodec: "0.000" },
      { gross: "125.000", discount: "0.000", netHt: "125.000", fodec: "1.250" },
    ]);
    expect(r.taxes).toEqual([
      { kind: "fodec", rate: "1.000", base: "125.000", amount: "1.250" },
      // base TVA = 200 + 125 + 1,250 ; 326,250 × 19 % = 61,9875 -> 61,988
      { kind: "tva", rate: "19.000", base: "326.250", amount: "61.988" },
    ]);
    expect(r.totals).toMatchObject({
      ht: "325.000", fodec: "1.250", tvaBase: "326.250", tva: "61.988", ttc: "388.238",
      stampDuty: "1.000",
      withholdingAmount: "5.824", // 388,238 × 1,5 % = 5,82357
      netToPay: "383.414", // 388,238 + 1 − 5,824
    });
  });

  it("gère remise et plusieurs taux de TVA, triés par taux", () => {
    const r = calculateInvoice(
      [
        line({ quantity: "3", unitPrice: "33.333", discountPercent: "10", tvaRate: "7" }),
        line({ quantity: "1.5", unitPrice: "10", tvaRate: "13" }),
      ],
      noExtras,
    );
    // brut 99,999 ; remise 9,9999 -> 10,000 ; HT 89,999 ; TVA 7 % = 6,29993 -> 6,300
    expect(r.lines[0]).toEqual({ gross: "99.999", discount: "10.000", netHt: "89.999", fodec: "0.000" });
    expect(r.taxes.map((t) => [t.kind, t.rate, t.amount])).toEqual([
      ["tva", "7.000", "6.300"],
      ["tva", "13.000", "1.950"],
    ]);
    expect(r.totals).toMatchObject({ gross: "114.999", discount: "10.000", ht: "104.999", tva: "8.250", ttc: "113.249" });
  });

  it("arrondit la TVA une seule fois par taux, pas ligne par ligne", () => {
    // Trois lignes à 0,025 : TVA par ligne = 0,00475 -> 0,005 chacune (0,015 au total)
    // mais base cumulée 0,075 × 19 % = 0,01425 -> 0,014.
    const r = calculateInvoice(Array.from({ length: 3 }, () => line({ unitPrice: "0.025" })), noExtras);
    expect(r.taxes).toEqual([{ kind: "tva", rate: "19.000", base: "0.075", amount: "0.014" }]);
    expect(r.totals.ttc).toBe("0.089");
  });

  it("arrondit la moitié vers le haut", () => {
    const r = calculateInvoice([line({ unitPrice: "0.025" })], noExtras); // 0,00475 -> 0,005
    expect(r.totals.tva).toBe("0.005");
  });

  it("n'applique la retenue que si la base atteint le seuil, sur la base choisie", () => {
    const opts = (base: "ht" | "ttc", threshold: string): CalcOptions =>
      ({ stampDuty: "1", withholdingRate: "1.5", withholdingBase: base, withholdingThreshold: threshold });
    const lines = [line({ unitPrice: "1000" })]; // HT 1000, TVA 190, TTC 1190
    expect(calculateInvoice(lines, opts("ttc", "0")).totals.withholdingAmount).toBe("17.850");
    expect(calculateInvoice(lines, opts("ht", "0")).totals.withholdingAmount).toBe("15.000");
    expect(calculateInvoice(lines, opts("ttc", "1190")).totals.withholdingAmount).toBe("17.850"); // seuil atteint
    expect(calculateInvoice(lines, opts("ttc", "1190.001")).totals.withholdingAmount).toBe("0.000");
    expect(calculateInvoice(lines, opts("ht", "1000.001")).totals.withholdingAmount).toBe("0.000");
    // Le timbre n'entre pas dans la base de la retenue et s'ajoute au net à payer.
    expect(calculateInvoice(lines, opts("ttc", "0")).totals.netToPay).toBe("1173.150"); // 1190 + 1 − 17,85
  });

  it("sans retenue ni timbre, net à payer = TTC", () => {
    const r = calculateInvoice([line({ unitPrice: "10" })], noExtras);
    expect(r.totals).toMatchObject({ ttc: "11.900", withholdingRate: null, withholdingAmount: "0.000", netToPay: "11.900" });
  });

  it("gère la TVA à 0 % (export, exonéré)", () => {
    const r = calculateInvoice([line({ unitPrice: "500", tvaRate: "0" })], noExtras);
    expect(r.totals).toMatchObject({ ht: "500.000", tva: "0.000", ttc: "500.000" });
  });

  it("gère les grands montants sans perte de précision", () => {
    const r = calculateInvoice([line({ quantity: "999999.999", unitPrice: "999999.999" })], noExtras);
    // 999999,999² = 999999998000,000001 -> 999999998000,000 après arrondi au millime
    expect(r.lines[0]?.gross).toBe("999999998000.000");
  });

  it("refuse les entrées invalides", () => {
    expect(() => calculateInvoice([line({ quantity: "abc" })], noExtras)).toThrow();
    expect(() => calculateInvoice([line({ unitPrice: "1.2345" })], noExtras)).toThrow();
  });

  it("garde des totaux cohérents avec la somme des lignes et des taxes (jeu pseudo-aléatoire)", () => {
    let seed = 12345;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const rates = ["0", "7", "13", "19"];
    for (let run = 0; run < 200; run++) {
      const inputs = Array.from({ length: 1 + rnd(8) }, () =>
        line({
          quantity: `${1 + rnd(50)}.${String(rnd(1000)).padStart(3, "0")}`,
          unitPrice: `${rnd(2000)}.${String(rnd(1000)).padStart(3, "0")}`,
          discountPercent: `${rnd(40)}.${String(rnd(1000)).padStart(3, "0")}`,
          tvaRate: rates[rnd(4)]!,
          fodecRate: rnd(3) === 0 ? "1" : "0",
        }),
      );
      const r = calculateInvoice(inputs, { stampDuty: "1", withholdingRate: "1.5", withholdingBase: "ttc", withholdingThreshold: "0" });
      const sum = (xs: string[]) => xs.reduce((a, x) => a + toMilli(x), 0n);
      expect(sum(r.lines.map((l) => l.netHt))).toBe(toMilli(r.totals.ht));
      expect(sum(r.lines.map((l) => l.fodec))).toBe(toMilli(r.totals.fodec));
      expect(sum(r.lines.map((l) => l.gross)) - sum(r.lines.map((l) => l.discount))).toBe(toMilli(r.totals.ht));
      expect(sum(r.taxes.filter((t) => t.kind === "tva").map((t) => t.amount))).toBe(toMilli(r.totals.tva));
      expect(sum(r.taxes.filter((t) => t.kind === "tva").map((t) => t.base))).toBe(toMilli(r.totals.tvaBase));
      expect(sum(r.taxes.filter((t) => t.kind === "fodec").map((t) => t.amount))).toBe(toMilli(r.totals.fodec));
      expect(toMilli(r.totals.ht) + toMilli(r.totals.fodec) + toMilli(r.totals.tva)).toBe(toMilli(r.totals.ttc));
      expect(toMilli(r.totals.ttc) + toMilli(r.totals.stampDuty) - toMilli(r.totals.withholdingAmount)).toBe(toMilli(r.totals.netToPay));
    }
  });
});
