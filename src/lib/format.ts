export function formatMontant(montant: number, devise = "TND") {
  const formatted = new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: devise,
    minimumFractionDigits: 3,
  }).format(montant);

  // Remplace les espaces insecables (U+202F/U+00A0) par des espaces normaux :
  // la police PDF standard (WinAnsi) ne les supporte pas et les affiche corrompus.
  return formatted.replace(/[  ]/g, " ");
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("fr-FR");
}
