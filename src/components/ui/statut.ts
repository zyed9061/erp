// Identite couleur par statut (devis ET factures).
// Les classes sont ecrites en entier (jamais interpolees) pour que Tailwind
// les detecte au scan des sources.

export type StatutTheme = {
  label: string;
  pill: string;
  dot: string;
  chip: string;
  chipActive: string;
  accent: string;
  bar: string;
};

const slate = {
  pill: "bg-slate-100 text-slate-700 ring-slate-200",
  dot: "bg-slate-400",
  chip: "text-slate-600 hover:bg-slate-100",
  chipActive: "bg-slate-900 text-white",
  accent: "from-slate-400 to-slate-500",
  bar: "from-slate-300 to-slate-400",
};
const sky = {
  pill: "bg-sky-50 text-sky-700 ring-sky-200",
  dot: "bg-sky-500",
  chip: "text-sky-700 hover:bg-sky-50",
  chipActive: "bg-sky-600 text-white",
  accent: "from-sky-400 to-blue-500",
  bar: "from-sky-400 to-blue-500",
};
const amber = {
  pill: "bg-amber-50 text-amber-700 ring-amber-200",
  dot: "bg-amber-500",
  chip: "text-amber-700 hover:bg-amber-50",
  chipActive: "bg-amber-500 text-white",
  accent: "from-amber-400 to-orange-500",
  bar: "from-amber-400 to-orange-500",
};
const emerald = {
  pill: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  dot: "bg-emerald-500",
  chip: "text-emerald-700 hover:bg-emerald-50",
  chipActive: "bg-emerald-600 text-white",
  accent: "from-emerald-400 to-teal-500",
  bar: "from-emerald-400 to-teal-500",
};
const rose = {
  pill: "bg-rose-50 text-rose-700 ring-rose-200",
  dot: "bg-rose-500",
  chip: "text-rose-700 hover:bg-rose-50",
  chipActive: "bg-rose-600 text-white",
  accent: "from-rose-400 to-red-500",
  bar: "from-rose-400 to-red-500",
};
const zinc = {
  pill: "bg-zinc-100 text-zinc-500 ring-zinc-200",
  dot: "bg-zinc-400",
  chip: "text-zinc-500 hover:bg-zinc-100",
  chipActive: "bg-zinc-600 text-white",
  accent: "from-zinc-300 to-zinc-400",
  bar: "from-zinc-300 to-zinc-400",
};
const violet = {
  pill: "bg-violet-50 text-violet-700 ring-violet-200",
  dot: "bg-violet-500",
  chip: "text-violet-700 hover:bg-violet-50",
  chipActive: "bg-violet-600 text-white",
  accent: "from-violet-400 to-purple-500",
  bar: "from-violet-400 to-purple-500",
};

export const STATUT_THEME: Record<string, StatutTheme> = {
  // Communs
  BROUILLON: { label: "Brouillon", ...slate },
  // Factures
  ENVOYEE: { label: "Envoyee", ...sky },
  PARTIELLEMENT_PAYEE: { label: "Partiellement payee", ...amber },
  PAYEE: { label: "Payee", ...emerald },
  EN_RETARD: { label: "En retard", ...rose },
  ANNULEE: { label: "Annulee", ...zinc },
  // Devis
  ENVOYE: { label: "Envoye", ...sky },
  ACCEPTE: { label: "Accepte", ...emerald },
  REFUSE: { label: "Refuse", ...rose },
  EXPIRE: { label: "Expire", ...amber },
  CONVERTI: { label: "Converti", ...violet },
};

export const FALLBACK_THEME: StatutTheme = { label: "Inconnu", ...slate };

export function themeFor(statut: string): StatutTheme {
  return STATUT_THEME[statut] ?? { ...FALLBACK_THEME, label: statut };
}

/** Ordre d'affichage des filtres de statut. */
export const FACTURE_STATUTS = [
  "BROUILLON",
  "ENVOYEE",
  "PARTIELLEMENT_PAYEE",
  "PAYEE",
  "EN_RETARD",
  "ANNULEE",
] as const;

export const DEVIS_STATUTS = [
  "BROUILLON",
  "ENVOYE",
  "ACCEPTE",
  "REFUSE",
  "EXPIRE",
  "CONVERTI",
] as const;

/** Statuts qui meritent un point qui pulse (action requise). */
export const STATUTS_URGENTS = new Set(["EN_RETARD", "EXPIRE"]);
