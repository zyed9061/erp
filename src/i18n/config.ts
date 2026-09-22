export const LOCALES = ["fr", "en", "ar", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

export const LOCALE_COOKIE = "erp-locale";

export const LOCALE_DIR: Record<Locale, "ltr" | "rtl"> = {
  fr: "ltr",
  en: "ltr",
  ar: "rtl",
  de: "ltr",
};

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Francais",
  en: "English",
  ar: "العربية",
  de: "Deutsch",
};

/** BCP 47 tag used by Intl for dates and amounts (Tunisian conventions where they exist). */
export const INTL_LOCALE: Record<Locale, string> = {
  fr: "fr-TN",
  en: "en-GB",
  ar: "ar-TN",
  de: "de-DE",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
