/**
 * The stored `statut` is only updated on explicit actions (send, pay, cancel).
 * Nothing currently flips a facture to EN_RETARD when its due date passes, so
 * we derive that for display purposes without mutating the persisted value.
 */
export function computeFactureDisplayStatut(facture: {
  statut: string;
  dateEcheance: Date | null;
  totalTTC: number;
  montantPaye: number;
}): string {
  if (facture.statut === "ANNULEE" || facture.statut === "PAYEE" || facture.statut === "BROUILLON") {
    return facture.statut;
  }
  const resteAPayer = facture.totalTTC - facture.montantPaye;
  if (resteAPayer > 0 && facture.dateEcheance && facture.dateEcheance.getTime() < Date.now()) {
    return "EN_RETARD";
  }
  return facture.statut;
}
