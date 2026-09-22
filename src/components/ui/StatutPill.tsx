"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLocale } from "@/i18n/client";
import { STATUTS_URGENTS, themeFor } from "./statut";

export function StatutPill({ statut }: { statut: string }) {
  const theme = themeFor(statut);
  const { t } = useLocale();
  // Libelle traduit (FR/EN/AR) ; repli sur le libelle du theme si la cle manque.
  const cle = `status.${statut}`;
  const traduit = t(cle);
  const label = traduit === cle ? theme.label : traduit;
  const reduceMotion = useReducedMotion();
  // Le point qui pulse boucle indefiniment : on le supprime en mouvement reduit.
  // L'information reste portee par le libelle et la couleur, jamais par la seule
  // animation.
  const urgent = STATUTS_URGENTS.has(statut) && !reduceMotion;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${theme.pill}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {urgent && (
          <motion.span
            className={`absolute inline-flex h-full w-full rounded-full ${theme.dot}`}
            animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${theme.dot}`} />
      </span>
      {label}
    </span>
  );
}
