/**
 * Export CSV pensé pour Excel en français : séparateur « ; », virgule décimale, BOM UTF-8 (accents corrects),
 * fins de ligne CRLF. Les cellules TEXTE sont protégées contre l'injection de formule (=, +, -, @ en tête) :
 * un nom de client « =HYPERLINK(…) » s'ouvrirait sinon comme une formule dans le tableur.
 */

/** Cellule numérique : montant décimal (ex. "-12.500") écrit avec la virgule, jamais protégé comme du texte. */
export class Num {
  constructor(readonly value: string) {}
}
export const num = (value: string) => new Num(value);

export type Cell = string | number | null | undefined | Num;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Num) return cell.value.replace(".", ",");
  if (typeof cell === "number") return String(cell);
  let text = FORMULA_START.test(cell) ? `'${cell}` : cell;
  if (/[;"\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
