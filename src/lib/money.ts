import { z } from "zod";

/**
 * Montants en dinars : chaînes décimales à 3 chiffres ("1234.500"), jamais de `number`.
 * Correspond au NUMERIC(15,3) de PostgreSQL et au format TEIF (trois décimales).
 */

const MAX_INTEGER_DIGITS = 12;

export class AmountError extends Error {}

/** Accepte "1 234,5", "1234.500", "12" ; refuse plus de 3 décimales, le négatif et les non-nombres. */
export function parseAmount(input: string): string {
  const cleaned = input.replace(/[\s  ]/g, "").replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(cleaned);
  if (!match) throw new AmountError("Montant invalide (3 décimales maximum, positif)");
  const [, int = "", dec = ""] = match;
  const intPart = int.replace(/^0+(?=\d)/, "");
  if (intPart.length > MAX_INTEGER_DIGITS) throw new AmountError("Montant trop grand");
  return `${intPart}.${dec.padEnd(3, "0")}`;
}

/**
 * Arithmétique exacte en millimes (BigInt) : "12.500" <-> 12500n.
 * Tous les calculs de facturation passent par là, jamais par `number`.
 */
export function toMilli(value: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!m) throw new AmountError(`Valeur décimale invalide : « ${value} »`);
  const abs = BigInt(m[2] ?? "0") * 1000n + BigInt((m[3] ?? "").padEnd(3, "0"));
  return m[1] ? -abs : abs;
}

export function fromMilli(milli: bigint): string {
  const neg = milli < 0n;
  const abs = neg ? -milli : milli;
  const s = `${abs / 1000n}.${String(abs % 1000n).padStart(3, "0")}`;
  return neg ? `-${s}` : s;
}

/**
 * Division arrondie au plus proche, moitié en s'éloignant de zéro (symétrique pour les négatifs :
 * -0,0005 arrondit à -0,001 comme +0,0005 arrondit à +0,001). Le dénominateur est positif.
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) return -((-numerator + denominator / 2n) / denominator);
  return (numerator + denominator / 2n) / denominator;
}

/** Comme parseAmount mais accepte un signe "-" (lignes de déduction d'acompte). */
export function parseSignedAmount(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("-")) {
    const abs = parseAmount(trimmed.slice(1));
    return abs === "0.000" ? abs : `-${abs}`;
  }
  return parseAmount(trimmed);
}

/** Schéma zod pour un montant pouvant être négatif. */
export const signedAmountSchema = z.string().transform((value, ctx) => {
  try {
    return parseSignedAmount(value);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});

/** Schéma zod pour un champ de montant saisi dans un formulaire. */
export const amountSchema = z.string().transform((value, ctx) => {
  try {
    return parseAmount(value);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});

/** "1234567.500" -> "1 234 567,500" (espace insécable fine, virgule décimale). */
export function formatAmount(value: string): string {
  const [int = "0", dec = "000"] = value.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped},${dec.padEnd(3, "0")}`;
}

export const formatTnd = (value: string) => `${formatAmount(value)} DT`;

/** Taux en pourcentage : "19.000" -> "19 %", "1.500" -> "1,5 %". */
export function formatPercent(value: string): string {
  const trimmed = value.replace(/\.?0+$/, "");
  return `${trimmed.replace(".", ",")} %`;
}
