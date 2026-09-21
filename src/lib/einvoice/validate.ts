import { calculateInvoice } from "../invoicing/calc";
import { fromMilli, toMilli } from "../money";
import type { EinvoiceData } from "./teif";

/**
 * Contrôles INTERNES d'une facture avant export : tout ce qui se vérifie sans le XSD ni les codes officiels de TTN
 * (cohérence des montants, dates, identifiants, pays…). Ils ne prouvent pas la conformité TEIF : ils évitent d'exporter
 * un document déjà incohérent en interne.
 */

const AMOUNT = /^-?\d+\.\d{3}$/;
const isRealDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
const sameAmount = (a: string, b: string) => AMOUNT.test(a) && AMOUNT.test(b) && toMilli(a) === toMilli(b);

export type Findings = { errors: string[]; warnings: string[] };

export function validateEinvoiceData(data: EinvoiceData): Findings {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Identité du document ---------------------------------------------------------------------------------------------
  if (!data.number.trim()) errors.push("Numéro de facture absent.");
  if (!isRealDate(data.issueDate)) errors.push(`Date d'émission invalide : « ${data.issueDate} ».`);
  if (data.dueDate !== null) {
    if (!isRealDate(data.dueDate)) errors.push(`Date d'échéance invalide : « ${data.dueDate} ».`);
    else if (isRealDate(data.issueDate) && data.dueDate < data.issueDate) errors.push("La date d'échéance précède la date d'émission.");
  }

  // --- Parties --------------------------------------------------------------------------------------------------------------
  for (const [label, p] of [["société", data.company], ["client", data.customer]] as const) {
    if (!/^[A-Z]{2}$/.test(p.country)) errors.push(`Code pays du ${label} invalide : « ${p.country} » (2 lettres majuscules attendues, ex. TN).`);
    if (p.country === "TN" && p.postalCode && !/^\d{4}$/.test(p.postalCode)) warnings.push(`Code postal du ${label} inhabituel pour la Tunisie : « ${p.postalCode} » (4 chiffres attendus).`);
  }

  // --- Lignes ---------------------------------------------------------------------------------------------------------------
  const positions = data.lines.map((l) => l.position);
  if (new Set(positions).size !== positions.length) errors.push("Numéros de ligne en double.");
  for (const l of data.lines) {
    const n = `Ligne ${l.position}`;
    if (!l.description.trim()) errors.push(`${n} : description vide.`);
    if (!l.unit.trim()) errors.push(`${n} : unité vide.`);
    if (!(Number(l.quantity) > 0)) errors.push(`${n} : quantité non positive.`);
    if (Number(l.discountPercent) < 0 || Number(l.discountPercent) > 100) errors.push(`${n} : remise hors de 0 à 100 %.`);
  }

  // Une facture finale déduit les acomptes par des lignes de prix négatif : c'est normal, mais leur représentation TEIF est à confirmer.
  if (data.lines.some((l) => Number(l.unitPrice) < 0)) {
    warnings.push("Lignes de déduction d'acompte (prix négatif) : leur représentation dans le TEIF est À FOURNIR PAR TTN.");
  }

  // --- Montants : format ------------------------------------------------------------------------------------------------------
  const t = data.totals;
  const amounts: [string, string][] = [
    ["total HT", t.ht], ["FODEC", t.fodec], ["base TVA", t.tvaBase], ["TVA", t.tva], ["TTC", t.ttc], ["timbre", t.stampDuty],
    ["retenue à la source", t.withholdingAmount], ["retenue de garantie", t.guaranteeHoldback], ["net à payer", t.netToPay],
    ...data.lines.flatMap((l) => [[`ligne ${l.position} (prix)`, l.unitPrice], [`ligne ${l.position} (HT)`, l.netHt]] as [string, string][]),
    ...data.taxes.flatMap((x) => [[`taxe ${x.kind} ${x.rate} (base)`, x.base], [`taxe ${x.kind} ${x.rate} (montant)`, x.amount]] as [string, string][]),
  ];
  const malformed = amounts.filter(([, v]) => !AMOUNT.test(v));
  for (const [label, v] of malformed) errors.push(`Montant « ${label} » mal formé : « ${v} » (3 décimales attendues).`);
  if (malformed.length > 0) return { errors, warnings }; // inutile de recalculer sur des montants illisibles

  // --- Montants : recalcul par le moteur de facturation -----------------------------------------------------------------------
  if (data.lines.length > 0) {
    const calc = calculateInvoice(
      data.lines.map((l) => ({
        quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent,
        tvaRate: l.tvaCode === "EXO" ? "0.000" : l.tvaRate, fodecRate: l.fodecRate,
      })),
      { stampDuty: t.stampDuty, withholdingRate: null, withholdingBase: "ttc", withholdingThreshold: "0.000" },
    );
    data.lines.forEach((l, i) => {
      if (!sameAmount(l.netHt, calc.lines[i]!.netHt)) errors.push(`Ligne ${l.position} : HT enregistré ${l.netHt}, recalculé ${calc.lines[i]!.netHt}.`);
      if (!sameAmount(l.fodec, calc.lines[i]!.fodec)) errors.push(`Ligne ${l.position} : FODEC enregistré ${l.fodec}, recalculé ${calc.lines[i]!.fodec}.`);
    });
    const checks: [string, string, string][] = [
      ["total HT", t.ht, calc.totals.ht], ["FODEC", t.fodec, calc.totals.fodec], ["base TVA", t.tvaBase, calc.totals.tvaBase],
      ["TVA", t.tva, calc.totals.tva], ["TTC", t.ttc, calc.totals.ttc],
    ];
    for (const [label, stored, expected] of checks) {
      if (!sameAmount(stored, expected)) errors.push(`Total « ${label} » enregistré ${stored}, recalculé ${expected}.`);
    }

    const key = (x: { kind: string; rate: string }) => `${x.kind}|${toMilli(x.rate)}`;
    const stored = new Map(data.taxes.map((x) => [key(x), x]));
    for (const e of calc.taxes) {
      const s = stored.get(key(e));
      if (!s) errors.push(`Récapitulatif de taxes : ${e.kind} ${e.rate} % manquant.`);
      else if (!sameAmount(s.base, e.base) || !sameAmount(s.amount, e.amount)) {
        errors.push(`Récapitulatif ${e.kind} ${e.rate} % : base/montant ${s.base}/${s.amount}, recalculés ${e.base}/${e.amount}.`);
      }
    }
    if (stored.size !== calc.taxes.length) errors.push("Le récapitulatif de taxes contient des taux qui ne correspondent à aucune ligne.");
  }

  // --- Montants : identité du net à payer ------------------------------------------------------------------------------------
  const net = toMilli(t.ttc) + toMilli(t.stampDuty) - toMilli(t.withholdingAmount) - toMilli(t.guaranteeHoldback);
  if (toMilli(t.netToPay) !== net) errors.push(`Net à payer ${t.netToPay} : TTC + timbre − retenues donne ${fromMilli(net)}.`);
  if (toMilli(t.withholdingAmount) > toMilli(t.ttc)) errors.push("La retenue à la source dépasse le TTC.");
  for (const [label, v] of [["timbre", t.stampDuty], ["retenue à la source", t.withholdingAmount], ["retenue de garantie", t.guaranteeHoldback]] as const) {
    if (toMilli(v) < 0) errors.push(`Montant « ${label} » négatif.`);
  }
  if (toMilli(t.withholdingAmount) > 0 && !t.withholdingRate) errors.push("Retenue à la source sans taux.");

  return { errors, warnings };
}
