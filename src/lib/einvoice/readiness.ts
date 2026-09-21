import { pendingLabels } from "./teif-codes";
import type { EinvoiceData } from "./teif";
import { validateEinvoiceData } from "./validate";

export type Readiness = {
  /** Données manquantes ou incohérentes : la préparation est refusée. */
  errors: string[];
  /** Points à connaître : la préparation reste possible. */
  warnings: string[];
};

/**
 * Matricule fiscal : 7 chiffres au minimum ; la forme complète ajoute la clé, le code TVA, la catégorie et le n° d'établissement
 * (ex. 1234567A/A/M/000). L'application ne contrôle pas le format à la saisie : on ne bloque que l'évidence.
 * À AFFINER quand TTN fournira la règle officielle du matricule fiscal.
 */
const compact = (v: string) => v.replace(/\s+/g, "").toUpperCase();
export const MF_MIN = /^\d{7}/;
export const MF_FULL = /^\d{7}[A-Z]?(\/[A-Z]){2}\/\d{3}$/;

const FROZEN = " Les données de la facture sont figées à sa validation : si la fiche a été complétée depuis, seules les nouvelles factures en profitent (avoir + nouvelle facture pour celle-ci).";

export function checkReadiness(data: EinvoiceData): Readiness {
  const errors: string[] = [];
  const warnings: string[] = [];

  const mf = compact(data.company.matriculeFiscal ?? "");
  if (!mf) errors.push(`Matricule fiscal de la société absent.${FROZEN}`);
  else if (!MF_MIN.test(mf)) errors.push(`Matricule fiscal de la société invalide : « ${mf} » (7 chiffres au minimum).`);
  else if (!MF_FULL.test(mf)) warnings.push("Matricule fiscal de la société incomplet : la forme complète est 1234567A/A/M/000.");
  if (!data.company.name.trim()) errors.push("Raison sociale de la société absente.");
  if (!data.company.address?.trim()) errors.push(`Adresse de la société absente.${FROZEN}`);

  const cmf = compact(data.customer.matriculeFiscal ?? "");
  if (data.customer.type === "entreprise" && !cmf) errors.push(`Matricule fiscal du client absent (client entreprise).${FROZEN}`);
  else if (cmf && !MF_MIN.test(cmf)) errors.push(`Matricule fiscal du client invalide : « ${cmf} ».`);
  if (!data.customer.name.trim()) errors.push("Nom du client absent.");
  if (!data.customer.address?.trim()) errors.push(`Adresse du client absente.${FROZEN}`);

  if (data.currency !== "TND") errors.push(`Devise ${data.currency} : le TEIF de cette application ne gère que le dinar (TND).`);
  if (data.lines.length === 0) errors.push("Aucune ligne.");
  if (data.kind === "credit_note" && !data.originalNumber) errors.push("Avoir sans facture d'origine.");

  const internal = validateEinvoiceData(data);
  errors.push(...internal.errors);
  warnings.push(...internal.warnings);

  const pending = pendingLabels();
  if (pending.length > 0) {
    warnings.push(
      "À FOURNIR PAR TTN : XSD, annexe A des codes et guide d'implémentation. Le format n'est pas validé ; "
      + `${pending.length} élément(s) de la spécification restent inconnus et sont marqués « A-FOURNIR-PAR-TTN » dans le fichier.`,
    );
  }
  warnings.push("Non couvert : signature électronique, cachet visible (QR code), conditions et moyens de paiement, transmission à TTN.");
  return { errors, warnings };
}
