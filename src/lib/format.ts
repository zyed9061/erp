import { INTL_LOCALE, DEFAULT_LOCALE, type Locale } from "@/i18n/config";

// `locale` defaults to French so PDF documents (always generated in French) are unaffected;
// UI code passes the current locale from useLocale() / getLocale().
export function formatMontant(montant: number, devise = "TND", locale: Locale = DEFAULT_LOCALE) {
  const formatted = new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: devise,
    minimumFractionDigits: 3,
  }).format(montant);

  // Remplace les espaces insecables (U+202F/U+00A0) par des espaces normaux :
  // la police PDF standard (WinAnsi) ne les supporte pas et les affiche corrompus.
  return formatted.replace(/[  ]/g, " ");
}

export function formatDate(date: Date | string, locale: Locale = DEFAULT_LOCALE) {
  return new Date(date).toLocaleDateString(INTL_LOCALE[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
