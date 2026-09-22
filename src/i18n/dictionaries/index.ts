import fr, { type Messages } from "./fr";
import en from "./en";
import ar from "./ar";
import type { Locale } from "../config";

export const dictionaries: Record<Locale, Messages> = { fr, en, ar };
export type { Messages };
