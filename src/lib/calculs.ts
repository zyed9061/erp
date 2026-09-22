export type LigneCalcul = {
  quantite: number;
  prixUnitaireHT: number;
  remisePct?: number;
  tauxTva: number;
};

export type LigneCalculee = LigneCalcul & {
  totalHT: number;
  totalTva: number;
  totalTTC: number;
};

const arrondir = (valeur: number) => Math.round(valeur * 1000) / 1000;

export function calculerLigne(ligne: LigneCalcul): LigneCalculee {
  const brutHT = ligne.quantite * ligne.prixUnitaireHT;
  const remise = brutHT * ((ligne.remisePct ?? 0) / 100);
  const totalHT = arrondir(brutHT - remise);
  const totalTva = arrondir(totalHT * (ligne.tauxTva / 100));
  const totalTTC = arrondir(totalHT + totalTva);

  return { ...ligne, totalHT, totalTva, totalTTC };
}

export type TotauxDocument = {
  sousTotalHT: number;
  totalTva: number;
  totalTTC: number;
};

export function calculerTotaux(lignes: LigneCalcul[], timbreFiscal = 0): TotauxDocument {
  const calculees = lignes.map(calculerLigne);
  const sousTotalHT = arrondir(calculees.reduce((acc, l) => acc + l.totalHT, 0));
  const totalTva = arrondir(calculees.reduce((acc, l) => acc + l.totalTva, 0));
  const totalTTC = arrondir(sousTotalHT + totalTva + timbreFiscal);

  return { sousTotalHT, totalTva, totalTTC };
}

export function calculerResteAPayer(totalTTC: number, montantPaye: number): number {
  return arrondir(totalTTC - montantPaye);
}

/**
 * Rejette un paiement superieur au solde restant. Le montant positif est deja
 * garanti par le schema de validation (paiementSchema) ; seule la borne haute
 * est verifiee ici.
 */
export function verifierMontantPaiement(resteAPayer: number, montant: number): void {
  if (montant > resteAPayer) {
    throw new Error(
      `Le montant depasse le solde restant a payer (${resteAPayer}).`,
    );
  }
}
