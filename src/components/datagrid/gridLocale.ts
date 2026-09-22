import { AG_GRID_LOCALE_DE, AG_GRID_LOCALE_EG, AG_GRID_LOCALE_EN, AG_GRID_LOCALE_FR } from "@ag-grid-community/locale";
import type { Locale } from "@/i18n/config";

/** AG Grid's built-in texts (filter menus, pagination, overlays) for each app locale. */
export const AG_GRID_LOCALE_TEXT: Record<Locale, Record<string, string>> = {
  fr: AG_GRID_LOCALE_FR,
  en: AG_GRID_LOCALE_EN,
  ar: AG_GRID_LOCALE_EG,
  de: AG_GRID_LOCALE_DE,
};
