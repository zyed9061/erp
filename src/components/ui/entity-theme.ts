// Identite couleur par section de l'application.
// Chaque onglet a sa famille : le degrade de la banniere, la teinte de survol des
// lignes et la couleur de focus des champs en decoulent.
// Classes ecrites en entier pour rester detectables par Tailwind.

export type EntityTheme = {
  hero: string;
  heroGlow: string;
  actionText: string;
  /** Degrade des vignettes / liseres de ligne. */
  accent: string;
  rowHover: string;
  linkHover: string;
  chipActive: string;
  chipInactive: string;
  /** "border ring icon" : lus dans l'ordre par <FilterBar>. */
  focus: string;
  emptyAccent: string;
  emptyLink: string;
};

export const ENTITY: Record<string, EntityTheme> = {
  dashboard: {
    hero: "from-violet-600 via-purple-600 to-indigo-600",
    heroGlow: "shadow-purple-600/20",
    actionText: "text-purple-700",
    accent: "from-violet-500 to-purple-500",
    rowHover: "hover:bg-violet-50/40",
    linkHover: "hover:text-violet-700",
    chipActive: "bg-violet-600 text-white",
    chipInactive: "text-violet-700 hover:bg-violet-50",
    focus: "focus:border-violet-400 focus:ring-violet-500/10 group-focus-within:text-violet-500",
    emptyAccent: "from-violet-100 to-purple-100 text-violet-500 ring-violet-200/60",
    emptyLink: "text-violet-700 hover:bg-violet-50",
  },
  clients: {
    hero: "from-sky-500 via-blue-600 to-indigo-600",
    heroGlow: "shadow-blue-600/20",
    actionText: "text-blue-700",
    accent: "from-sky-500 to-blue-500",
    rowHover: "hover:bg-sky-50/50",
    linkHover: "hover:text-blue-700",
    chipActive: "bg-blue-600 text-white",
    chipInactive: "text-blue-700 hover:bg-sky-50",
    focus: "focus:border-sky-400 focus:ring-sky-500/10 group-focus-within:text-sky-500",
    emptyAccent: "from-sky-100 to-blue-100 text-blue-500 ring-sky-200/60",
    emptyLink: "text-blue-700 hover:bg-sky-50",
  },
  produits: {
    hero: "from-teal-500 via-emerald-600 to-green-600",
    heroGlow: "shadow-emerald-600/20",
    actionText: "text-emerald-700",
    accent: "from-teal-500 to-emerald-500",
    rowHover: "hover:bg-emerald-50/50",
    linkHover: "hover:text-emerald-700",
    chipActive: "bg-emerald-600 text-white",
    chipInactive: "text-emerald-700 hover:bg-emerald-50",
    focus:
      "focus:border-emerald-400 focus:ring-emerald-500/10 group-focus-within:text-emerald-500",
    emptyAccent: "from-teal-100 to-emerald-100 text-emerald-500 ring-emerald-200/60",
    emptyLink: "text-emerald-700 hover:bg-emerald-50",
  },
  devis: {
    hero: "from-amber-500 via-orange-500 to-rose-500",
    heroGlow: "shadow-orange-500/20",
    actionText: "text-orange-700",
    accent: "from-amber-500 to-orange-500",
    rowHover: "hover:bg-amber-50/50",
    linkHover: "hover:text-orange-700",
    chipActive: "bg-orange-500 text-white",
    chipInactive: "text-orange-700 hover:bg-amber-50",
    focus: "focus:border-amber-400 focus:ring-amber-500/10 group-focus-within:text-amber-500",
    emptyAccent: "from-amber-100 to-orange-100 text-orange-500 ring-amber-200/60",
    emptyLink: "text-orange-700 hover:bg-amber-50",
  },
  factures: {
    hero: "from-indigo-600 via-violet-600 to-fuchsia-600",
    heroGlow: "shadow-violet-600/20",
    actionText: "text-violet-700",
    accent: "from-indigo-500 to-violet-500",
    rowHover: "hover:bg-violet-50/40",
    linkHover: "hover:text-violet-700",
    chipActive: "bg-neutral-900 text-white",
    chipInactive: "text-neutral-600 hover:bg-neutral-100",
    focus: "focus:border-violet-400 focus:ring-violet-500/10 group-focus-within:text-violet-500",
    emptyAccent: "from-violet-100 to-fuchsia-100 text-violet-500 ring-violet-200/60",
    emptyLink: "text-violet-700 hover:bg-violet-50",
  },
  avoirs: {
    hero: "from-rose-500 via-pink-600 to-purple-600",
    heroGlow: "shadow-pink-600/20",
    actionText: "text-pink-700",
    accent: "from-rose-500 to-pink-500",
    rowHover: "hover:bg-rose-50/50",
    linkHover: "hover:text-pink-700",
    chipActive: "bg-pink-600 text-white",
    chipInactive: "text-pink-700 hover:bg-rose-50",
    focus: "focus:border-rose-400 focus:ring-rose-500/10 group-focus-within:text-rose-500",
    emptyAccent: "from-rose-100 to-pink-100 text-pink-500 ring-rose-200/60",
    emptyLink: "text-pink-700 hover:bg-rose-50",
  },
};
