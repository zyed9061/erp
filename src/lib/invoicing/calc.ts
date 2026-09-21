import { divRound, fromMilli, toMilli } from "@/lib/money";

/**
 * Moteur de calcul d'une facture (fonction pure, sans accès base : utilisable côté
 * serveur ET côté navigateur pour l'aperçu en direct, avec exactement les mêmes résultats).
 *
 * Ordre légal appliqué (cf. docs/recherche-facturation.md, c.4) :
 *   brut = quantité × prix unitaire            (arrondi au millime)
 *   remise = brut × remise %                   (arrondie au millime)
 *   HT ligne = brut − remise
 *   FODEC ligne = HT ligne × taux FODEC        (arrondi ligne par ligne)
 *   base TVA = Σ (HT ligne + FODEC ligne), par taux de TVA
 *   TVA = base TVA × taux                      (arrondie une fois par taux)
 *   TTC = HT + FODEC + TVA
 *   net à payer = TTC + timbre − retenue à la source − retenue de garantie (BTP, sur le TTC)
 *
 * Règle d'arrondi (unique, appliquée partout : écran, PDF, TEIF, rapports) :
 * au millime le plus proche, moitié vers le haut. Les montants affichés sont exactement
 * les montants stockés : le total est toujours la somme de ce qui est affiché.
 *
 * Tout est calculé en millimes entiers (BigInt) : aucun flottant.
 */

export type CalcLineInput = {
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  tvaRate: string;
  /** "0.000" si la ligne n'est pas soumise au FODEC. */
  fodecRate: string;
};

export type CalcOptions = {
  /** Montant du timbre à ajouter ("0.000" si non applicable). */
  stampDuty: string;
  withholdingRate: string | null;
  /** Base de calcul de la retenue à la source : HT ou TTC (hors timbre). */
  withholdingBase: "ht" | "ttc";
  /** La retenue ne s'applique que si la base atteint ce seuil. */
  withholdingThreshold: string;
  /** Retenue de garantie (BTP) en % du TTC, conservée par le client jusqu'à la réception des travaux. */
  guaranteeHoldbackRate?: string | null;
};

export type CalcLine = { gross: string; discount: string; netHt: string; fodec: string };

export type TaxSummaryRow = { kind: "tva" | "fodec"; rate: string; base: string; amount: string };

export type CalcTotals = {
  gross: string;
  discount: string;
  ht: string;
  fodec: string;
  tvaBase: string;
  tva: string;
  ttc: string;
  stampDuty: string;
  withholdingRate: string | null;
  withholdingAmount: string;
  guaranteeHoldbackRate: string | null;
  guaranteeHoldback: string;
  netToPay: string;
};

export type CalcResult = { lines: CalcLine[]; taxes: TaxSummaryRow[]; totals: CalcTotals };

const PCT = 100000n; // un pourcentage à 3 décimales est en millièmes de % : ÷ 100 × 1000

const pct = (base: bigint, rateMilli: bigint) => divRound(base * rateMilli, PCT);

export function calculateInvoice(inputs: CalcLineInput[], options: CalcOptions): CalcResult {
  const lines: CalcLine[] = [];
  const tvaBases = new Map<bigint, bigint>(); // taux (millièmes de %) -> base
  const fodecGroups = new Map<bigint, { base: bigint; amount: bigint }>();
  let gross = 0n, discount = 0n, ht = 0n, fodec = 0n;

  for (const line of inputs) {
    const lineGross = divRound(toMilli(line.quantity) * toMilli(line.unitPrice), 1000n);
    const lineDiscount = pct(lineGross, toMilli(line.discountPercent));
    const netHt = lineGross - lineDiscount;
    const fodecRate = toMilli(line.fodecRate);
    const lineFodec = fodecRate > 0n ? pct(netHt, fodecRate) : 0n;

    lines.push({
      gross: fromMilli(lineGross),
      discount: fromMilli(lineDiscount),
      netHt: fromMilli(netHt),
      fodec: fromMilli(lineFodec),
    });
    gross += lineGross;
    discount += lineDiscount;
    ht += netHt;
    fodec += lineFodec;

    const tvaRate = toMilli(line.tvaRate);
    tvaBases.set(tvaRate, (tvaBases.get(tvaRate) ?? 0n) + netHt + lineFodec);
    if (fodecRate > 0n) {
      const g = fodecGroups.get(fodecRate) ?? { base: 0n, amount: 0n };
      fodecGroups.set(fodecRate, { base: g.base + netHt, amount: g.amount + lineFodec });
    }
  }

  const taxes: TaxSummaryRow[] = [];
  for (const [rate, g] of [...fodecGroups].sort((a, b) => Number(a[0] - b[0]))) {
    taxes.push({ kind: "fodec", rate: fromMilli(rate), base: fromMilli(g.base), amount: fromMilli(g.amount) });
  }
  let tvaBase = 0n, tva = 0n;
  for (const [rate, base] of [...tvaBases].sort((a, b) => Number(a[0] - b[0]))) {
    const amount = pct(base, rate);
    taxes.push({ kind: "tva", rate: fromMilli(rate), base: fromMilli(base), amount: fromMilli(amount) });
    tvaBase += base;
    tva += amount;
  }

  const ttc = ht + fodec + tva;
  const stamp = toMilli(options.stampDuty);

  let withholding = 0n;
  if (options.withholdingRate !== null) {
    const rate = toMilli(options.withholdingRate);
    const base = options.withholdingBase === "ht" ? ht : ttc;
    if (rate > 0n && base >= toMilli(options.withholdingThreshold)) withholding = pct(base, rate);
  }

  const holdbackRate = options.guaranteeHoldbackRate ? toMilli(options.guaranteeHoldbackRate) : 0n;
  const holdback = holdbackRate > 0n && ttc > 0n ? pct(ttc, holdbackRate) : 0n;

  return {
    lines,
    taxes,
    totals: {
      gross: fromMilli(gross),
      discount: fromMilli(discount),
      ht: fromMilli(ht),
      fodec: fromMilli(fodec),
      tvaBase: fromMilli(tvaBase),
      tva: fromMilli(tva),
      ttc: fromMilli(ttc),
      stampDuty: fromMilli(stamp),
      withholdingRate: options.withholdingRate,
      withholdingAmount: fromMilli(withholding),
      guaranteeHoldbackRate: options.guaranteeHoldbackRate ?? null,
      guaranteeHoldback: fromMilli(holdback),
      netToPay: fromMilli(ttc + stamp - withholding - holdback),
    },
  };
}
