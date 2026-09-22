"use client";

import { motion } from "motion/react";
import { EASE } from "./motion";
import { IconSearch } from "./icons";

/** Barre regroupant les puces de filtre (a gauche) et la recherche (a droite). */
export function FilterBar({
  children,
  query,
  onQueryChange,
  placeholder,
  /** Couleur de focus du champ, classes completes. */
  focus = "focus:border-violet-400 focus:ring-violet-500/10 group-focus-within:text-violet-500",
}: {
  children: React.ReactNode;
  query: string;
  onQueryChange: (v: string) => void;
  placeholder: string;
  focus?: string;
}) {
  const [borderFocus, ringFocus, iconFocus] = focus.split(" ");

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.25, ease: EASE }}
      className="flex flex-col gap-3 rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-neutral-200/70 backdrop-blur lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>

      <div className="group relative lg:w-72">
        <IconSearch
          className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 transition-colors duration-200 ${iconFocus}`}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-sm text-neutral-800 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:ring-4 ${borderFocus} ${ringFocus}`}
        />
      </div>
    </motion.section>
  );
}

export function FilterChip({
  label,
  count,
  actif,
  onClick,
  classesActif,
  classesInactif,
}: {
  label: string;
  count: number;
  actif: boolean;
  onClick: () => void;
  classesActif: string;
  classesInactif: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      aria-pressed={actif}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
        actif ? `${classesActif} shadow-md` : classesInactif
      }`}
    >
      {label}
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
          actif ? "bg-white/20" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {count}
      </span>
    </motion.button>
  );
}
