import { dictionaries, type Messages } from "./dictionaries";
import type { Locale } from "./config";

type Vars = Record<string, string | number>;

function resolve(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(locale: Locale) {
  const dict: Messages = dictionaries[locale];
  return function t(key: string, vars?: Vars): string {
    const value = resolve(dict, key.split("."));
    if (typeof value !== "string") return key;
    return interpolate(value, vars);
  };
}

export type Translator = ReturnType<typeof createTranslator>;
