/**
 * Codes du TEIF (Tunisian Electronic Invoice Format).
 *
 * ATTENTION : la spécification officielle (XSD et annexe A de TTN) n'a pas pu être consultée lors du développement.
 * Les valeurs ci-dessous viennent de sources secondaires ou de mémoire ; aucune n'est validée. Elles sont isolées ICI,
 * et nulle part ailleurs, pour être corrigées en un seul endroit dès que la spécification officielle est disponible :
 *  - `recalled`  : code probable, à confirmer ;
 *  - `unknown`   : code inconnu, remplacé dans le XML par `PENDING_CODE` afin que le fichier ne puisse pas passer pour valide.
 */

export const TEIF_VERSION = "1.8.8";
/** Version du générateur : change à chaque évolution du mapping. Un export est propre à une (facture, version). */
export const GENERATOR_VERSION = "prep-1";

export const PENDING_CODE = "A-CONFIRMER";

export type TeifCode = { code: string | null; status: "recalled" | "unknown"; label: string };

const recalled = (code: string, label: string): TeifCode => ({ code, status: "recalled", label });
const unknown = (label: string): TeifCode => ({ code: null, status: "unknown", label });

export const TEIF_CODES = {
  // Type de document
  docInvoice: recalled("I-11", "Facture"),
  docCreditNote: recalled("I-12", "Facture d'avoir"),
  docDeposit: unknown("Facture d'acompte"),
  // Fonction d'une date
  dateIssue: recalled("I-31", "Date de la facture"),
  dateDue: recalled("I-32", "Date limite de paiement"),
  // Fonction d'une partie
  partySupplier: recalled("I-62", "Fournisseur"),
  partyBuyer: recalled("I-64", "Client"),
  // Type d'identifiant
  idTaxNumber: recalled("I-01", "Matricule fiscal"),
  // Taxes (I-1602 et I-1604 confirmés par un validateur tiers ; le reste inconnu)
  taxVat: recalled("I-1602", "TVA"),
  taxWithholding: recalled("I-1604", "Retenue à la source"),
  taxFodec: unknown("FODEC"),
  taxStamp: unknown("Droit de timbre"),
  // Montants
  amountTotalHt: unknown("Total HT"),
  amountFodec: unknown("Montant FODEC"),
  amountTaxBase: unknown("Base imposable TVA"),
  amountTotalVat: unknown("Total TVA"),
  amountStamp: unknown("Droit de timbre"),
  amountTotalTtc: unknown("Total TTC"),
  amountWithholding: unknown("Retenue à la source"),
  amountNetToPay: unknown("Net à payer"),
  amountLineNet: unknown("Montant HT de la ligne"),
  amountTaxLine: unknown("Montant de taxe"),
  amountTaxableBase: unknown("Base de la taxe"),
  // Référence à un autre document (avoir -> facture d'origine)
  refOriginalInvoice: unknown("Facture d'origine"),
} as const satisfies Record<string, TeifCode>;

export type TeifCodeKey = keyof typeof TEIF_CODES;

export const codeOf = (key: TeifCodeKey): string => TEIF_CODES[key].code ?? PENDING_CODE;

/** Codes encore à confirmer, pour l'affichage de l'avertissement. */
export const unconfirmedCodes = () =>
  (Object.entries(TEIF_CODES) as [TeifCodeKey, TeifCode][]).filter(([, c]) => c.status === "unknown").map(([, c]) => c.label);

/** Unités usuelles vers le code UN/ECE Recommandation 20 ; toute autre unité retombe sur « unité » (C62). */
const UNIT_CODES: Record<string, string> = {
  "unité": "C62", u: "C62", pce: "C62", pièce: "C62", piece: "C62", h: "HUR", heure: "HUR", j: "DAY", jour: "DAY",
  mois: "MON", kg: "KGM", g: "GRM", t: "TNE", m: "MTR", ml: "MTR", "m²": "MTK", m2: "MTK", "m³": "MTQ", m3: "MTQ", l: "LTR",
  forfait: "C62", sac: "C62",
};
export const unitCode = (unit: string) => UNIT_CODES[unit.trim().toLowerCase()] ?? "C62";
