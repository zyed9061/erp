import type { FactureStatus } from "@/generated/prisma/enums";

/**
 * Le retard est DERIVE, jamais stocke.
 *
 * Aucun code n'ecrit `EN_RETARD` en base : une tache planifiee serait a la fois
 * une piece mobile de plus et une source de derive (une facture devient en
 * retard a une date, pas au passage d'un cron). On le recalcule donc a la
 * lecture, a partir de l'echeance et du reste a payer.
 *
 * Seules les factures reellement en attente de reglement peuvent basculer :
 * un brouillon n'est pas en retard, une facture payee ou annulee non plus.
 */
const ESCALADABLES: ReadonlySet<string> = new Set(["ENVOYEE", "PARTIELLEMENT_PAYEE"]);

export type FactureEcheance = {
  statut: FactureStatus | string;
  dateEcheance: Date | null;
  totalTTC: number;
  montantPaye: number;
};

/** Debut de journee : une facture echue aujourd'hui n'est pas encore en retard. */
function debutDeJournee(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function estEnRetard(f: FactureEcheance, maintenant = new Date()): boolean {
  if (!ESCALADABLES.has(f.statut)) return false;
  if (!f.dateEcheance) return false;
  if (f.totalTTC - f.montantPaye <= 0) return false;
  return debutDeJournee(f.dateEcheance) < debutDeJournee(maintenant);
}

/** Statut a afficher : le statut stocke, escalade en EN_RETARD si l'echeance est passee. */
export function statutEffectif(f: FactureEcheance, maintenant = new Date()): string {
  return estEnRetard(f, maintenant) ? "EN_RETARD" : String(f.statut);
}

/** Jours d'ecart avec l'echeance : negatif = en retard, null = sans echeance. */
export function joursAvantEcheance(
  dateEcheance: Date | null,
  maintenant = new Date(),
): number | null {
  if (!dateEcheance) return null;
  const JOUR_MS = 24 * 60 * 60 * 1000;
  return Math.round((debutDeJournee(dateEcheance) - debutDeJournee(maintenant)) / JOUR_MS);
}
