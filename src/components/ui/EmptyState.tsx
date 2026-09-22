"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { EASE } from "./motion";
import { IconEmptyBox, IconPlus } from "./icons";

type Props = {
  /** true = filtres actifs : on propose de les reinitialiser plutot que de creer. */
  filtre: boolean;
  onReset: () => void;
  /** Titre quand la liste est vraiment vide. */
  titre: string;
  /** Phrase d'accompagnement quand la liste est vraiment vide. */
  message: string;
  action?: { href: string; label: string };
  /** Degrade de la vignette, classes completes. */
  accent?: string;
  /** Couleur du texte des liens, classes completes. */
  link?: string;
  icon?: React.ReactNode;
};

export function EmptyState({
  filtre,
  onReset,
  titre,
  message,
  action,
  accent = "from-violet-100 to-fuchsia-100 text-violet-500 ring-violet-200/60",
  link = "text-violet-700 hover:bg-violet-50",
  icon,
}: Props) {
  // La vignette flotte en boucle : on la fige en mouvement reduit.
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <motion.span
        animate={reduceMotion ? { y: 0 } : { y: [0, -6, 0] }}
        transition={
          reduceMotion ? { duration: 0 } : { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
        }
        className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ${accent}`}
      >
        {icon ?? <IconEmptyBox className="h-7 w-7" />}
      </motion.span>

      {filtre ? (
        <>
          <p className="text-sm font-medium text-neutral-800">Aucun resultat</p>
          <p className="max-w-xs text-sm text-neutral-500">
            Rien ne correspond a cette recherche ou a ce filtre.
          </p>
          <button
            type="button"
            onClick={onReset}
            className={`mt-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${link}`}
          >
            Reinitialiser les filtres
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-neutral-800">{titre}</p>
          <p className="max-w-xs text-sm text-neutral-500">{message}</p>
          {action && (
            <Link
              href={action.href}
              className={`group mt-1 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${link}`}
            >
              <IconPlus className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" />
              {action.label}
            </Link>
          )}
        </>
      )}
    </motion.div>
  );
}
