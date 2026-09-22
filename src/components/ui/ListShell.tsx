"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { EASE, listVariants, rowVariants } from "./motion";
import { IconArrowRight } from "./icons";

/** Tableau (>= md). Les cartes mobiles sont rendues par <CardSection>. */
export function TableSection({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
      className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200/70 md:block"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gradient-to-r from-neutral-50 to-neutral-100/60 text-left">
            {headers.map((h) => (
              <th
                key={h}
                className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <motion.tbody variants={listVariants} initial="hidden" animate="show">
          {/* Pas de `popLayout` / `layout` ici : ils enveloppent chaque ligne dans
              un element de mesure, imbrication invalide a l'interieur d'un <tbody>. */}
          <AnimatePresence initial={false}>{children}</AnimatePresence>
        </motion.tbody>
      </table>
      {empty}
    </motion.section>
  );
}

/** Ligne de tableau : entree decalee, survol teinte. */
export function Row({
  children,
  hover = "hover:bg-violet-50/40",
}: {
  children: React.ReactNode;
  hover?: string;
}) {
  return (
    <motion.tr
      variants={rowVariants}
      exit="exit"
      className={`group border-t border-neutral-100 transition-colors duration-200 ${hover}`}
    >
      {children}
    </motion.tr>
  );
}

/**
 * Premiere cellule : lien vers le detail, avec liseré de couleur qui se deploie
 * et fleche qui glisse au survol de la ligne.
 */
export function CellLink({
  href,
  label,
  accent,
  hoverText = "hover:text-violet-700",
}: {
  href: string;
  label: string;
  /** Degrade du liseré, classes completes. */
  accent: string;
  hoverText?: string;
}) {
  return (
    <td className="relative px-5 py-3.5">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-gradient-to-b ${accent} transition-transform duration-300 group-hover:scale-y-100`}
      />
      <Link
        href={href}
        className={`inline-flex items-center gap-1.5 font-medium text-neutral-900 transition-colors ${hoverText}`}
      >
        {label}
        <IconArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
      </Link>
    </td>
  );
}

/** Cellule de texte standard. */
export function Cell({
  children,
  className = "text-neutral-700",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-5 py-3.5 ${className}`}>{children}</td>;
}

/** Liste de cartes (< md). */
export function CardSection({
  children,
  empty,
}: {
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <motion.section
      variants={listVariants}
      initial="hidden"
      animate="show"
      className="space-y-3 md:hidden"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {children}
      </AnimatePresence>
      {empty && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200/70">{empty}</div>
      )}
    </motion.section>
  );
}

/** Carte mobile cliquable, avec bandeau de couleur en tete. */
export function Card({
  href,
  accent,
  children,
}: {
  href: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div layout variants={rowVariants} exit="exit">
      <Link
        href={href}
        className="block overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200/70 transition-transform duration-200 active:scale-[0.99]"
      >
        <span
          aria-hidden
          className={`-mx-4 -mt-4 mb-3 block h-1 bg-gradient-to-r ${accent}`}
        />
        {children}
      </Link>
    </motion.div>
  );
}

/** Petite paire libelle / valeur utilisee dans les cartes mobiles. */
export function CardField({
  label,
  value,
  align = "left",
  className = "text-neutral-900",
}: {
  label: string;
  value: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <p className="text-[11px] uppercase tracking-wider text-neutral-400">{label}</p>
      <p className={`font-semibold tabular-nums ${className}`}>{value}</p>
    </div>
  );
}

/** Pied de liste : nombre d'elements affiches. */
export function ListFooter({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="px-1 text-xs text-neutral-500"
    >
      {children}
    </motion.p>
  );
}
