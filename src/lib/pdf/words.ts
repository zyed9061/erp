import { toMilli } from "../money";

const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0..99. `final` : le nombre termine l'énoncé (« quatre-vingts » prend son s, pas « quatre-vingt-un »). */
function below100(n: number, final: boolean): string {
  if (n < 20) return UNITS[n]!;
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    // soixante-dix… / quatre-vingt-dix… : la dizaine précédente + 10..19
    const base = t === 7 ? "soixante" : "quatre-vingt";
    if (t === 7 && u === 1) return "soixante et onze";
    return `${base}-${UNITS[10 + u]}`;
  }
  if (t === 8) return u === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITS[u]}`;
  const ten = TENS[t]!;
  if (u === 0) return ten;
  return u === 1 ? `${ten} et un` : `${ten}-${UNITS[u]}`;
}

/** 0..999 */
function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return below100(rest, final);
  const hundreds = h === 1 ? "cent" : `${UNITS[h]} cent${rest === 0 && final ? "s" : ""}`;
  return rest === 0 ? hundreds : `${hundreds} ${below100(rest, final)}`;
}

/** Entier positif ou nul, jusqu'à 999 999 999 999, en lettres françaises. */
export function integerInWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) throw new RangeError("Nombre hors limites");
  if (n === 0) return "zéro";
  const groups: [number, string, string][] = [
    [Math.floor(n / 1_000_000_000), "milliard", "milliards"],
    [Math.floor(n / 1_000_000) % 1000, "million", "millions"],
    [Math.floor(n / 1000) % 1000, "mille", "mille"], // « mille » est invariable
    [n % 1000, "", ""],
  ];
  const parts: string[] = [];
  groups.forEach(([value, singular, plural], i) => {
    if (value === 0) return;
    const isLast = i === groups.length - 1;
    // « mille » : jamais « un mille », et « cent » / « vingt » ne prennent pas de s devant lui.
    if (singular === "mille") {
      parts.push(value === 1 ? "mille" : `${below1000(value, false)} mille`);
    } else if (isLast) {
      parts.push(below1000(value, true));
    } else {
      parts.push(`${below1000(value, false)} ${value > 1 ? plural : singular}`);
    }
  });
  return parts.join(" ");
}

/** « 383.414 » -> « trois cent quatre-vingt-trois dinars et quatre cent quatorze millimes ». */
export function amountInWords(amount: string): string {
  const milli = toMilli(amount);
  const abs = milli < 0n ? -milli : milli;
  const dinars = Number(abs / 1000n);
  const millimes = Number(abs % 1000n);
  const d = `${integerInWords(dinars)} ${dinars > 1 ? "dinars" : "dinar"}`;
  const text = millimes === 0 ? d : `${d} et ${integerInWords(millimes)} ${millimes > 1 ? "millimes" : "millime"}`;
  return milli < 0n ? `moins ${text}` : text;
}
